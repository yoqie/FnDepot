#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="${ROOT}/build/deepseek-harness"
ARCH="${1:-x86}"
VERSION="${2:-}"

case "${ARCH}" in
  arm64|aarch64|arm) APP_ARCH="arm64"; MANIFEST_ARCH="arm" ;;
  x86|x64|amd64) APP_ARCH="amd64"; MANIFEST_ARCH="x86" ;;
  *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

if [ -z "${VERSION}" ]; then
  VERSION=$(sed -n 's/^version[[:space:]]*=[[:space:]]*//p' "${PKG}/manifest" | head -n1)
fi
[ -n "${VERSION}" ] || { echo "Unable to determine package version" >&2; exit 1; }
[ -f "${PKG}/app.tgz" ] || { echo "app.tgz is missing; run scripts/build-deepseek-harness.sh first" >&2; exit 1; }

sed -i "s/^version.*/version               = ${VERSION}/" "${PKG}/manifest"
sed -i "s/^platform.*/platform              = ${MANIFEST_ARCH}/" "${PKG}/manifest"
rm -rf "${PKG}/ui"
cp -a "${PKG}/app/ui" "${PKG}/ui"
find "${PKG}/cmd" -maxdepth 1 -type f -exec chmod 755 {} +
chmod 755 "${PKG}/app/bin/runner.js"

mkdir -p "${ROOT}/dist"
FPK="${ROOT}/dist/deepseek-harness_${VERSION}_${ARCH}.fpk"
rm -f "${FPK}"
(
  cd "${PKG}"
  tar -cf "${FPK}.tmp" \
    ./manifest \
    ./ICON.PNG \
    ./ICON_256.PNG \
    ./app.tgz \
    ./cmd/ \
    ./config/ \
    ./wizard/ \
    ./ui/ \
    ./DeepSeekHarness.sc
)
gzip -1 "${FPK}.tmp"
mv "${FPK}.tmp.gz" "${FPK}"
echo "${FPK}"
