#!/usr/bin/env bash
# Generate an RSA-2048 keypair for the Counter chrome extension.
#
# Why: by default Chrome assigns each unpacked install a random
# extension ID, and the Web Store assigns a different one again. This
# breaks any OAuth client whose "Item ID" was pinned to one of them.
# Embedding the keypair's public key in manifest.json's `key` field
# makes the ID deterministic across both surfaces.
#
# Usage:
#   ./app/extension/scripts/gen-extension-key.sh
#
# Output:
#   - app/extension/.local/extension.key.pem   (private key, gitignored)
#   - prints the base64-encoded public key to stdout
#
# Then: paste the public key into app/extension/manifest.json as a
# top-level "key" field (same indent level as "name"), reload the
# extension at chrome://extensions, copy the new (deterministic) ID,
# and use it as the "Item ID" when creating the Google Cloud OAuth
# client (see GOOGLE_CLOUD_SETUP.md, step 4).
#
# Requirements: openssl. Default on macOS and most Linux distros.

set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$EXT_DIR/.local"
KEY_FILE="$LOCAL_DIR/extension.key.pem"

if [[ -f "$KEY_FILE" ]]; then
  echo "Existing key found at $KEY_FILE." >&2
  echo "Re-using it; delete the file and re-run if you want to rotate the key." >&2
  echo "" >&2
else
  mkdir -p "$LOCAL_DIR"
  # 0700 so the dir is owner-only-readable (the .pem file too)
  chmod 700 "$LOCAL_DIR"
  openssl genrsa -out "$KEY_FILE" 2048 2>/dev/null
  chmod 600 "$KEY_FILE"
  echo "Wrote private key to $KEY_FILE (gitignored)" >&2
  echo "" >&2
fi

# DER-encode the public key, base64 it, strip newlines.
PUBKEY="$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | openssl base64 -A)"

if [[ -z "$PUBKEY" ]]; then
  echo "Failed to derive public key. Is openssl installed?" >&2
  exit 1
fi

cat <<EOF >&2
Public key (paste into app/extension/manifest.json as a top-level
"key" field — at the same indent level as "name"):

EOF
echo "$PUBKEY"
cat <<'EOF' >&2

Next:
  1. Open app/extension/manifest.json
  2. Add the "key" field at the top, e.g.:
       {
         "manifest_version": 3,
         "name": "Counter: Oral Exam Trainer (by DebateIt)",
         "key": "<paste here>",
         ...
       }
  3. Reload the extension at chrome://extensions (or remove + Load unpacked)
  4. Copy the new extension ID from chrome://extensions
  5. Use it as the "Item ID" in Google Cloud → Credentials → OAuth client
     (see app/extension/GOOGLE_CLOUD_SETUP.md, step 4)

Backup the .pem file somewhere safe. If you lose it you cannot
self-sign offline .crx builds with this same identity.
EOF
