# Buddy4 migration review status

Source-derived replacement contracts now cover **66 base tables, 6 views, 8 RPCs**. Existing 001–004 DDLs cover five tables; 005 adds 61. Table names and inferred schemas are not an original catalog export or a production acceptance result.

Automated gates include schema/key/FK coverage, idempotence/data preservation, actual PostgreSQL 18.2 parallel RPC accounting, query injection rejection, API authentication/read-only access and the original engine pipeline. See `SCHEMA-DECISIONS.md` for inferred type/default/FK/business decisions.

Outstanding operator acceptance: actual Buddy4 five-table schema comparison, backup restore test, live provider ingestion, HTTPS/reverse proxy setup, Vercel Preview and operational load/reboot validation. Keep PR Draft; leave `main`, production data, existing PM2 and boot configuration untouched.
