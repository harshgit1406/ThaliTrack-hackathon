# Decisions

This is the durable decision log. “Observed” records current legacy implementation, not user approval.

## Approved decisions

### D-001 — Campus counter-pickup product goal

- Status: **Confirmed**
- Decision: Mealy serves students ordering food from campus canteens, receiving preparation updates, and collecting from the counter.
- Reason: Reduce counter crowds and improve canteen order identification/fulfillment.

### D-002 — Tokens, KOTs, and statuses are core

- Status: **Confirmed**
- Decision: Token numbers, kitchen order tickets, and order-status updates are core operational concepts shared between ordering and canteen workflows.

### D-003 — Canteen-specific POS

- Status: **Superseded on 2026-09-20 by D-015**
- Prior decision: Include a canteen POS and preserve an assumed prepared frontend.

### D-004 — Separate visual inspirations

- Status: **Confirmed**
- Decision: Student ordering and POS may use separate design inspirations. Do not collapse them into one identical visual language.

### D-005 — User-provided brand/reference inputs

- Status: **Confirmed**
- Decision: Logo, colors, screenshots, and design references will be supplied by the user before visual implementation.

### D-006 — Fresh writable project boundary

- Status: **Confirmed**
- Decision: New work belongs in `mealy-platform/`. Existing `mealyapp/` and `mealy-backend/` folders are read-only references and are ignored by the new root repository.

### D-007 — Documentation approval gate

- Status: **Confirmed**
- Decision: Do not start application implementation until the user approves this documentation.

### D-008 — Per-prompt ignore review and local commit

- Status: **Confirmed**
- Decision: At the end of each completed prompt, inspect generated/untracked/ignored files, update `.gitignore` where appropriate, screen staged changes for secrets, and make a scoped local commit. Do not push without a separate request.

### D-009 — One project with separate applications

- Status: **Confirmed**
- Decision: Student web/QR ordering, POS, KDS, admin, and backend live as separate applications or explicit surfaces under `mealy-platform/apps/`; they are not separate root repositories. QR ordering initially belongs in `student-web`.

### D-010 — PostgreSQL database foundation

- Status: **Confirmed for implementation**
- Decision: The new shared backend database targets PostgreSQL 16+ using framework-neutral, append-only SQL migrations.
- Reason: Strong transactions and row locking for rush-hour orders/tokens, plus UUID, JSONB, arrays, partial indexes, and check constraints.

### D-011 — Tenant/location hierarchy

- Status: **Confirmed for database foundation**
- Decision: A canteen is an operating organization. `campus_canteens` assigns it to one or more campuses; each assignment has physical outlets, and each outlet has service counters and POS terminals.

### D-012 — Production data invariants

- Status: **Confirmed for database foundation**
- Decision: Use UUID primary keys, integer minor-unit money, fixed-precision inventory quantities, immutable order/KOT/tax/discount snapshots, optimistic versions, idempotency records, atomic daily sequences, audit logs, and a transactional event outbox.

### D-013 — Optional feature controls

- Status: **Superseded on 2026-09-20 by D-016**
- Prior decision: Several operational modules were enabled by default while advanced modules were disabled by default.

### D-014 — Initial pickup lifecycle

- Status: **Implemented baseline; UI/business approval still open**
- Decision: Seed `placed -> confirmed -> preparing -> ready_for_pickup -> collected`, plus reason-required cancellation/rejection paths and actor-type restrictions. The transition table is data-driven so approved rules can change in a new migration.

### D-015 — Clean, separated operational applications

- Status: **Confirmed**
- Decision: Build a clean Mealy UI instead of adapting the combined ProBills/Firebase application. Maintain separate student ordering, POS billing, kitchen/KDS, and admin/management surfaces, all backed by the same Mealy API and PostgreSQL source of truth.
- Reason: Mealy is becoming a complete campus POS platform supporting counter POS orders, student-app orders, QR orders, KOT routing, and kitchen execution. ProBills was designed as an all-in-one small-cafe application and couples UI directly to Firebase.
- Boundary: ProBills is reference-only for useful interaction patterns. Do not adopt its Firebase data model, Firebase authentication, subscription-plan logic, or combined admin/kitchen/POS shell.

### D-016 — Admin-controlled modular product

