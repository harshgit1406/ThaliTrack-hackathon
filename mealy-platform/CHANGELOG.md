# Changelog

## 2026-10-30 - Manager order synchronization

- Fixed the manager rush board to aggregate live orders from every outlet in the selected canteen instead of reading only the first returned outlet.
- Kept forecast, leftover, and surplus actions attached to the outlet that owns the available demand history.
- Removed hackathon-labelled copy and badges from active product applications while retaining clearly labelled local payment simulation.

## 2026-10-30 - Student order notifications

- Added compact added-to-cart confirmations, an order-placed token popup, and live in-app notifications when an order status changes.
- Ready-for-pickup now uses a prominent notification telling the student to collect the order from the counter.

## 2026-10-30 - POS menu photos made self-contained

- Bundled the ten hackathon menu photos with the POS so catalog cards no longer depend on the student-web development server.
- Kept an optional media-origin setting for deployments that later move catalog images to object storage or a CDN.

## 2026-10-30

- Added a repository-backed ThaliTrack hackathon gap analysis, focused P0/P1 scope, technical design, Railway/Vercel deployment plan, sequenced verification checklist, and explicit payment/authentication decision gates.
- Implemented capacity-locked 10-minute pickup slots, mock-UPI student checkout, live queue tracking, a canteen rush board, leftover logging, food-saved estimates, timetable-aware demand forecasting, and after-3 PM surplus offers.
- Added a deterministic 280-row dataset covering 28 days and 10 dishes, plus a lightweight ridge-regression model that runs inside the existing Node backend.
- Added guarded seeded demo identities for two-phone judging, Railway runtime port support, Vercel SPA configuration, and an exact deployment/rehearsal runbook.
- Added database-backed media records and locally served food photography for all 10 ThaliTrack demo dishes, keeping the multi-device demo independent of internet image hosts.

## 2026-10-26

- Completed a restaurant/POS security hardening pass: fixed outlet-to-canteen authorization escalation, restricted management snapshots and sensitive sub-sections by permission, prevented existing-email staff account takeover, and made production administrator bootstrap disabled by default.
- Added API/gateway security headers, exact origin allowlists, body/rate/connection limits, trusted-proxy opt-in, timing-safe token checks, bounded realtime frames/cloud calls, Electron navigation/permission hardening, loopback-only Compose defaults, and read-only capability-dropped backend containers.
- Serialized and made idempotent order, settlement, refund, and inventory effects; validated idempotency keys and terminal/outlet relationships; removed build-time staff bearer tokens and shortened browser token persistence to the current session.
- Refreshed all application lockfiles to zero known npm advisories and added security regression tests. All 33 current checks, all type checks/builds, defined lint gates, Compose validation, tracked/history secret-pattern scans, and diff hygiene checks pass; the local database rerun remains blocked by unavailable Docker and a rejected local PostgreSQL credential.
- Replaced deployment/database-only restaurant setup with audited owner UI and APIs for pickup business hours, tax rates and category assignment, kitchen stations, POS terminals, Windows printer queues/routes, and one-time gateway enrollment/token rotation.
- Added scoped setup validation and tests, hid gateway token hashes from all reads, verified every setup write against live PostgreSQL, and browser-checked the hours, tax, device, printer, and gateway screens.
- Fixed duplicate canteen portfolio rows when one canteen is assigned to multiple campuses; campus names are now combined into one canteen record.
- Paused student-app delivery and completed the counter-pickup restaurant operating path across POS, outlet gateway, KDS, cloud backend, printing, and canteen management.
- Added staff employee-code/PIN sign-in with throttling, outlet/terminal authorization, cash shifts, configured and split tender settlement, receipt issue/reprint, audited cancellation, and manager-authorized full refunds.
- Added offline cash orders with reserved tokens and authoritative reconciliation; KOT/receipt printing; KDS delay/remake; realtime terminal cleanup; and audited menu, staff, stock, availability, and outlet controls.
- Applied schema version 11 locally and verified a real order through payment, receipt, gateway/KDS preparation, delay, remake, collection, refund, stock adjustment, and print spooling.
- All backend, gateway, KDS, POS, and canteen-admin tests, type checks, lint checks, and production builds pass.

