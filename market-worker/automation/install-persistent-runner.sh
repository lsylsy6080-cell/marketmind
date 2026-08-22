#!/data/data/com.termux/files/usr/bin/bash
set -e

ROOT="$HOME/marketmind/market-worker"

echo "[1/6] project"
cd "$ROOT"

echo "[2/6] install dependencies"
npm install

echo "[3/6] typecheck"
npm run typecheck

echo "[4/6] remove legacy PM2 worker"
pm2 delete market-worker >/dev/null 2>&1 || true
pm2 delete market-worker-runner >/dev/null 2>&1 || true

echo "[5/6] start persistent runner"
pm2 start npm --name market-worker-runner -- run runner

echo "[6/6] save PM2"
pm2 save

echo
pm2 status
echo
echo "Done. Use:"
echo "  pm2 logs market-worker-runner --lines 50"