- Status: **Confirmed**
- Decision: Mealy capabilities are independently assignable per canteen. Central/platform admin can enable, configure, schedule, or disable modules such as POS, student ordering, QR ordering, KOT, KDS, printing, online payments, wallet, coupons, inventory, dine-in, reservations, delivery, multi-POS, reports, and other optional capabilities.
- Enforcement: Module access is enforced by the backend entitlement layer as well as reflected in frontend routes and navigation. Hiding a button is not authorization.
- Kernel: Identity, tenant scoping, auditability, and the shared catalog/order data model remain platform foundations. A canteen must have at least one approved order-entry channel enabled before activation.
- Separation: KOT persistence/routing and the visual KDS are separate entitlements so a canteen may use printed KOTs without purchasing or enabling KDS.

### D-017 — Supabase-managed platform with an authoritative Mealy backend

- Status: **Superseded on 2026-10-21 by D-026**
- Decision: Supabase provides managed PostgreSQL, storage, and controlled real-time transport. A separately deployed Mealy application backend connects to Supabase PostgreSQL and owns authorization, tenant scope, pricing, order creation, token allocation, KOT lifecycle, payment/webhook processing, and fulfilment transitions.
- Boundary: Student, POS, KDS, and admin clients call versioned Mealy APIs; they do not write operational tables directly through Supabase. Supabase Realtime transports compact committed-event notifications, while clients refresh canonical records from the API.
- Open: Backend framework/runtime and the use of Supabase Auth remain **TBD**.

### D-018 — Outlet-local gateway and continuous offline recovery

- Status: **Confirmed**
- Decision: Every operating outlet uses a local gateway with a durable local store and synchronization outbox. POS, KDS, and KOT/receipt printers communicate over the outlet LAN and must remain usable during an internet outage.
- Online flow: The cloud backend delivers accepted online orders to the outlet gateway through a persistent outbound connection; the gateway persists, routes, displays, and prints the order locally.
- Offline flow: Counter orders are persisted locally, receive KOT/KDS handling locally, and are automatically uploaded in idempotent batches after connectivity returns. Day-end reconciliation is a fallback audit, not the normal sync mechanism.
- Tokens: The cloud reserves per-outlet/counter/service-date token blocks for offline use. Fixed global online/offline ranges are rejected because they waste capacity; block size and exhaustion policy remain **TBD**.

## Observed legacy technical decisions awaiting approval

### O-001 — Modular Laravel backend

- Status: **Observed / TBD for adoption**
- Current state: Laravel 12, PHP 8.2, Livewire, MySQL default, modular packages, Sanctum, queues, and Pusher-compatible real-time infrastructure.

### O-002 — React/Vite student client

- Status: **Observed / TBD for adoption**
- Current state: React 19, TypeScript, Vite, React Router, Tailwind/Radix-derived UI.

### O-003 — Global student identity

- Status: **Observed / TBD for adoption**
- Current state: a global `MealyUser` is linked to restaurants/canteens, with Sanctum tokens, phone OTP, Truecaller, and guest pathways.

### O-004 — Existing integration contracts

- Status: **Observed / TBD for adoption**
- Current state: consumer API under `/api/v1/mealy`; POS/app-integration API under `/api/application-integration`.

### O-005 — Payments and promotions

- Status: **Observed / TBD for launch**
- Current state: Razorpay order payment, wallet, coupon, commission/collection, and payout modules exist alongside many TableTrack payment providers.

## Newly approved decisions

### D-019 - Electron POS implementation begins with an isolated cashier shell

- Status: **Confirmed on 2026-09-21**
- Decision: Start the Windows Electron POS implementation under `apps/pos` using React and TypeScript. The first increment provides the cashier workspace, safe local draft recovery, clear connectivity/error states, and rapid item-availability controls.
- Boundary: It intentionally uses a local demo catalog behind a service adapter until versioned Mealy API contracts and authorization are implemented. It must not directly write operational PostgreSQL tables or imply that payments, printing, KOT dispatch, or offline cloud synchronization are production-complete.

### D-020 - Initial POS visual handoff

- Status: **Confirmed on 2026-09-21**
- Decision: Use the supplied Mealy wordmark and the supplied cashier-POS reference as the initial desktop POS visual direction: category rail, searchable menu grid, and focused current-bill panel.
- Open: Exact brand color tokens, application icon/favicons, food imagery, KDS reference, and broader visual states remain **TBD**. The implementation samples the supplied wordmark orange only as a provisional POS accent.

### D-021 - Separate platform-admin application and responsibility boundary

