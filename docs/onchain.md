# Bitcoin public on-chain collection

The worker discovers every BTC daily metric currently available in the **Coin Metrics Community** catalog, requests the last 40 days, and preserves the original response and catalog. In validation this included 31 daily metrics (active/balance addresses, transactions, transfers, supply/issuance, fees, MVRV, market cap, reference prices, exchange flows/reserves and ROI). Availability can change. Exchange labels cover the provider's identified universe, not every exchange. MVRV is not MVRV Z-Score.

Additional sources:

- Blockchain.com stats: blocks, intervals, supply, issuance, estimated/raw transferred value, fees and miner revenue.
- Blockchain.com charts: UTXO count, addresses, transactions, transactions/block, block size, confirmation time, transaction volume/fees, miner revenue, hashrate, difficulty, supply, nonpopular transactions, output volume and transaction rate. The last 40 days of provider samples are retained.
- mempool.space: unconfirmed count/size/fees, five recommended fee levels, estimated hashrate, current difficulty and retarget progress/change/timing.

The current snapshot has **90 original and derived entries**, including aliases; this is not 90 independent measurements. Raw mempool fee distributions and hashrate histories are also retained. No API key is needed for these source APIs. Required HTTPS hosts: `community-api.coinmetrics.io`, `blockchain.info`, `api.blockchain.info`, `mempool.space`.

## Database and operation

Apply `market-worker/migrations/20261008_onchain_snapshots.sql` using Supabase SQL Editor. The table uses hourly BTC keys and a repeatable upsert. RLS denies anonymous/authenticated access; the server and worker use the existing service-role binding. No source API credentials or SQL administration credentials are embedded in code.

From `market-worker`, using the cloud proxy:

```sh
NODE_USE_ENV_PROXY=1 npm run onchain:dry
NODE_USE_ENV_PROXY=1 npm run onchain:run
NODE_USE_ENV_PROXY=1 npm run onchain:run -- --force
npm run onchain:test
NODE_USE_ENV_PROXY=1 npm run runner
```

Normal runner and single-run entry points invoke collection before market analysis. Collection is cached for 60 minutes when all endpoints responded, or 10 minutes after a partial failure. `ONCHAIN_ENABLED=false` opts out of runner collection; standalone commands remain available. The process must be started again in a fresh cloud task. A public request times out after 20 seconds; requests are sequential to limit load. If every source fails, no snapshot is written; endpoint errors do not discard successful providers. Failed/null observations remain visible rather than turning into zero.

One snapshot per asset/hour is updated on retry. A retry within the same hour updates that hour's snapshot; it does not create a fictitious second hourly observation. UI requests the latest raw snapshot separately from compact 30-day history, so original source history is not downloaded for every hour.

## Analysis and limitations

Background score averages usable valuation (MVRV), exchange netflow relative to reserves, and 7-day active-address average change versus the preceding 7 days. Only matched exchange observation dates are subtracted. Daily values older than 72 hours or dated in the future are excluded. A network score requires 14 contiguous complete days. No data means a null score, not neutral 50. Coverage/confidence is capped at 60 and is not a calibrated success probability. Fees and hashrate alone do not infer market direction.

The final decision stores the latest (under 2-hour-old) snapshot as an **onchain context** in its summary, reasons and score_details. Deduplication includes the snapshot key. Existing trading weights and V2 entry decisions are unchanged; this heuristic has not been validated for modifying trades.

Provider anomalies remain in raw payloads for inspection. For example, negative Blockchain.com aggregate fees and zero miner revenue alongside positive issuance are rejected as normalized measurements. Issuance and aggregate BTC statistics expressed in satoshis are converted before display. A successful HTTP response does not imply every metric is available or current; each displayed metric carries its own observed time and missing/stale state.

SOPR, labeled whales, long/short-term holder cohorts, MVRV Z-Score and ETF flows are not supplied by the validated endpoints. They are not invented or silently substituted. Additional genuinely public data sources can be added after validating methodology, units and availability. Free public APIs are subject to availability/rate limits, and access can change.