## 2026-10-22

- Added an idempotent development dataset for campuses, canteens, outlets, counters, terminals, users, entitlements, menus, catalog options, taxes, inventory, payment methods, printers, orders, tokens, and KOTs.
- Added database runner actions to load and verify the sample dataset, plus stable local IDs for frontend configuration.
- Added a guarded backend seed command for the repository Docker stack and verified the live student catalog/cart flow against the seeded backend.

## 2026-10-22

- Selected Razorpay for the later online-only student payment integration and prioritized completing the responsive student web before native Android/iOS. Updated checkout to show real OTP-session readiness and an honest Razorpay setup-pending state without creating a fake payment, order, token, or KOT; added the missing student-web ESLint configuration so its quality gate runs consistently with the other React applications.
- Confirmed the student baseline: passwordless phone-OTP only, consent-based nearby campus/canteen discovery with manual selection, and online-payment-only checkout. Added the backend discovery endpoint plus a provider-neutral OTP request/verify/session contract. Local development logs an OTP only when explicitly using the console adapter; production fails closed until an SMS provider is selected.
- Connected the student web's first-run flow to live campus/outlet discovery, optional browser-location ranking, and the real OTP endpoints. No fallback campus, user, menu, OTP, or payment result is created.
- Added `apps/student-web`, a responsive Mealy-only student application with splash/welcome/auth-ready states, configured-outlet catalog loading, search/category filtering, item variant and kitchen-note selection, a browser-local cart, server pricing quotes, clear unavailable/configuration states, and phone/tablet/desktop navigation. It uses the existing Mealy wordmark and orange/slate design language only; it contains no menu or order fallback records and does not alter the legacy student app.
- Added the student-web environment example, backend CORS example origins for port `5177`, and exact local startup guidance. The current checkout explicitly remains unavailable until student authentication and approved order/payment contracts are implemented.
- Added the complete student-web product/design blueprint covering all pages, phone/tablet/laptop compositions, responsive navigation, dynamic data boundaries, motion/shared-element choreography, component architecture, route plan, delivery phases, system states, accessibility, and completion criteria.
- Confirmed that the supplied food-app image is layout inspiration only; the new student app will use the approved Mealy wordmark and established orange/slate platform language without copying the reference brand, green palette, or imagery.
- Added a root local-startup guide explaining exactly which services run in Docker versus directly on Windows, the required environment files, ports, first-time setup, normal startup order, health checks, logs, restart, shutdown, and common failures.
- Made the outlet gateway automatically load its local `.env` file and aligned the example CORS origins with the recommended dedicated frontend ports.
- Updated backend and deployment documentation to reflect the completed local Docker health/readiness verification.

## 2026-10-21

- Removed runtime demo/fallback operational records from POS, KDS, platform admin, canteen admin, and outlet gateway. Clients now use backend/gateway contracts and show explicit empty or unavailable states when data/contracts are absent.
- Added scoped management and platform administration read APIs, enriched order reads, and catalog/outlet availability writes used by the applications.
- Built all six existing modules successfully and started the local Docker PostgreSQL, one-shot migration, API, realtime, and worker services; `/health` and `/ready` report healthy schema version 8. Full workflow testing remains deferred by user request.
- Added the initial modular Node.js/TypeScript/Fastify cloud backend with API, WebSocket, and worker runtime modes plus Docker Compose wiring for PostgreSQL and one-shot migrations.
- Added backend modules for bootstrap/session identity, catalog, pricing, idempotent order/token/KOT creation, payments, kitchen readiness, administration, entitlements, gateway enrollment, local-event ingestion, and outbox publication.
- Added migration 008 for distinct QR/KDS entitlements, outlet gateway enrollment, durable cloud event replay, acknowledgement cursors, and idempotent gateway event intake.
- Added an outlet-gateway cloud WebSocket client that reconnects, resumes from its durable cursor, stores complete pushed online orders in SQLite before acknowledgement, and avoids echoing cloud-received events into the upload outbox.
- Prepared dependency lockfiles without running containers or tests; runtime/build/migration/API/WebSocket verification is intentionally deferred until explicit user authorization.
- Superseded the prior Supabase platform decision with a Railway-hosted modular backend and Railway PostgreSQL source of truth.
- Confirmed backend-owned authenticated WebSockets for push-based outlet delivery: no order polling, durable gateway acknowledgement after local persistence, and sequence/cursor replay after reconnect.
- Confirmed one modular backend codebase with separate API, WebSocket, and worker process types instead of menu/order/payment microservices at the initial approximately 1,500-daily-customer/order scale.
- Added production requirements for private database access, automated backups, off-platform logical dumps, restore drills, measured rush-hour load testing, and scale-triggered Redis/pub-sub rather than premature infrastructure.
- Kept the existing framework-neutral migrations intact, added migration 008 append-only, and retained the no-Supabase runtime boundary; Railway provisioning, provider adapters, and object storage remain implementation tasks.