- Status: **Confirmed on 2026-10-10**
- Decision: Build `apps/admin` as Mealy's central platform-control application, separate from the future canteen-admin application. Platform admin manages campuses, canteen onboarding, feature entitlements, Mealy internal users, scoped roles and permissions, operational oversight, audit history, and safe platform defaults.
- Visual direction: Reuse the POS product language - Mealy wordmark, white/slate surfaces, orange actions and selection states, typography, radii, borders, status semantics, and feedback patterns - while using a collapsible sidebar suited to a broader administration information architecture.
- Boundary: Platform operators may observe and investigate order, KOT, device, and synchronization health, but do not perform routine kitchen preparation transitions. Canteen admins will configure their assigned catalog, stations, printer routing, and day-to-day operations without granting themselves new modules.
- Modeling: The existing `campuses` record represents the college/campus operating location in the first release; a separate college parent entity is not introduced without a future multi-campus institution requirement.
- Delivery: The first increment is a frontend-only React/Vite preview with demo data and service-ready boundaries. It must not imply backend authorization, Railway/PostgreSQL persistence, payment readiness, or live operational control.

### D-022 - Separate multi-canteen owner application with simple and advanced modes

- Status: **Confirmed on 2026-10-10**
- Decision: Build `apps/canteen-admin` as the owner and manager workspace, separate from central platform administration, POS, and KDS. One user may manage several assigned canteens through independent canteen-scoped memberships.
- Main view: The default sign-in destination contains portfolio/canteen statistics, order records, reports, and alerts only. It avoids setup controls so owners can quickly understand current performance.
- Advanced management: Menu, availability, inventory, outlets, business hours, kitchen routing, devices, printers, staff, roles, taxes, assigned modules, audit history, and business settings are available only after selecting one canteen explicitly.
- Safety: All-canteen aggregation is read-only for configuration purposes. Advanced mode keeps a persistent editing-context banner, cannot target `all canteens`, and must eventually enforce backend permissions, audit reasons, and module entitlements.
- Boundary: Routine order preparation remains in POS/KDS. Owners may inspect order records and configure operations but cannot self-enable modules or change campus assignments.
- Delivery: The initial application is a frontend-only React/Vite preview with realistic local state. Operational persistence, authentication, aggregation, and authorization remain backend work.

### D-023 - Initial standalone KDS shell with ticket-level preparation baseline

- Status: **Confirmed on 2026-10-11**
- Decision: Start `apps/kds` as a separate, outlet/station-scoped React/Vite kitchen display using the existing Mealy orange/slate product language. The first increment presents source-labelled KOTs in `New -> Preparing -> Ready` lanes with distance-readable tokens, elapsed-time urgency, guarded actions, gateway connectivity feedback, and responsive kitchen-display/tablet layouts.
- Boundary: The initial queue and transitions are frontend demo behavior behind a KDS service adapter. It does not claim live gateway/backend integration, authentication, entitlement enforcement, printing, durable offline storage, or approved exception handling.
- Open: Station splitting, delays, remakes, rejection, recall/completion behavior, sound policy, and exact device deployment remain **TBD**.

### D-024 - KDS supports per-item readiness within an order

- Status: **Confirmed on 2026-10-11**
- Decision: A preparing KOT supports readiness on each order line as well as the overall ticket. Kitchen staff may mark or correct individual item readiness, see completed-item progress, and may mark the complete order ready only after every item line is ready.
- Scope: Readiness applies to an item line and its full quantity in the initial workflow. Per-unit readiness, item splitting across stations, batch preparation across orders, remakes, and exception authorization remain **TBD**.
- Delivery boundary: The initial behavior is implemented in the frontend KDS service boundary and tests. The future backend and outlet gateway must enforce the same invariant atomically and audit every item transition.

### D-025 - Initial outlet gateway runtime and LAN contract

- Status: **Confirmed by implementation request on 2026-10-11**
- Decision: Build `apps/outlet-gateway` as an always-on Node.js/TypeScript service using Fastify and a WAL-mode SQLite local operational store. It binds to the outlet LAN, hosts the built KDS, provides a token-protected versioned API, records replayable local events, and commits every uploadable mutation to a durable synchronization outbox.
- Operational rule: POS order creation is idempotent, kitchen transitions are validated locally, and a ticket cannot become ready until every item line is ready. The KDS reads and updates this local source of truth, so routine kitchen work does not require an internet round trip.
- Boundary: This increment implements the LAN service, durable local records/outbox, KDS hosting, order intake, kitchen transitions, health, sync status, and an outbound sync worker contract. Cloud receiver integration, enrollment and certificate rotation, token-block reservation, printer adapters, staff authentication/authorization, conflict reconciliation, installer/service packaging, and production monitoring remain pending.

