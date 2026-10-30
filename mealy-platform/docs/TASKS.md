# Tasks

No application task may begin until Phase 0 is approved.

## Phase 0 — Documentation and scope gate

- [x] Read-only inventory of both legacy repositories and existing POS/backend structure.
- [x] Consolidate available confirmed requirements, observed implementation, risks, and TBDs.
- [x] Separate student, POS, management, and shared-backend scope.
- [x] Establish fresh writable folder, ignore policy, per-prompt hygiene, and local-commit rule.
- [x] User approved beginning foundation work on 2026-09-14.
- [ ] User answers remaining application-flow questions in `PROJECT_CONTEXT.md` before their related UI/API work.
- [x] Record adopted database and repository decisions in `DECISIONS.md`.

## Phase 1 — Clean application baseline

- [x] Approve clean Mealy UI direction; ProBills and legacy apps remain read-only references.
- [x] Establish separate `student-web`, `pos`, `kds`, `admin`, and `backend` application boundaries under `mealy-platform/apps/`; student web, POS, KDS, platform admin, canteen admin, outlet gateway, and backend now have separate app boundaries. Shared toolchain work remains pending.
- [x] Establish the first `apps/pos` Electron + React/TypeScript application boundary and cashier-shell baseline; the other applications remain pending.
- [ ] Create shared API-client, contract, and UI-token packages without coupling application state across surfaces.
- [ ] Define the module catalogue, dependencies, effective-capability contract, and stable feature-disabled errors.
- [ ] Make one API specification authoritative and generate/validate client types.
- [x] Establish one Node.js/TypeScript/Fastify modular backend codebase with separate API, WebSocket, and worker start modes; do not create feature-specific microservices. Railway provisioning remains.
- [x] Add Docker topology for PostgreSQL, one-shot migrations, API, WebSocket, and worker services. Runtime connection/testing awaits explicit authorization.
- [ ] Provision Railway PostgreSQL in the backend region with private access and environment-only credentials.
- [x] Build every existing application and verify the Docker PostgreSQL/migration/API/realtime/worker topology locally; full workflow tests remain pending by user request.
- [x] Document the Docker-versus-Windows component map, environment setup, ports, startup order, health checks, logs, restart, and shutdown commands in the repository README.

## Phase 2 — Shared domain foundation

- [x] Implement campus-canteen-outlet-counter-terminal database model.
- [ ] Implement tenant-scoped staff/student authorization.
- [ ] Implement backend entitlement resolution, dependency validation, platform-admin assignment, audit history, and per-request module guards.
- [x] Implement catalog/availability/pricing/tax/inventory database foundation; backend calculation service remains.
- [x] Implement atomic outlet order numbers and counter/date token allocation.
- [x] Implement configurable order/KOT lifecycle persistence, transition history and optimistic versions; product confirmation remains.
- [x] Implement idempotency/replay storage for order/KOT/payment/wallet/inventory/webhook/print operations.
- [x] Implement transactional outbox persistence; publisher and client transport remain.
- [x] Implement the initial cloud outbox publisher and authenticated WebSocket gateway channel with durable acknowledgement, sequence/cursor replay, heartbeat, and reconnect. Runtime verification and explicit unrecoverable-gap response remain.
- [x] Implement the initial outlet-local gateway with a durable SQLite store/outbox, authenticated LAN API, hosted KDS, idempotent POS order intake, local kitchen transitions, replayable events, health, and sync status.
- [ ] Complete production gateway certificate/key rotation, token-block reservation, printer adapters, approved offline commercial reconciliation/audit, monitoring, and installer/service packaging. Initial token enrollment, HTTP upload, cloud WebSocket receipt, and cursor persistence are implemented but untested.

## Database verification completed

- [x] Add and verify an idempotent development sample dataset covering the complete campus/canteen/outlet/catalog/order/KOT path.
- [x] Clean PostgreSQL 16 migration replay from an empty volume.
- [x] Migration checksum/drift detection.
- [x] Transactional campus-to-canteen-to-catalog-to-order smoke test.
- [x] Variant, add-on, tax, token idempotency, authorized transition, unauthorized transition and outbox assertions.

## Phase 3 — Student ordering application

- [x] Plan the complete student flow, responsive phone/tablet/laptop compositions, page inventory, motion/shared-element system, component architecture, states, phases, and acceptance criteria in `STUDENT_WEB_PLAN.md`.
- [x] Record the Mealy-only logo and orange/slate visual direction; the supplied screenshot is layout inspiration only.
- [x] Scaffold `apps/student-web` without modifying the legacy `../mealyapp/app` working tree.
- [ ] Integrate passwordless phone-OTP authentication; backend/provider adapter and student UI are in progress. Production delivery stays unavailable until the SMS provider is chosen and configured.
- [x] Integrate configured-outlet catalog browsing, search/category filtering, available item variants and kitchen notes, browser-local cart, and backend pricing quotes without fallback menu/order records.
- [ ] Integrate campus/canteen selection and the approved student-context contract. Live public discovery, location ranking, manual outlet selection, and per-outlet catalog loading are implemented; saving a student's campus preference remains pending.
- [ ] Integrate authenticated Razorpay checkout and approved order placement after the separate payment plan defines server-created provider orders, signature/webhook verification, pending recovery, and the verified-payment-to-KOT boundary. The current web checkout remains safely disabled.
- [ ] Integrate confirmation, token, active status, recovery, and collection completion.
- [ ] Add approved payment/promotions/account extras only.
- [ ] Verify mobile, accessibility, error, offline, and rush-load behavior.