## 2026-10-11

- Added `apps/outlet-gateway`, an outlet-LAN Node.js/TypeScript service with Fastify, a durable WAL-mode SQLite store, idempotent POS order intake, validated ticket/item transitions, replayable events, and a cloud synchronization outbox.
- Connected the KDS to the gateway's canonical local queue and action endpoints, and made the gateway host the production KDS at `/kds/` for kitchen tablets on the same LAN.
- Added gateway token and browser-origin protection, production token validation, health/context/sync endpoints, configurable cloud sync attempts with retry backoff, and restart-persistence/invariant/API tests.
- Added per-item-line readiness inside preparing KDS tickets, visible item progress, tap correction, duplicate-action protection, and a rule that the whole order cannot be marked ready until every item line is complete.
- Changed the KDS board from hidden page overflow and subtle per-lane scrolling to natural full-page vertical scrolling, so every order remains reachable without requiring the pointer to be positioned over a particular column.
- Added `apps/kds`, a separate responsive Mealy kitchen-display application for an outlet and kitchen-station context.
- Added source-labelled POS, student-app, and QR tickets in distance-readable New, Preparing, and Ready lanes with token emphasis, item modifiers, notes, elapsed time, priority, and late-order treatment.
- Added guarded frontend-only ticket transitions, pending/success feedback, gateway connected/offline safety states, loading/error/empty states, sound and fullscreen controls, and tucked-away preview controls.
- Added a KDS service adapter with demo fallback plus tested ticket sorting, urgency, counts, and permitted ticket-level transitions.
- Kept staff authentication/authorization, KDS/KOT entitlement enforcement, authoritative cloud receiver integration, printing, item/station routing, and exception workflows explicitly pending.

## 2026-10-10

- Added `apps/canteen-admin`, a separate responsive owner workspace for managing one or more assigned canteens.
- Added a simple default Main view containing portfolio/canteen statistics, searchable order records, reports, alerts, order-detail drawers, and context switching without configuration clutter.
- Added a canteen-specific Advanced management mode for menu and availability, inventory, outlets and hours, kitchen routing, devices and printers, staff and roles, taxes and charges, assigned modules, activity history, and business settings.
- Added explicit editing-context protection: Advanced management cannot target all canteens and displays the canteen being edited persistently.
- Added `apps/admin`, a separate responsive Mealy platform-admin UI for campuses, canteen onboarding, module entitlements, Mealy team users, roles and permissions, operational monitoring, audit history, and platform defaults.
- Added working frontend-only campus creation, guided canteen onboarding, team invitations, module dependency enforcement, local permission editing, filters, drawers, settings, alerts, and responsive navigation.
- Re-audited the administration scope: the first-release campus record represents a college/campus, routine KOT execution stays outside platform admin, and unapproved payment/wallet modules remain unavailable.
- Reused the POS wordmark, orange/slate palette, surfaces, feedback patterns, typography, and component styling without coupling admin state to the POS application.
- Fixed the low-stock quantity editor Save button so it remains visible on hover.
- Added a development-only, cashier-controlled split-payment editor for Cash, UPI, Card, mixed tenders, and multiple UPI entries on one order.
- Simplified item availability controls to a single sold-out/available toggle with an inline quantity editor for low-stock items.
- Simplified bill actions by making `Clear` visible in the bill header and moving `Apply discount` below the kitchen note.
- Added synchronized per-item quantity controls to menu cards so staff can adjust quantities from the menu as well as the current-bill panel.
- Removed the POS outer background gutter, oversized corner radius, and floating container shadow so the application now fills the desktop window edge-to-edge.
- Reworked the development-only POS into one unified desktop application surface, with corrected spacing, typography, icon alignment, and responsive desktop sizing.
- Replaced emoji menu artwork with twelve local photorealistic food assets generated for the Mealy catalog cards.
- Added functional frontend-only Online Orders, Active Tokens, and History workspaces, plus simulated order acceptance, KOT creation, preparation progress, collection, receipt feedback, sorting, notes, held bills, profile actions, and connection testing.
- Moved POS notifications to the top-right and limited the visible queue to the two newest messages.
- Kept all new behavior isolated from Supabase and backend services; API integration remains pending.

