# Testing

## Security hardening verification - 2026-10-26

- Refreshed all seven npm lockfiles; `npm audit` reports zero known vulnerabilities for backend, outlet gateway, POS, KDS, canteen admin, platform admin, and student web.
- Type checks and production builds pass for all seven applications. Lint passes with zero warnings for every app that defines a lint script; backend has no lint script.
- Current suites pass 33 checks: backend 14, outlet gateway 5, POS 2, KDS 4, canteen admin 4, and platform admin 4. Student web currently has no Vitest files.
- Added regression coverage for security headers, exact CORS denial, body-size rejection, authentication throttling, outlet/canteen authorization boundaries, idempotency-key validation, gateway headers/body limits, and production cloud transport/token enforcement.
- Static tracked-file secret patterns, dangerous browser/Node primitives, dynamic SQL interpolation, Electron settings, gateway command invocation, ignored-file status, and dependency advisories were reviewed. No tracked live credential was found in `mealy-platform`.
- A live database rerun was attempted, but the local PostgreSQL listener rejected the repository's ignored development credential and Docker Desktop was unavailable. The earlier schema/POS integration evidence below remains the latest database-backed result; rerun it with the active local credential before release.

## Restaurant/POS verification - 2026-10-26

- Schema migrations replayed and local readiness returned schema version 11.
- Backend, outlet gateway, KDS, POS, and canteen-admin type checks and production builds passed.
- Backend (2), outlet gateway (3), KDS (4), POS (2), and canteen-admin (2) test checks passed; all four frontend/gateway lint gates passed with zero warnings.
- Live staff PIN sign-in, POS context, cash shift, configured cash settlement, receipt issue, KOT/receipt print spool, cloud-to-gateway delivery, KDS delay/item readiness/ready/remake, collection, manager refund, inventory adjustment, and terminal KDS cleanup passed.
- Offline cash order creation with a reserved token and later authoritative cloud reconciliation was verified before this final pass.
- Restaurant setup validation adds two backend tests for complete seven-day schedules and two canteen-admin tests for schedule summaries. Backend and canteen-admin type checks, tests, lint, and production builds pass.
- Live authenticated setup verification passed for pickup hours, tax/category assignment, terminal, kitchen station, printer, printer route, gateway enrollment, token rotation, setup refresh, and gateway-secret redaction. Temporary rows and sessions were removed after verification.
- Browser smoke testing confirmed the one-canteen advanced-management gate and the rendered business-hours, tax, POS-terminal, printer-route, and gateway-enrollment forms. It also exposed and verified the fix for duplicate portfolio rows when a canteen belongs to multiple campuses.

## Current evidence

The inspection found but did not execute:

- 2 Playwright files in `../mealyapp/tests`, including Razorpay checkout coverage and an example test.
- 19 core backend test files under `../mealy-backend/tabletrack/tests`.
- 13 Mealy module tests covering API key validation, OTP, Truecaller callback, feedback, coupons, wallet, checkout interactions, settings memoization, and commission calculation.
- Additional tests exist inside non-Mealy modules such as `RestApi`.

New database verification completed on 2026-09-14:

- All seven PostgreSQL migrations replayed successfully from an empty Docker volume.
- Re-running the migration command skipped all applied files using matching SHA-256 checksums.
- `apps/backend/database/tests/schema_smoke_test.sql` passed transactionally and rolled its fixture data back.
- The smoke test covers required-table presence, campus/canteen/outlet/counter/terminal creation, item variant, add-on, tax, order number, order, token idempotency, status history, actor restriction and outbox events.

Development sample verification completed on 2026-10-22:

- The idempotent development seed ran twice successfully against the Docker PostgreSQL schema, and its completeness assertions passed both times.
- API and realtime health passed at schema version 8. Public discovery returned two campuses; the primary outlet catalog returned four categories and four available items.
- An authenticated platform-admin request returned the seeded campus/canteen/outlet hierarchy, and the canteen-management snapshot returned the sample orders.
- Browser smoke testing confirmed the student home renders the live Central Bites catalog and updates its cart total after adding Masala Poha.
- Production builds passed for backend, platform admin, canteen admin, KDS, outlet gateway, POS, and student web. Existing suites passed 15 tests across admin (4), canteen admin (2), KDS (4), outlet gateway (3), and POS (2); backend and student web currently contain no Vitest files.
- Existing lint debt remains in platform admin, canteen admin, and POS. KDS, outlet gateway, and student web lint passed. The lint findings predate and are unrelated to the sample-data change.

The legacy suites were not executed, so their current status remains **TBD**. The new database suite is confirmed passing.

The 2026-10-21 cloud backend/Docker implementation has deliberately not been built, started, migrated, connected, or tested yet. The user requested a separate authorization checkpoint after implementation. All results for migration 008, API modules, worker, WebSocket transport, and gateway cloud ingestion therefore remain pending rather than assumed.

## Required strategy

### Unit tests

- Money/tax/fee/discount calculations.
- Token allocation/reset and concurrency behavior.
- Order and KOT state-machine transition rules.
- Permission policies and campus/canteen scoping.
- Payment signature/webhook and idempotency logic.

### Integration/API tests

- Auth/OTP abuse controls and session revocation.
- Catalog scoping/availability.
- Quote-to-order total consistency.
- Duplicate/replayed order, KOT, status, and payment requests.
- Student order ownership and cross-canteen isolation.
- POS receives a student order and advances only valid transitions.
- Transaction rollback when KOT/event/payment side effects fail.
- WebSocket authentication and outlet-scope isolation; durable acknowledgement only after gateway persistence.
- Disconnect/reconnect cursor replay, duplicate delivery, out-of-order delivery, heartbeat expiry, and unrecoverable version-gap recovery.

### End-to-end student flows

- Select context -> browse -> customize -> cart -> checkout -> confirm -> watch status -> collect.
- Empty/loading/error/offline/retry and payment-pending/recovery states.
- Refresh/reopen during an active order.
- Accessibility checks for keyboard, labels, focus, contrast, zoom, and reduced motion.

### End-to-end POS flows

- Login/context -> receive order -> identify token -> KOT -> prepare -> ready -> collect.
- Concurrent staff actions and stale views.
- Printer unavailable/retry/reprint without duplicated KOT.
- Direct POS order/payment/receipt only if approved.
- Prepared UI at approved terminal resolutions and touch targets.

## Contract and migration testing

- Treat OpenAPI as a checked contract and generate/validate frontend types where practical.
- CI must detect undocumented breaking API changes.
- Run migrations from a production-like snapshot, verify rollback strategy, and test uniqueness/concurrency constraints.

## Quality gates (proposed)

Before merge/release: format/lint/typecheck, relevant unit/integration tests, production build, migration check, dependency/secret scan, and critical E2E paths. Exact commands and coverage thresholds are **TBD** after the target stack is approved.

Before production: load test the approximately 1,500-daily-customer/order baseline with concentrated lunch-hour browsing, checkout, order, and WebSocket delivery; test simultaneous token allocation; perform authorization abuse tests; restore Railway PostgreSQL from both platform backup and off-platform logical dump; and run a canteen counter pilot with measurable acceptance criteria.