### D-026 - Railway-hosted modular backend, PostgreSQL, and backend-owned realtime

- Status: **Confirmed on 2026-10-21; supersedes D-017**
- Decision: Deploy the authoritative Mealy cloud backend and PostgreSQL database on Railway. Supabase is removed from the target architecture. The backend owns versioned APIs, authentication/session handling, authorization, tenant and entitlement enforcement, catalog/pricing, orders, payments/webhooks, tokens/KOTs, auditability, background work, and cloud real-time delivery.
- Shape: Keep one modular backend codebase. Deploy separate process types for the HTTP API, persistent WebSocket delivery, and background/outbox work only where their runtime characteristics differ; do not split menu, order, payment, token, or KOT domains into independent microservices at the initial expected scale of approximately 1,500 customers or orders per day.
- Realtime: Outlet gateways keep one authenticated outbound WebSocket connection to the cloud. The backend pushes complete committed order/event payloads without polling; the gateway durably persists before acknowledging and reconnects with its last accepted sequence/cursor to replay missed events. LAN POS/KDS/printer delivery remains the gateway's responsibility.
- Database: Railway PostgreSQL is the authoritative cloud store and must be private to backend services. Production requires explicit connection pooling, automated backups, off-platform logical dumps, restore drills, monitoring, and a documented high-availability/PITR decision.
- Clients: Web and installed clients call Mealy APIs and real-time endpoints only; no client receives operational database credentials or writes PostgreSQL directly.
- Scaling: Begin with one API process, one WebSocket process, and one worker process. Scale from measured rush-hour load and availability needs. Add shared Redis/pub-sub only when multiple replicas require cross-instance coordination, distributed rate limits, or shared cache invalidation.
- Hosting boundary: Student/QR/platform-admin/canteen-admin web builds may use Vercel or Cloudflare Pages. Electron POS and the outlet gateway remain outlet-installed. Object storage/CDN selection remains **TBD**; Railway-compatible storage or Cloudflare R2 are candidates.

### D-027 - Initial cloud backend and Docker implementation

- Status: **Confirmed by implementation request on 2026-10-21**
- Decision: Implement the modular cloud backend in Node.js/TypeScript with Fastify and PostgreSQL, sharing one codebase across API, WebSocket, and worker runtime modes. Use Docker Compose locally for PostgreSQL, one-shot migrations, API, realtime, and worker services.
- Modules: Establish authenticated session/bootstrap, catalog browsing, server pricing, idempotent order/token/KOT creation, order transitions, payment intent/manual cash boundaries, kitchen item/ticket readiness, platform onboarding, feature entitlements/dependencies, gateway enrollment, local-event upload, transactional-outbox publication, cloud event replay, and outlet-gateway WebSocket ingestion.
- Safety: Provider-dependent OTP, online payment capture, refunds, object storage, offline financial reconciliation, printer drivers, and production device certificate rotation remain explicit adapters or gated follow-ups; do not invent provider success or silently reconcile incomplete offline commercial data.
- Verification gate: Build the files and Docker wiring first, but do not start containers, connect services, apply migrations, or run tests until the user separately authorizes the run-and-test phase.

### D-028 - Dynamic-only operational clients

- Status: **Confirmed by implementation request on 2026-10-21**
- Decision: Existing POS, KDS, platform-admin, canteen-admin, and outlet-gateway runtimes must not insert demo, sample, or fallback operational records. They load authoritative records through Mealy backend or gateway contracts and show explicit loading, empty, unavailable, or error states when those contracts return no data or cannot be reached.
- Local boundary: Recoverable cashier drafts, held bills, connection state, and UI preferences may remain device-local because they represent user work in progress rather than fabricated server records.
- Incomplete capabilities: A visible feature without a completed backend contract must state that it is unavailable and must not simulate a successful write. The missing `student-web` application remains a separate build task and is not implied to exist by this decision.
- Verification: All six existing modules compile. The local Docker PostgreSQL, migration, API, realtime, and worker topology starts successfully with schema version 8; full authenticated workflows and outlet enrollment remain pending.

### D-029 - New responsive student web and motion direction