## Phase 4 — Canteen POS

- [x] Design and build a clean task-focused POS shell for counter billing and incoming digital orders.
- [x] Design and build the cashier shell with API-backed catalog, order creation, order lists, availability, and transitions plus local-only recoverable draft/held-bill state.
- [x] Connect only through shared-backend contracts; no Firebase/direct-database persistence or operational fallback records.
- [x] Integrate staff/canteen/terminal context and permissions.
- [x] Integrate incoming orders, token lookup, KOT creation/routing, status actions, and collection.
- [x] Integrate approved direct counter-order/payment/receipt/printer flows.
- [x] Verify idempotent retries, stale-view refresh, durable print failure reporting, and the primary touch/keyboard workflow locally. Rush-load and physical-printer certification remain release checks.

## Phase 4B — Kitchen display system

- [x] Build a separate outlet/station-scoped KDS shell with source-labelled tickets, ticket and item-line readiness, urgency, connectivity feedback, and live outlet-gateway queue/actions; unavailable gateways show an error and never substitute tickets.
- [x] Gate KDS gateway operations behind a per-canteen KDS entitlement that depends on KOT.
- [x] Integrate KOT queues for POS, student-app, and QR order sources.
- [x] Integrate ticket/item preparation transitions, readiness, delays, remakes, and exception handling.
- [x] Verify duplicate actions, restart persistence, stale-ticket cleanup, reconnect replay, and display behavior locally. Rush-hour and installed-device certification remain release checks.

## Phase 5 — Canteen/admin management

- [x] Connect the central platform-admin shell to backend campuses, canteens, modules, team, roles, operations, and audit endpoints; unsupported writes remain clearly unavailable.
- [x] Connect the multi-canteen owner shell to a scoped backend management snapshot and supported availability/outlet writes; unsupported configuration areas remain clearly empty.
- [ ] Connect central-admin module assignment and scheduling controls to the authoritative backend; allow canteen admins to configure only assigned modules.
- [x] Integrate approved menu/catalog/availability and stock-adjustment controls.
- [x] Integrate approved staff/role creation plus owner-managed business hours, taxes, kitchen stations, POS devices, printer/KOT routing, and one-time gateway enrollment.
- [x] Add audit trail and live daily operational reports.
- [ ] Verify tenant isolation and high-risk action permissions.

## ThaliTrack hackathon MVP (2026-10-30)

- [x] Add sub-30-second menu, mock-UPI checkout, order ID, and 10-minute pickup-slot selection.
- [x] Add live queue/wait status and manager rush board with ready-state actions.
- [x] Add a lightweight ridge-regression forecast using 28 days of data for 10 dishes.
- [x] Add leftover kilograms, food-saved estimate, timetable-aware rush multipliers, and surplus offers.
- [x] Add deterministic 280-row CSV and matching PostgreSQL sample data without personal data.
- [x] Add Railway API/realtime/worker instructions and Vercel SPA configurations for both web apps.
- [x] Verify clean migration, seed, backend tests/build, frontend lint/tests/build, and end-to-end demo flow locally.

## Phase 6 — Release readiness

- [ ] CI quality gates, dependency/secret scanning, migration rehearsal, and production build.
- [ ] Configure Railway production secrets, HTTPS/CORS, API/WebSocket/worker health checks, object storage, monitoring, backups, off-platform logical dumps, restore drills, and alerts.
- [ ] Load test the approximately 1,500-daily-customer/order baseline with concentrated lunch-hour traffic before adding replicas; document the threshold for a second API replica and shared Redis/pub-sub.
- [ ] Conduct load, security, payment, OTP, and restore testing.
- [ ] Pilot at a canteen counter, capture metrics, resolve critical issues, and obtain launch approval.

## Definition of done for every future prompt

- Requested behavior and documentation agree.
- Relevant tests/build/checks pass or blockers are reported precisely.
- `CHANGELOG.md`, `DECISIONS.md`, `TASKS.md`, and API/schema docs are updated when affected.
- `git status --short --ignored` is reviewed; `.gitignore` is updated for new non-source artifacts.
- Staged files are checked for secrets/unrelated changes.
- A scoped local commit exists, unless the prompt changed no files.
