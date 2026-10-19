# Buddy4 PostgreSQL replacement schema — test only

66 base tables (5 existing + 61 reconstructed), 6 views, 8 RPCs. This is **not** an export of the unavailable original Supabase catalog.

- Full procedure and Buddy4-only commands: [docs/buddy4-migration.md](../../../docs/buddy4-migration.md).
- Source evidence, inferred choices and paper accounting: [SCHEMA-DECISIONS.md](SCHEMA-DECISIONS.md).
- Exact table/column/key/default/FK manifest: [schema-contract.json](schema-contract.json).
- Atomic combined SQL: [FULL_TEST_SCHEMA.sql](FULL_TEST_SCHEMA.sql), guarded to `_test` / `_restore` databases.
- Preferred runner: `BUDDY4_TEST_DATABASE=1 PGDATABASE=marketmind_migration_test node --import tsx scripts/migrate-buddy4.ts` from `market-worker`.

The runner records checksums, checks existing column/type compatibility, and rolls back the entire batch on error. Original 001–004 migrations are preserved. No production application, `main` merge, PM2 or Termux boot changes are included.
