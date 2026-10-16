#!/data/data/com.termux/files/usr/bin/bash
# Buddy4 local backup. Never deletes previous backups or mutates marketmind DB.
set -euo pipefail
umask 077
DB="marketmind"
DIR="$HOME/marketmind-backups"
mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$DIR/.marketmind-$STAMP.dump.part"
OUT="$DIR/marketmind-$STAMP.dump"
trap 'rm -f "$TMP"' EXIT
pg_dump -Fc -d "$DB" -f "$TMP"
pg_restore -l "$TMP" >/dev/null
mv "$TMP" "$OUT"
trap - EXIT
sha256sum "$OUT" > "$OUT.sha256"
echo "BACKUP_OK $OUT"
ls -lh "$OUT" "$OUT.sha256"
echo "Note: This is a local backup only. Copy it off the phone to protect against device loss."
