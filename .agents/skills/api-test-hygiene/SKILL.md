---
name: api-test-hygiene
description: Preflight and cleanup steps for @parada/api integration tests — embedded Postgres startup check and test-data isolation between runs. Use before running or writing tests under services/api that hit a real database.
---

# API test hygiene

Two failure modes have recurred across Phase 12 realtime tasks (Task 3/4, Task 5, Task 7): tests failing because
the database wasn't reachable, and tests failing on rerun because a previous run's rows were still there.

## 1. DB reachability check (run before any real-DB test suite)

Embedded PostgreSQL is not started automatically. Before running `services/api` integration tests:

```bash
pg_isready -h localhost -p <port> || <embedded-postgres-start-command>
```

If a test run fails with a connection error (ECONNREFUSED, "database not reachable"), the fix is almost always
"start the DB", not "fix the test." Check reachability first — do not start debugging application code until
the DB is confirmed up.

## 2. Test-data isolation between runs

Symptoms this skill addresses: a test passes in isolation but fails on rerun; a fixture matches the wrong path
(e.g. guest flow instead of registered-vehicle flow) because a row from a prior run is still present; two test
files collide on the same hardcoded entity ID.

Rules:
- Never hardcode an entity ID that a previous test run may have already created. Generate IDs per-run (uuid,
  timestamp suffix) or clean up in `afterEach`/`afterAll`.
- If a test depends on a specific fixture shape (e.g. a vehicle with a specific plate for OCR-confidence
  matching), create that fixture explicitly in the test's own setup — don't rely on seed data or a previous
  test's leftover row.
- Before re-running a suite that failed with a data-shape mismatch (wrong path taken, unexpected count), clean
  the affected tables first, then rerun, before concluding the implementation is wrong.

## When this doesn't apply

Unit tests with no real DB (mocked repositories) don't need this. Only real-DB integration tests under
`services/api` are affected.
