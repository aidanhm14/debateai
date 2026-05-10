#!/usr/bin/env bash
# Install repo-canonical git hooks into .git/hooks/.
# Run once per fresh clone:  bash scripts/install-hooks.sh
#
# Why we don't use `git config core.hooksPath scripts/hooks` directly:
# that would also need to be set once per clone, and a couple of CLI
# agents the team uses refuse to mutate git config. Copying the hook
# files in is the lowest-friction alternative.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/scripts/hooks"
DEST="$(git rev-parse --git-common-dir)/hooks"

if [ ! -d "$SRC" ]; then
  echo "error: $SRC missing — are you running this from the repo root?" >&2
  exit 1
fi

mkdir -p "$DEST"

for HOOK in "$SRC"/*; do
  [ -f "$HOOK" ] || continue
  NAME="$(basename "$HOOK")"
  cp "$HOOK" "$DEST/$NAME"
  chmod +x "$DEST/$NAME"
  echo "installed: $DEST/$NAME"
done

echo "done. test it: stage a small HTML change in app/ and watch sw.js auto-bump on commit."
