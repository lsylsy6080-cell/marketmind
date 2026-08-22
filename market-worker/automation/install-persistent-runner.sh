#!/data/data/com.termux/files/usr/bin/bash
set -e

ROOT="$HOME/marketmind/market-worker"

echo "[1/7] project"
cd "$ROOT"

echo "[2/7] install dependencies"
npm install

echo "[3/7] typecheck"
npm run typecheck

echo "[4/7] remove legacy PM2 workers"
pm2 delete market-worker >/dev/null 2>&1 || true
pm2 delete market-worker-runner >/dev/null 2>&1 || true

echo "[5/7] clear stale local runner lock"
rm -f "$ROOT/.market-worker-runner.lock"

echo "[6/7] start multi-loop runner"
pm2 start npm --name market-worker-runner -- run runner

echo "[7/7] save PM2"
pm2 save

echo
pm2 status
echo
echo "Expected:"
echo "  auto-update             online"
echo "  market-worker-runner    online"
echo
echo "Logs:"
echo "  pm2 logs market-worker-runner --lines 80"