- Status: **Confirmed for planning on 2026-10-22**
- Decision: Build the production student ordering application under `mealy-platform/apps/student-web`. Preserve `../mealyapp/app` as a read-only flow reference because it targets the legacy API and contains existing uncommitted work.
- Visual direction: Use the supplied food-app image only as layout and hierarchy inspiration. Use only the approved Mealy wordmark from the platform, the existing Mealy orange/slate/near-white language, and backend-provided catalog/canteen media. Do not copy the reference brand, green palette, or imagery.
- Responsive direction: Design phone-first, with deliberate tablet and full laptop/desktop recompositions. Desktop must use its width for navigation, content grids, and contextual cart/order rails rather than display a phone-sized column.
- Motion direction: Implement meaningful page and shared-element transitions across startup/authentication, campus context, canteen cards, menu items, cart, checkout, token confirmation, and live order status. Respect reduced motion and never delay a critical action for animation.
- Delivery gate: Complete and approve the flow/design plan before application implementation. The plan is recorded in `STUDENT_WEB_PLAN.md`.

### D-030 - Student OTP, discovery, and online-payment baseline

- Status: **Confirmed on 2026-10-22**
- Identity: Student sign-up and sign-in are passwordless and phone-OTP-only. No password screen, guest account, or temporary browser identity is introduced. The SMS provider remains an adapter decision; production delivery must fail closed until a provider is configured.
- Discovery: The student homepage lists real canteens/outlets, each leading to its own live outlet menu. With consent, browser location is used to rank nearby campuses and their canteens; students can still choose a context manually.
- Payment: Student checkout is online-payment-only. Pay-at-counter/cash is not shown as a student option. Provider selection and credentials remain separate configuration work; the backend creates only an authorized provider handoff after a configured online method is available.

### D-031 - Razorpay for student web payments, implemented after web flow completion

- Status: **Confirmed on 2026-10-22**
- Decision: Razorpay is the selected online-payment provider for the student ordering flow. Complete and refine the responsive student web experience before beginning native Android and iOS delivery; Razorpay integration itself will follow a separate payment plan.
- Safety boundary: The browser may open Razorpay Checkout and report an immediate result, but only the Mealy backend may mark an order paid after server-side signature and webhook/status verification. Payment verification must match the Mealy checkout attempt, expected amount, currency, outlet, student, and unique provider identifiers.
- Order boundary: A student order must not reach KOT, outlet gateway, POS, or KDS as an accepted paid order until the approved Razorpay verification flow succeeds. The existing order/KOT creation sequence must be revised as part of the later payment implementation rather than connected prematurely from the current web checkout.

## Latest approved decisions

### D-032 - Restaurant and POS are the active product scope

- Status: **Confirmed on 2026-10-26**
- Decision: Pause student-app implementation and make counter pickup the active delivery scope: staff sign-in, counter billing, configured tender settlement, token/KOT, gateway-backed KDS preparation, collection, receipt/printing, and manager-controlled exceptions.
- Service type: POS exposes counter pickup only. Dine-in remains hidden until table assignment and service rules are separately approved.
- Offline boundary: Offline creation is cash-only and requires an open shift, reserved token, current price snapshot, and valid gateway commercial context. UPI/card remain online manual-reference tenders.
- Ownership: KDS owns preparation/ready, POS owns collection, and authorized managers own refunds and stock adjustments. Exceptions record a reason or durable event.

### D-033 - Restaurant setup is owner self-service with one-time gateway secrets

- Status: **Confirmed by implementation request on 2026-10-26**
- Decision: Authorized canteen owners/managers configure pickup business hours, tax rates, kitchen stations, POS terminals, printers, printer routing, and outlet gateway enrollment from Advanced management instead of requiring deployment or direct database access.
- Safety: Every write is tenant-scoped and permission-checked. Tax/category, counter, station, terminal, printer, and gateway references must belong to the selected canteen/outlet. Operational configuration changes create audit records.
- Secrets: Gateway enrollment and rotation return a private token once. Token hashes are never returned by setup reads or written into audit payloads. Losing a token requires rotation, which immediately invalidates the old token.
- Boundary: Physical printer queues, gateway installation as a Windows service, network/firewall setup, and outlet hardware certification still require onsite deployment work.

Remaining application-flow blockers are maintained in `PROJECT_CONTEXT.md`. Observability vendor, CI provider, object storage/CDN provider, Railway production sizing, PostgreSQL high availability/PITR, runtime database roles, retention, and post-MVP behavior remain **TBD** and should be decided when their implementation becomes imminent.
