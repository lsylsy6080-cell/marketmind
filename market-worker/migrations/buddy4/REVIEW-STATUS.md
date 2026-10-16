# Buddy4 migration review status

**Do not run an inferred 66-table CREATE TABLE batch on the live DB.**

Reviewed migration sources:

| Table | Migration | Evidence |
| --- | --- | --- |
| onchain_snapshots | 001 | Existing SQL DDL in source |
| market_candles | 002 | Binance collectors and chart API |
| technical_snapshots | 003 | Technical analyzer writes |
| market_scores | 003 | Market score analyzer writes |
| funding_snapshots | 004 | Funding writer and intelligence/decision readers |

Still outstanding: remaining source-discovered tables and 8 RPC call sites. Existing source reports are heuristic. Names/fields alone cannot establish PostgreSQL types, defaults, indexes, keys, FKs, RLS or RPC implementations. Do **not** manufacture success by creating placeholder tables.

Run read-only inspection:

```sh
node scripts/buddy4-batch-validate.mjs --check-db
```

Once reviewed migrations exist for all schema objects, create a fresh disposable database for integration testing before enabling production wiring. Current PM2 collector and `main` must remain unchanged.
