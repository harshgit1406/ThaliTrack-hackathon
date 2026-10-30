# Mealy Database

The new Mealy foundation targets PostgreSQL 16+ and is independent of the ignored legacy MySQL/TableTrack database. It supports the student web app, canteen POS, canteen management, campus administration, and central platform administration.

## Why PostgreSQL

- Strong transactional/concurrency behavior for rush-hour ordering and token allocation.
- Native UUID, JSONB, arrays, partial indexes, check constraints, and reliable row locking.
- Works with mainstream backend frameworks while keeping the schema framework-neutral.

This is an approved implementation choice as of 2026-09-14. Railway PostgreSQL became the confirmed production target on 2026-10-21; the local Docker service remains the development and migration-verification environment.

## Files

- `migrations/`: twelve append-only ordered SQL migrations; migration 012 adds ThaliTrack pickup slots, demand history, leftovers, timetable rush windows, and surplus offers.
- `seeds/development_sample.sql`: idempotent local-only sample campus, canteen, outlet, catalog, staff, inventory, payment, order, token, and KOT records.
- `tests/schema_smoke_test.sql`: transactional integration test covering required tables and a real campus -> canteen -> outlet -> catalog -> order -> token -> status path.
- `tests/sample_data_test.sql`: assertions that the development sample remains complete and API-visible.
- `compose.yaml`: pinned major-version local PostgreSQL service.
- `scripts/Invoke-Database.ps1`: local runner with migration checksums.
- `.env.example`: non-secret local variable template.

## Local usage

From this directory:

```powershell
Copy-Item .env.example .env
# Replace MEALY_DB_PASSWORD in .env before starting.
./scripts/Invoke-Database.ps1 -Action Up -EnvFile .env
./scripts/Invoke-Database.ps1 -Action Verify -EnvFile .env
```

Load and verify the local sample dataset (never run this against production):

```powershell
./scripts/Invoke-Database.ps1 -Action VerifySeed -EnvFile .env
```

When using the repository-level Docker stack, run this from `mealy-platform` instead:

```powershell
docker compose run --rm -e MEALY_ALLOW_SAMPLE_DATA=true api node dist/seed.js
```

The main sample outlet is `e0000000-0000-4000-8000-000000000001`, its pickup counter is
`f0000000-0000-4000-8000-000000000001`, and its POS terminal is
`11000000-0000-4000-8000-000000000001`. These stable IDs can be placed in the local app `.env` files.

Stop the service without deleting its named volume:

```powershell
./scripts/Invoke-Database.ps1 -Action Down -EnvFile .env
```

No destructive volume-reset command is included. Delete/reset development data only through an explicit, separately reviewed action.

## Migration rules

1. Never edit a migration after it has been applied. The runner records SHA-256 checksums and rejects drift.
2. Add a new numbered migration for every schema or seed change.
3. The runner wraps each migration and its checksum-ledger insert in one transaction with `ON_ERROR_STOP`, lock/statement timeouts, and explicit constraints. Non-transactional PostgreSQL operations require a separately reviewed runner strategy.
4. Store money as integer minor units and quantities as fixed-precision numeric values.
5. Store external secrets in a secret manager; database rows hold only secret references or redacted responses.
6. Order writes, KOT creation, token allocation, payments, wallet entries, inventory movements, and webhooks must be idempotent.
7. The API must set/verify tenant scope; direct database access is not an authorization model.
8. Production Railway PostgreSQL must use private backend-only access, automated backups, off-platform logical dumps, and restore drills. Point-in-time recovery, connection pooling, high availability, read replicas, runtime roles/RLS policies, retention, and final sizing remain production decisions to complete before launch.

## Important domain behavior

- A canteen is an operating organization and may be assigned to campuses through `campus_canteens`.
- An outlet is a physical campus/canteen fulfillment location; counters and terminals belong to an outlet.
- Menus and catalog data belong to the canteen, with outlet-specific availability and price overrides.
- Variants and modifier groups/options model sizes and add-ons. Order/KOT rows retain immutable names and prices.
- Taxes and charges are snapshotted onto the order so historical totals do not change when configuration changes.
- Daily order numbers are outlet-scoped. Pickup tokens are counter- and service-date-scoped and allocated atomically.
- `transition_order` validates the configured transition and actor type, writes history, increments optimistic version, and creates an outbox event.
- Optional capabilities are enabled per canteen through feature definitions/entitlements.
