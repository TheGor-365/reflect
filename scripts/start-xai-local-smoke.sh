#!/usr/bin/env bash
set -euo pipefail

# Run from the worktree where this script lives.
cd "$(dirname "$0")/.."
if [ "${ASDF_NODEJS_VERSION:-}" = "" ]; then
  export ASDF_NODEJS_VERSION=22.23.4
fi

key_dir="$HOME/.config/reflect/keys"
key_file="$key_dir/reflect-dev"
umask 077
mkdir -p "$key_dir"
chmod 700 "$key_dir"

# Never chmod or read a symlink or non-regular secret file.
if [ -L "$key_file" ] || { [ -e "$key_file" ] && [ ! -f "$key_file" ]; }; then
  echo "Unsafe credential path. Refusing to alter it." >&2
  exit 1
fi

if [ ! -f "$key_file" ]; then
  echo "One-time local setup: paste Reflect-dev xAI API key into THIS terminal only."
  echo "The key is hidden while typing, and will never be saved in GitHub or Vite."
  IFS= read -r -s -p "Reflect-dev key (hidden input): " xai_key
  echo
  if [[ ! "$xai_key" =~ ^xai-[A-Za-z0-9_-]{20,250}$ ]]; then
    unset xai_key
    echo "Key format not recognized; no file created." >&2
    exit 1
  fi
  printf "%s" "$xai_key" > "$key_file"
  unset xai_key
fi
chmod 600 "$key_file"

# Only the fixed local synthetic request is permitted. This never touches
# the already-running owner Test Auth 9099, Firestore 18081 or backup 18080.
export REFLECT_XAI_DEV_ONLY=enabled
export REFLECT_XAI_ALLOW_ONE_LIVE_REQUEST=approved
exec node server/ai/localXaiSmoke.cjs
