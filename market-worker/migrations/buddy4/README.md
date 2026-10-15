# Buddy4 PostgreSQL migration — stage 1 (non-production)

This folder contains only a **verified** portable migration of the repository's existing on-chain schema. It is **not** a complete replacement for Supabase.

## Why the remaining schema is absent
The repository has dozens of Supabase \`.from(...)\` references and RPC calls, but only one checked-in SQL migration. Table names alone cannot recover types, defaults, composite keys, indexes, Postgres RPC signatures, triggers or row-level-security policies. Generating placeholder tables would create subtle data corruption or runtime failures.

## Safe validation on Buddy4 (Termux)
Prerequisites: PostgreSQL server running, a disposable/new \`marketmind\` DB, checkout of the feature branch. **Do not modify the PM2 runner or production env files yet.**

1. \`cd ~/marketmind/market-worker\`
2. \`node scripts/audit-postgres-schema.mjs > schema-inventory.json\` (local untracked output)
3. \`psql -X -v ON_ERROR_STOP=1 -d marketmind -f scripts/postgres-compatibility-smoke.sql\`
4. \`psql -X -v ON_ERROR_STOP=1 -d marketmind -f migrations/buddy4/001_onchain_snapshots_portable.sql\` (only on a confirmed disposable DB)
5. \`node scripts/audit-postgres-schema.mjs --check-db\` (expected nonzero exit until all tables and RPC functions exist)

## Work remaining before any cutover
- Reconstruct **each** table from all writers/readers, original DDL when recoverable, plus keys used by \`upsert(onConflict:...)\`. Review schema manually before applying.
- Reconstruct and test all invoked RPCs with their argument names, types and return shapes.
- Validate the web app separately: it uses Supabase admin and SSR clients, not only server-side worker calls.
- Decide whether to use PostgREST behind a private, authenticated HTTPS API or migrate calls to parameterized SQL. PostgREST is **not** a complete Supabase replacement.
- Keep PostgreSQL bound to loopback; do not expose port 5432 to the Internet or copy Supabase service-role keys.
- Arrange off-device backups, Android/Termux uptime safeguards, and production rollback plan.

No source runtime dependencies, credentials, PM2 processes, deployed services or \`main\` files are changed by these stage-one additions.
