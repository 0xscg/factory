#!/usr/bin/env bash
# Nightly Postgres backup -> Cloudflare R2 (architecture §3.4: "a
# compliance product that loses data is dead"). Run from cron/Coolify
# scheduled task. Restore drill monthly — a backup that has never been
# restored is a hope, not a backup.
#
# Required env (Coolify vault):
#   BACKUP_DATABASE_URL  — postgres superuser URL (pg_dump needs full read)
#   R2_ENDPOINT          — https://<account-id>.r2.cloudflarestorage.com
#   R2_BUCKET            — backup bucket name
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — R2 token pair
# Optional:
#   BACKUP_KEEP_DAYS     — local retention (default 3)
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-/tmp/factory-backups}"
OUT="${OUT_DIR}/factory-${STAMP}.dump"
mkdir -p "${OUT_DIR}"

# Custom format: compressed, supports selective pg_restore.
pg_dump --format=custom --no-owner --file="${OUT}" "${BACKUP_DATABASE_URL}"

# Integrity stamp travels with the artifact.
sha256sum "${OUT}" > "${OUT}.sha256"

aws s3 cp "${OUT}" "s3://${R2_BUCKET}/pg/factory-${STAMP}.dump" \
  --endpoint-url "${R2_ENDPOINT}" --only-show-errors
aws s3 cp "${OUT}.sha256" "s3://${R2_BUCKET}/pg/factory-${STAMP}.dump.sha256" \
  --endpoint-url "${R2_ENDPOINT}" --only-show-errors

# Local retention.
find "${OUT_DIR}" -name "factory-*.dump*" -mtime "+${BACKUP_KEEP_DAYS:-3}" -delete

echo "backup complete: factory-${STAMP}.dump ($(du -h "${OUT}" | cut -f1))"
