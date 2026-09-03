#!/bin/bash
# build-deepseek.sh — 从官方 runtime（pnpm install --prod 产物）组装 deepseek_harness FPK。
# 用法： ./scripts/build-deepseek.sh <out-dir>
# 前置： build/deepseek_harness/runtime 已含 pnpm install --prod 结果。
set -euo pipefail

OUTDIR="${1:?Usage: $0 <out-dir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FNOS="$ROOT/build/deepseek_harness/fnos"
RUNTIME="$ROOT/build/deepseek_harness/runtime"
META="$ROOT/build/deepseek_harness/meta.json"

UPSTREAM=$(node -e "console.log(require('$META').upstream)")
[ -n "$UPSTREAM" ] || { echo "cannot read version from meta.json" >&2; exit 1; }
VERSION="$UPSTREAM"

[ -f "$RUNTIME/node_modules/@deepseek-ai/dsh/lib/bin.js" ] || { echo "runtime not built: run pnpm install --prod in build/deepseek_harness/runtime first" >&2; exit 1; }

mkdir -p "$OUTDIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

build_one() {
  local plat="$1"
  echo "==> deepseek_harness $VERSION for $plat"
  local root="$WORK/pkg-$plat"
  rm -rf "$root" && mkdir -p "$root"

  cp -a "$FNOS/cmd" "$root/cmd"
  cp -a "$FNOS/config" "$root/config"
  cp -a "$FNOS/ui" "$root/ui"
  cp "$FNOS/manifest" "$root/manifest"
  cp "$FNOS/ICON.PNG" "$root/ICON.PNG"
  cp "$FNOS/ICON_256.PNG" "$root/ICON_256.PNG" 2>/dev/null || true
  [ -d "$FNOS/wizard" ] && cp -a "$FNOS/wizard" "$root/wizard"

  # runtime：pnpm node_modules 依赖相对符号链接（指向 .pnpm/），tar 保留符号链接，fnOS 解压后仍有效。
  local rt="$WORK/runtime-$plat"
  rm -rf "$rt" && mkdir -p "$rt"
  (cd "$RUNTIME" && tar -cf - . 2>/dev/null) | (cd "$rt" && tar -xf -)
  [ -f "$rt/node_modules/@deepseek-ai/dsh/lib/bin.js" ] || { echo "runtime flatten failed" >&2; exit 1; }

  mkdir -p "$root"
  mv "$rt" "$root/runtime"
  chmod -R u+rwX "$root/runtime" 2>/dev/null || true
  chmod +x "$root/runtime/node_modules/.bin/dsh" 2>/dev/null || true
  (cd "$root" && tar -czf "$WORK/app.tgz" runtime)

  sed -i "s/^version.*/version         = ${VERSION}/" "$root/manifest"
  if grep -q '^platform' "$root/manifest"; then
    sed -i "s/^platform.*/platform        = ${plat}/" "$root/manifest"
  else
    echo "platform        = ${plat}" >> "$root/manifest"
  fi
  cp "$WORK/app.tgz" "$root/app.tgz"
  local sum
  sum=$(md5sum "$root/app.tgz" | cut -d' ' -f1)
  if grep -q '^checksum' "$root/manifest"; then
    sed -i "s/^checksum.*/checksum        = ${sum}/" "$root/manifest"
  else
    echo "checksum        = ${sum}" >> "$root/manifest"
  fi
  chmod +x "$root/cmd"/* "$root/cmd/main" 2>/dev/null || true

  local fpk="$OUTDIR/deepseek_harness_${VERSION}_${plat}.fpk"
  (cd "$root" && tar -czf "$fpk" .)
  local sha SIZE
  sha=$(sha256sum "$fpk" | cut -d' ' -f1)
  SIZE=$(stat -c%s "$fpk")
  echo "built: $fpk (sha256=$sha size=$SIZE)"
  echo "{\"file\": \"${fpk##*/}\", \"sha256\": \"$sha\", \"size\": $SIZE, \"platform\": \"$plat\"}" \
    > "$OUTDIR/deepseek_harness-$plat.fpk-info.json"
}

# BUILD_ARCH=x86|arm|all（默认 x86；arm CI 传 arm 只打 arm 包）
case "${BUILD_ARCH:-x86}" in
  arm) build_one arm ;;
  all) build_one x86; build_one arm ;;
  *) build_one x86 ;;
esac
