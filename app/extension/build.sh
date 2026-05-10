#!/usr/bin/env bash
# Build a Chrome Web Store-ready .zip of the Counter extension.
#
# Usage:
#   ./app/extension/build.sh
#
# Output:
#   app/extension/dist/counter-vX.Y.Z.zip
#
# What it does:
#   1. Reads the version from manifest.json so the zip is named consistently.
#   2. Stages the extension into a clean dir so junk (.DS_Store, the dist/
#      dir itself, the build script, source-of-truth docs) never gets shipped
#      to users — the Web Store rejects zips that contain leftover dev files
#      or that have the extension nested under a parent folder.
#   3. Validates the manifest with `node -e` (catches trailing commas etc.).
#   4. Zips with the manifest at the ARCHIVE ROOT — Chrome rejects zips
#      where manifest.json sits inside a subdirectory.
#   5. Prints a one-line size + checksum so you can confirm two machines
#      built byte-identical artifacts.
#
# Requirements: bash, jq (or python3), zip. All are present on macOS by
# default; on Linux install jq with `apt install jq`.

set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$EXT_DIR/dist"
STAGE_DIR="$EXT_DIR/.stage"

# ── version ─────────────────────────────────────────────────────────
if command -v jq >/dev/null 2>&1; then
  VERSION="$(jq -r .version "$EXT_DIR/manifest.json")"
else
  VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$EXT_DIR/manifest.json")"
fi
[[ -z "$VERSION" || "$VERSION" == "null" ]] && { echo "Could not read version from manifest.json"; exit 1; }

ARCHIVE_NAME="counter-v${VERSION}.zip"
ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"

# ── manifest validation ─────────────────────────────────────────────
node -e "JSON.parse(require('fs').readFileSync('$EXT_DIR/manifest.json','utf8'))" \
  || { echo "manifest.json failed JSON parse"; exit 1; }

# ── stage ───────────────────────────────────────────────────────────
rm -rf "$STAGE_DIR" "$ARCHIVE_PATH"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

# Whitelist of paths that ship to users. Anything not in this list is
# excluded from the zip. Adding a new top-level file? Add it here too.
SHIP_PATHS=(
  manifest.json
  background.js
  content.js
  overlay.css
  sidepanel.html
  sidepanel.js
  icons
)

for p in "${SHIP_PATHS[@]}"; do
  if [[ -e "$EXT_DIR/$p" ]]; then
    cp -R "$EXT_DIR/$p" "$STAGE_DIR/"
  else
    echo "warning: ship path missing: $p"
  fi
done

# Strip macOS metadata that creeps in via cp -R.
find "$STAGE_DIR" -name ".DS_Store" -delete
find "$STAGE_DIR" -name "._*" -delete

# ── zip from inside the stage dir so manifest.json sits at root ─────
(
  cd "$STAGE_DIR"
  zip -rq "$ARCHIVE_PATH" .
)

# ── verify the zip has manifest.json at the root, not nested ────────
# Look for a line whose final whitespace-separated field is exactly
# "manifest.json" (no path prefix). awk handles the variable-width
# columns from `unzip -l` more reliably than a regex.
unzip -l "$ARCHIVE_PATH" | awk '{print $NF}' | grep -qx 'manifest.json' \
  || { echo "manifest.json is not at the zip root — Chrome will reject this"; exit 1; }

# ── cleanup ─────────────────────────────────────────────────────────
rm -rf "$STAGE_DIR"

# ── report ──────────────────────────────────────────────────────────
SIZE_BYTES=$(stat -f%z "$ARCHIVE_PATH" 2>/dev/null || stat -c%s "$ARCHIVE_PATH")
SHA=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')

cat <<EOF

  Counter v${VERSION}
  ${ARCHIVE_PATH}
  ${SIZE_BYTES} bytes
  sha256:${SHA}

Next:
  1. Upload "${ARCHIVE_NAME}" at chrome.google.com/webstore/devconsole
  2. Paste the listing copy from app/extension/STORE_LISTING.md
  3. Confirm https://debateai.com/privacy-extension is live
  4. Submit for review

EOF
