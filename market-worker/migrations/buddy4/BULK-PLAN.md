# Bulk schema reconstruction (66 remaining tables + RPC)

This workstream batches **discovery and reconciliation** before writing DDL. The repository does not contain Supabase's complete schema; do not guess types or assume a table with a matching name is compatible.

## Generate one report for all tables and functions
From `market-worker` in the separate Buddy4 checkout:

```sh
node scripts/plan-buddy4-schema.mjs > "$HOME/buddy4-schema-plan.json"
node -e "const p=require(process.env.HOME+'/buddy4-schema-plan.json');console.log({scanned:p.sourceFilesScanned,tables:p.tableReferences,remaining:p.notYetMigrated,rpcs:p.rpcs.length})"
```

All entries are **candidate clues only**. Source parsing cannot determine types, `NOT NULL`, defaults, composite keys, FK references, SQL function bodies, PostgREST grants, triggers, policy definitions, or dynamic payloads with full certainty. The tool does not write any database object.

## Acceptance gate before all-at-once migration
- Each table has independently reviewed DDL based on all writer payloads and reader queries.
- All `onConflict` columns have matching unique or primary constraints.
- Every invoked RPC has matching name, argument signature, function semantics and permissions.
- Test DB restores all previously validated migrations; new batch DDL applies atomically with `ON_ERROR_STOP=1` or is rolled back.
- Integration tests cover worker jobs, Next.js API responses, authentication and private HTTPS access.
- No production PM2, Vercel env or main branch edits prior to sign-off.

Use a **dedicated temporary database** for the batch tests, not the running `marketmind` DB. The existing `market_candles` collector must keep running during development.
