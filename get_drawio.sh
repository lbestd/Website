#!/bin/bash
# Download draw.io and extract static files to static/drawio/
# Usage: ./get_drawio.sh [version]
# Example: ./get_drawio.sh 26.0.4

set -e

VER=${1:-26.0.4}
DEST="static/drawio"
TMP=$(mktemp -d)

echo "Downloading draw.io v${VER}..."
wget -q --show-progress \
    "https://github.com/jgraph/drawio/releases/download/v${VER}/drawio-aio-${VER}.war" \
    -O "${TMP}/drawio.war"

echo "Extracting..."
mkdir -p "${DEST}"
unzip -q "${TMP}/drawio.war" -d "${TMP}/extracted" -x "WEB-INF/*" "META-INF/*"
cp -r "${TMP}/extracted/." "${DEST}/"

rm -rf "${TMP}"
echo "Done! draw.io v${VER} extracted to ${DEST}/"
echo "Now open /notepad and create or open a .drawio file."
