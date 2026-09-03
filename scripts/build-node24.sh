#!/bin/bash
# build-node24.sh — 从官方 nodejs.org 打包 nodejs_v24 运行时 .fpk
# 用法： ./scripts/build-node24.sh <out-dir>
# 输入： build/nodejs_v24/meta.json（upstream 决定版本）
# app.tgz 内放官方 node.tar.xz + config/，由 install_callback 在 fnOS 上解压到应用目录。
set -euo pipefail

OUTDIR="${1:?Usage: $0 <out-dir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FNOS="$ROOT/build/nodejs_v24/fnos"

UPSTREAM=$(node -e "console.log(require('$ROOT/build/nodejs_v24/meta.json').upstream)")
[ -n "$UPSTREAM" ] || { echo "cannot read version from meta.json" >&2; exit 1; }
VERSION="$UPSTREAM"

mkdir -p "$OUTDIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

build_one() {
  local arch="$1" node_arch="$2" plat="$3"
  echo "==> nodejs_v24 $VERSION for $arch"
  local dl="$WORK/dl-$arch"
  mkdir -p "$dl" && cd "$dl"
  node -e "
    (async()=>{
      const fs=require('fs');
      const u='https://nodejs.org/dist/v${VERSION}/node-v${VERSION}-linux-${node_arch}.tar.xz';
      const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
      if(!r.ok) throw new Error('download '+r.status+' '+u);
      const ws=fs.createWriteStream('node.tar.xz');
      for await (const c of r.body) ws.write(c);
      ws.end(); await new Promise(res=>ws.on('finish',res));
    })().catch(e=>{console.error(e.message);process.exit(1)});
  "
  local size
  size=$(stat -c%s node.tar.xz)
  [ "$size" -ge 20971520 ] || { echo "node.tar.xz too small ($size), abort" >&2; exit 1; }

  # app.tgz：node.tar.xz + config/（与 shuangji66 约定一致）
  local root="$WORK/pkg-$arch"
  rm -rf "$root" && mkdir -p "$root"
  cp node.tar.xz "$root/node.tar.xz"
  cp -a "$FNOS/config" "$root/config"
  (cd "$root" && tar -czf "$WORK/app-$arch.tgz" .)
  cd "$ROOT"
}

build_one x86 x64 x86
build_one arm arm64 arm

for pair in "x86:x86" "arm:arm"; do
  arch="${pair%%:*}"; plat="${pair##*:}"
  local_pkg="$WORK/package-$arch"
  rm -rf "$local_pkg" && mkdir -p "$local_pkg"
  cp "$WORK/app-$arch.tgz" "$local_pkg/app.tgz"
  cp -a "$FNOS/cmd" "$local_pkg/cmd"
  chmod +x "$local_pkg/cmd"/* 2>/dev/null || true
  # manifest：版本/平台/checksum
  sed -i "s/^version.*/version         = ${VERSION}/" "$local_pkg/manifest" 2>/dev/null || true
  cp "$FNOS/manifest" "$local_pkg/manifest"
  sed -i "s/^version.*/version         = ${VERSION}/" "$local_pkg/manifest"
  if grep -q '^platform' "$local_pkg/manifest"; then
    sed -i "s/^platform.*/platform        = ${plat}/" "$local_pkg/manifest"
  else
    echo "platform        = ${plat}" >> "$local_pkg/manifest"
  fi
  sum=$(md5sum "$local_pkg/app.tgz" | cut -d' ' -f1)
  if grep -q '^checksum' "$local_pkg/manifest"; then
    sed -i "s/^checksum.*/checksum        = ${sum}/" "$local_pkg/manifest"
  else
    echo "checksum        = ${sum}" >> "$local_pkg/manifest"
  fi
  # 运行时应用图标（源内统一提供一个）
  [ -f "$FNOS/ICON.PNG" ] && cp "$FNOS/ICON.PNG" "$local_pkg/ICON.PNG"
  [ -f "$FNOS/ICON_256.PNG" ] && cp "$FNOS/ICON_256.PNG" "$local_pkg/ICON_256.PNG"
  fpk="$OUTDIR/nodejs_v24_${VERSION}_${plat}.fpk"
  (cd "$local_pkg" && tar -czf "$fpk" .)
  sha=$(sha256sum "$fpk" | cut -d' ' -f1)
  SIZE=$(stat -c%s "$fpk")
  echo "built: $fpk (sha256=$sha size=$SIZE)"
  echo "{\"file\": \"${fpk##*/}\", \"sha256\": \"$sha\", \"size\": $SIZE, \"platform\": \"$plat\"}" \
    > "$OUTDIR/nodejs_v24-$plat.fpk-info.json"
done