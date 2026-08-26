#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DELIVERY_DIR="$ROOT_DIR/delivery"
STAGING_DIR=$(mktemp -d)
SOURCE_DIR="$STAGING_DIR/jeffrey-private-pwa"
SOURCE_ZIP="$DELIVERY_DIR/jeffrey-private-pwa-source.zip"

cleanup() { rm -rf "$STAGING_DIR"; }
trap cleanup EXIT

mkdir -p "$DELIVERY_DIR" "$SOURCE_DIR"

rsync -a \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'delivery/' \
  --exclude 'node_modules/' \
  --exclude '.pnpm-store/' \
  --exclude '.next/' \
  --exclude '.vinext/' \
  --exclude '.wrangler/' \
  --exclude 'dist/' \
  --exclude 'outputs/' \
  --exclude 'work/' \
  --exclude 'coverage/' \
  --exclude 'private-data/' \
  --exclude 'apps/jeffrey-local/.build/' \
  --exclude '*.pem' \
  --exclude '*.tsbuildinfo' \
  --exclude '.DS_Store' \
  "$ROOT_DIR/" "$SOURCE_DIR/"

# A customer must create or select a Site in their own account. Never bind the
# handoff archive to the developer's existing Sites project.
mkdir -p "$SOURCE_DIR/.openai"
printf '%s\n' '{"project_id":null,"d1":null,"r2":null}' > "$SOURCE_DIR/.openai/hosting.json"

if rg -n --hidden \
  -g '!**/.env*' \
  -g '!**/node_modules/**' \
  -g '!**/.build/**' \
  '(sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{16,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)' \
  "$SOURCE_DIR" >/dev/null; then
  printf 'Refusing to package: a credential-like value was found.\n' >&2
  exit 1
fi

rm -f "$SOURCE_ZIP"
ditto -c -k --keepParent "$SOURCE_DIR" "$SOURCE_ZIP"
(cd "$DELIVERY_DIR" && shasum -a 256 "$(basename "$SOURCE_ZIP")" > "$(basename "$SOURCE_ZIP").sha256")

printf 'Built %s\n' "$SOURCE_ZIP"
