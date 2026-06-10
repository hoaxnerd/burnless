# Deploy migration runbook — READ BEFORE LAUNCH

> **Why this exists:** during launch-eve browser testing (2026-06-10) the running
> dev database was found to be **missing the remediation's migrations** —
> `share_classes.class_type` (`0001`) and `forecast_lines.name` (`0002`) did not
> exist in Postgres (they had only been applied to the PGLite test runners). The
> Drizzle schema `SELECT`s those columns, so any uncached `forecast_lines` /
> `share_classes` query throws `PostgresError: column "..." does not exist`
> (e.g. adding a funding round 500'd). **The deploy MUST apply migrations or the
> app breaks in production.**

## Migration set (current)

`packages/db/drizzle/`:

| Tag | Adds |
|-----|------|
| `0000_eager_blockbuster` | Collapsed baseline — all 43 tables (Phase 0) |
| `0001_zippy_shinobi_shaw` | `share_classes.class_type` enum (Phase 2) |
| `0002_demonic_metal_master` | `forecast_lines.name` + partial unique index `forecast_lines_company_name_idx` (Phase 4) |

`db:generate` is clean (empty diff); the schema in `packages/db/src/schema.ts` is the source of truth.

## Local / dev

Already reconciled via `pnpm db:push` (additive: both columns are nullable/defaulted, no data loss; `db:generate` reports "No schema changes" after). For a fresh dev DB, `pnpm db:migrate` applies `0000→0001→0002` cleanly.

## Production

Pick the branch that matches prod's actual state. **Confirm with a human which one applies before running anything.**

### Case A — fresh / recreatable prod (no live data yet)
Per founder note, prod is not yet live. Apply the full chain into an empty DB:

```bash
DATABASE_URL=<prod> pnpm --filter @burnless/db db:migrate
```

`drizzle-kit migrate` runs `0000` (CREATE all tables) → `0001` → `0002`.

### Case B — prod already at the OLD (pre-collapse) schema
A fresh `0000` baseline **cannot** be applied to a DB that already has the tables —
`db:migrate` would attempt `CREATE TABLE "users" ...` → `relation already exists`.
The `__drizzle_migrations` table must be reconciled so the baseline is treated as
**already applied**, then `0001`/`0002` apply on top. See the plan's **Task 0.4b**
(`docs/superpowers/plans/2026-06-09-math-correctness-remediation.md`) — author +
clone-test a `reconcile-baseline.sql` (delete old hash rows, insert one row whose
hash/`created_at` match the `0000` entry in `meta/_journal.json`), test it against a
**clone of prod's migrations table** (must report "No migrations to apply" for
`0000`, then apply `0001`/`0002`), then a human runs it against prod inside a
transaction with a fresh backup. **An agent must not run this against prod.**

## Post-migrate smoke (any environment)

After migrating, verify the two columns exist and a live query works:

```sql
SELECT column_name FROM information_schema.columns
 WHERE (table_name='forecast_lines' AND column_name='name')
    OR (table_name='share_classes'  AND column_name='class_type');
-- expect 2 rows
```

Then in the app: open `/funding`, add a funding round, and confirm there is **no**
`column "name" does not exist` error (this is the exact failure the missing
migration produced). Also load `/expenses` (lists `forecast_lines`) uncached.

## Notes

- `db:push` is **dev-only** (no migration files, diffs schema→DB). Prod uses `db:migrate`.
- CI/test uses PGLite via the official drizzle migrator (`packages/db/src/__tests__/setup.ts` + `apps/web/vitest.setup.db.ts`) — that path was already correct; it's the *real* Postgres that was behind.
