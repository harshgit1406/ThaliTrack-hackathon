# Database

## Adopted foundation

- Engine: PostgreSQL 16+.
- Production provider: Railway PostgreSQL in the same selected region as the Mealy backend services.
- Location: `apps/backend/database/`.
- Migrations: twelve append-only, framework-neutral SQL migrations with a SHA-256 migration ledger.
- Verification: clean Docker replay plus transactional schema smoke test passed on 2026-09-14.
- Migration 007 was previously verified at 112 tables, 215 foreign keys, 305 check constraints, 220 indexes, 11 functions, and 74 non-internal triggers. Migration 008 adds outlet gateway enrollment, durable cloud replay, and gateway-ingest tables; its updated catalog totals remain pending the authorized Docker verification phase.

The new database is independent from the ignored legacy MySQL/TableTrack database.

## Domain coverage

### Student application

- Users, external auth identities, revocable sessions, login challenges and student profiles.
- Campus memberships/verification, saved addresses and notification preferences/devices.
- Carts, item customization, order history/ownership, active statuses, tokens, feedback and optional wallet.

Authentication providers and student campus-selection UX remain **TBD**, but the schema does not require a destructive redesign when they are selected.

### ThaliTrack forecasting and pickup

- Outlet-local 10-minute pickup slots have capacity and lifecycle state; student orders reference the selected slot.
- Daily dish demand history records ordered, prepared, and leftover quantities plus rush index and weather label.
- Closing-time leftover logs retain kilograms and portions for forecast correction and food-saved reporting.
- Campus timetable rush windows capture weekday lecture endings and their expected demand multiplier.
- Time-bounded surplus offers link discounted remaining portions to a catalog item without altering its normal price.
- The demo seed contains 28 days x 10 dishes = 280 realistic, deterministic observations and no personal data.

### Campus, canteen and central administration

- Campuses and platform-managed canteen organizations.
- Many-to-many campus/canteen assignments through `campus_canteens`.
- Physical outlets, service counters and registered POS terminals.
- Platform/campus/canteen/outlet scoped memberships, system roles and permissions.
- Feature definitions and per-canteen entitlements/configuration.
- Effective dates, typed configuration payloads, and the updating actor are stored for every canteen entitlement. The generic model supports admin-controlled modules without adding a new table per feature.
- The current seed combines kitchen tickets and display behavior under `kot`; before application release, append a migration introducing distinct `qr_ordering`, `kds`, and any other approved module codes/dependencies. Do not rewrite the existing migration.
- Scoped settings, business hours, temporary closures, onboarding checklists and subscriptions.
- Audit logs and data-subject requests.

### Catalog, variants, add-ons and tax

- Menus assigned to outlets, schedules and hierarchical categories.
- Catalog items with food classification, media, SKU, preparation time and visibility.
- Variants with a single default variant per item.
- Modifier groups/options (add-ons) with minimum/maximum selection, quantity and free-selection controls.
- Item/variant-specific modifier assignment.
- Outlet item/variant availability, price overrides, sold-out windows and daily limits.
- Time/channel/outlet-aware price rules.
- Multi-component tax categories/rates, inclusive pricing and compound calculation order.
- Fixed/percentage service charges and immutable order tax/charge snapshots.
- Allergens, ingredients/inventory items, recipes, balances and immutable movement ledger.

### Orders, tokens and kitchen

- Daily outlet-scoped order number sequences.
- Counter/service-date-scoped token sequences with atomic, idempotent allocation.
- Server-calculated order totals and immutable item, variant, modifier, tax, charge and pricing snapshots.
- Student, POS, admin, kiosk and API order channels; pickup is the default.
- Data-driven order statuses/transitions, actor restrictions, reason-required exceptions, optimistic version checks and complete event history.
- Kitchen stations and item routing, multi-KOT/revision support, KOT item/modifier snapshots and KOT events.
- Transactional outbox events for reliable POS/student updates.
- Durable cloud gateway event sequences, per-gateway acknowledgement cursors, and idempotent outlet-event ingestion for WebSocket replay and reconnect recovery.

Initial pickup lifecycle: `placed -> confirmed -> preparing -> ready_for_pickup -> collected`, with controlled cancellation/rejection paths. Product confirmation is still required before API/UI wiring.

### POS operations

- Terminals/counters, printers/routes/retryable print jobs, receipts and receipt sequences.
- Cash registers, single-active-shift constraint, cash movements and reconciliation fields.
- Optional dining areas/tables/reservations and delivery assignments.
- Direct POS orders use the same authoritative order and KOT records as student orders.

### Payments and platform finance

- Canteen/outlet payment-method configuration stores only secret-manager references.
- Payment intents, immutable transactions, refunds and provider replay protection.
- Promotions/codes/redemptions and order discount snapshots.
- Student wallets with optimistic balance version and immutable idempotent ledger.
- Optional commission rules, platform collections, payout allocation and canteen subscriptions.

### Split payments

- One order can have multiple `payment_intents`, and each intent can use a different payment-method configuration and amount.
- `orders.payment_status` includes `partially_paid`; payment transactions and refunds retain tender-specific provider references.
- This is sufficient to represent mixed tenders such as cash plus UPI or wallet plus card.
- Production-safe split settlement is **TBD in the backend**: it must atomically lock/version the order, derive the remaining balance from successful net transactions, prevent unintended overpayment, and apply an approved tender-aware refund policy.
- The point at which a partially or fully paid order enters the KOT workflow is a **blocking product decision**.

## Enforced invariants

- Money is integer minor units; inventory quantities are `numeric(18,6)`.
- Active email/phone identity uniqueness and E.164-format checks.
- Tenant/location foreign keys and cross-scope validation for terminals, orders, menus, modifiers, roles and promotion codes.
- Atomic order/token sequences use single-statement upserts and row locks.
- `transition_order` validates configured transitions/actors/reasons, checks optional expected version, writes history and emits an outbox event in one transaction.
- KOT, order, payment, refund, wallet, inventory, webhook, print and generic API operations have idempotency/replay keys where side effects matter.
- Historical commercial data remains readable after catalog changes through snapshots and restrictive deletes.
- Migration checksums prevent editing an already-applied migration.

## Application-layer responsibilities

The database is a strong integrity boundary, but the backend must still:

- Authorize user membership and permission before calling privileged functions.
- Resolve tenant/campus/canteen/outlet scope server-side.
- Calculate and validate catalog availability, modifier rules, taxes, charges, discounts and final totals.
- Grant the runtime DB role least privilege, including execution-only access to sequence/transition functions where appropriate.
- Encrypt sensitive push/provider material and avoid storing raw secrets or OTPs.
- Publish outbox events and process webhook/print retries safely.
- Coordinate with the outlet-local gateway: reserve token blocks while connected, accept idempotent offline-sync batches, and reconcile exception records without silently overwriting either source.

## Production environment

- Railway PostgreSQL is the confirmed production target; Supabase is not part of the target architecture.
- The database is reachable only by authorized backend/worker services over private networking. Browser, POS, KDS, admin, and outlet devices never receive database credentials.
- Automated volume backups, an off-platform logical dump schedule, and tested restoration are mandatory before a live canteen depends on the service.
- Connection pooling, high availability, PITR objectives, production sizing, read replicas, runtime roles/RLS policy, retention/anonymization periods, reporting replicas, partition thresholds, and operational alerts remain **TBD**. They must be resolved before production deployment, not before API development.
