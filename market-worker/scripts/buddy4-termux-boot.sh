#!/data/data/com.termux/files/usr/bin/bash
# Safe Termux:Boot startup. Deliberately does NOT call pm2 resurrect.
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
LOG="$HOME/buddy4-boot.log"
exec >>"$LOG" 2>&1
echo "=== $(date -Is) Buddy4 boot ==="
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
DBDIR="$HOME/marketmind-db"
PGLOG="$HOME/marketmind-postgres.log"
COLLECTOR="$HOME/marketmind-pg-test/market-worker/scripts/buddy4-candle-collector.mjs"
if [ ! -f "$DBDIR/PG_VERSION" ]; then echo "ERROR: DB cluster missing"; exit 1; fi
if ! pg_isready -q; then pg_ctl -D "$DBDIR" -l "$PGLOG" start || true; fi
ready=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
 if pg_isready -q && [ "$(psql -X -q -t -A -d marketmind -c 'SELECT 1' 2>/dev/null)" = "1" ]; then ready=1; break; fi
 sleep 2
done
if [ "$ready" -ne 1 ]; then echo "ERROR: database not ready"; exit 1; fi
if [ ! -f "$COLLECTOR" ]; then echo "ERROR: collector missing"; exit 1; fi
if pm2 describe buddy4-candle-collector >/dev/null 2>&1; then
 pm2 restart buddy4-candle-collector --update-env
else
 cd "$HOME/marketmind-pg-test/market-worker" || exit 1
 pm2 start "$COLLECTOR" --name buddy4-candle-collector -- --loop --every-seconds=60
fi
# Guard against any other mechanism restoring the obsolete Supabase worker.
if pm2 describe market-worker-runner >/dev/null 2>&1; then pm2 stop market-worker-runner; fi
echo "Buddy4 startup complete"
pm2 list