## 2026-09-21

- Started `apps/pos`, the Windows Electron + React/TypeScript cashier workspace. It includes the supplied Mealy wordmark, local draft-bill recovery, visible connectivity states, user-friendly actionable feedback, quick availability controls, and an isolated demo-catalog adapter pending Mealy API integration.
- Confirmed Supabase as Mealy's managed PostgreSQL, storage, and real-time platform while retaining an authoritative Mealy backend for business logic and authorization.
- Confirmed the outlet-local gateway model: LAN-based POS/KDS/KOT operation, durable offline order storage, automatic idempotent reconnection sync, cloud delivery of online orders, and token-block reservation.
- Added `docs/OPERATIONAL_CONNECTIVITY.md` as the implementation reference for cloud, LAN, and offline-recovery behavior.

## 2026-09-20

- Approved clean, separate Mealy interfaces for student/QR ordering, POS billing, kitchen/KDS, and administration.
- Made ProBills/Firebase reference-only and explicitly rejected importing its combined application shell or persistence architecture.
- Added `apps/kds` to the target application boundaries and documented cross-channel POS, QR, student-order, KOT, and kitchen flows.
- Adopted admin-controlled per-canteen modules with backend entitlement enforcement and separate KOT/KDS capabilities.

## 2026-09-14

- Added a branded Word database handbook covering the complete Mealy PostgreSQL foundation, split-payment readiness, domain architecture, operational controls, production TBDs, and all 112 application tables.
- Clarified that split payment is structurally supported but still requires atomic backend settlement and refund policy implementation.

All notable project changes will be documented here. Dates use `YYYY-MM-DD`. The project has not entered application implementation.

## [Unreleased]

### Added

- PostgreSQL 16+ database foundation under `apps/backend/database`.
- Seven checksum-tracked migrations covering identity/RBAC, campus/canteen tenancy, catalog variants/add-ons/tax/inventory, orders/tokens/KOT, payments/promotions/wallet/finance, POS operations, and reliability/audit infrastructure.
- Docker Compose development database and PowerShell migration/verification runner.
- Transactional smoke test for the complete campus-to-order workflow.
- Atomic order/token allocation, configurable order transition function, audit history, idempotency records and transactional outbox.

### Changed

- Documentation gate advanced to approved foundation work.
- Adopted separate apps under `mealy-platform/apps` and PostgreSQL as the new database.

### Pending

- Remaining application-flow/source/design decisions in `docs/PROJECT_CONTEXT.md`.

## [0.1.0] - 2026-09-13

### Added

- Permanent documentation baseline for product context, features, user flows, decisions, design system, architecture, database, APIs, security, testing, tasks, and known issues.
- Clear separation of student ordering, canteen POS, canteen/admin management, and shared backend.
- Evidence labels distinguishing confirmed requirements from observed legacy behavior and TBD decisions.
- Documentation approval gate preventing application implementation before user sign-off.
- Read-only boundary for the two legacy repositories.
- Mandatory end-of-prompt Git ignore review, staged-secret review, and scoped local commit workflow.

### Security

- Recorded—but did not expose—the presence of a tracked legacy `.env.local` for later credential audit.
