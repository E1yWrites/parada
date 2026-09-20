# How to edit the database

The Prisma schema at
[`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma)
is the source of truth for the data model. Only `@parada/database` and the
API talk to it — Mobile, Admin, and Vision never access Prisma/PostgreSQL
directly (see [`docs/database/model.md`](../database/model.md)).

This covers two different things: **changing the schema** (adding a
column/table/constraint) and **editing data** in a running database
(inspecting/fixing rows). Don't confuse them.

## Changing the schema

1. Edit `packages/database/prisma/schema.prisma`.
2. Generate a migration against the embedded dev database:
   ```bash
   npm run db:start                      # make sure the dev DB is up
   npm run migrate:dev -w @parada/database
   ```
   This writes a new folder under `prisma/migrations/<timestamp>_<name>/` with
   the generated SQL and applies it to the dev database. **Commit the
   generated migration folder** — it is the only record of the change other
   environments replay.
3. Regenerate the Prisma client so TypeScript sees the new shape:
   ```bash
   npm run generate -w @parada/database
   ```
4. Update [`docs/database/model.md`](../database/model.md) if the change adds
   or changes an entity — it's meant to stay in sync with the schema.

### Database-level constraints Prisma's DSL can't express

Some invariants (e.g. the `occupiedCount >= 0 AND occupiedCount <= capacity`
`CHECK` constraint on `ParkingZone`) are **not** representable in
`schema.prisma` and exist only as raw SQL inside the migration file. If
you're touching a table that has one of these, open its migration SQL
directly under `prisma/migrations/` and edit/extend the SQL by hand — running
`prisma migrate dev` again from a schema-only change will not regenerate it,
and a careless migration reset can drop it. Grep the migrations folder for
`CHECK` before altering an existing table.

### Applying migrations elsewhere

```bash
npm run migrate:deploy -w @parada/database   # or: npm run db:migrate
```

`npm run dev` and `npm run db:prepare` already apply pending non-destructive
migrations automatically for local development.

## Editing data directly

The dev database is a real embedded PostgreSQL 18 instance on port `5442` —
use any Postgres client against
`postgresql://parada:changeme@127.0.0.1:5442/parada?schema=public` (see
`packages/database/.env.example`):

```bash
psql "postgresql://parada:changeme@127.0.0.1:5442/parada?schema=public"
```

Or use Prisma Studio (a GUI):

```bash
npx --workspace @parada/database prisma studio
```

**Never hand-edit `occupiedCount`, session/reservation/assignment rows, or
anything the backend treats as authoritative.** Those are written through
transactional domain logic in `services/api/src/domain/*` to preserve
occupancy atomicity, idempotency, and uniqueness invariants (see
[`docs/database/model.md`](../database/model.md)). A direct `UPDATE` bypasses
all of that and can desync cached counts from the events that produced them.
Direct edits are fine for genuinely inert data (e.g. fixing a typo'd
`EstablishmentConfig` display string) — if in doubt, go through the API or
the admin UI instead.

## Reseeding

```bash
npm run seed -w @parada/database
```

Requires `PARADA_SEED_ADMIN_PASSWORD` / `PARADA_SEED_USER_PASSWORD` to be set
(the seed refuses to run without them outside the test environment).

## Resetting the dev database

There is no scripted reset — the embedded dev database is intentionally
persistent and never wiped by `npm run dev`. To start clean, stop the
database (`npm run db:stop`) and delete
`packages/database/.embedded-pg/` before starting it again. This is
destructive and unrecoverable for local data — confirm you don't need it
first.

## Test databases

`npm run db:test:setup -w @parada/database` creates `parada_test` and
`parada_test_api` and applies all migrations to both — see
[run-and-test-locally.md](./run-and-test-locally.md). Edit those only through
the test suites themselves; they're truncated/reset by test setup, not meant
for manual data edits.
