# Bulk reconstruction and acceptance gates

The implementation now contains 66 ordinary tables, 6 views, and 8 RPCs. Five ordinary tables were already present on Buddy4, so `005_remaining_tables.sql` defines 61 additional tables.

Use `schema-contract.json` for explicit field/type/default/unique/FK evidence, `source-contracts.json` for TypeScript-discovered usage, and `SCHEMA-DECISIONS.md` for assumptions. These files are not a recovered Supabase catalog.

1. Validate source contracts and existing engine tests locally.
2. Run schema, query, API, RPC accounting/concurrency and pipeline tests on PostgreSQL 18.2.
3. On Buddy4, capture the actual five-table schema, back up, and restore to a separate `_restore` DB.
4. Apply with `migrate-buddy4.ts` only to the test/restore DB; inspect drift and data retention.
5. Configure and test separate worker/read-only API credentials, HTTPS, and Vercel Preview.
6. Only after operator acceptance, plan production application and PM2 changes separately.

Detailed commands: [docs/buddy4-migration.md](../../../docs/buddy4-migration.md). No automatic production application, branch merge, destructive down migration or boot configuration change is part of this work.
