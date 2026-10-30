# Features

Legend: **Confirmed** is approved product scope; **Observed** exists in legacy code but is not approved automatically; **TBD** requires a decision.

## Modular product control

### Confirmed

- Central/platform admin controls which modules each canteen receives and their effective dates/configuration.
- Disabled modules are absent from application navigation and rejected by backend authorization.
- POS, student ordering, QR ordering, KOT, KDS, printing, payments, wallet, coupons, inventory, dine-in, reservations, delivery, multi-POS, and reporting can be assigned independently where their dependencies allow it.
- KOT and KDS are separate: a canteen can use printed KOTs without the KDS interface.
- Canteen admins configure enabled modules but cannot grant themselves modules that central admin has not assigned.

## Student ordering application

### Confirmed

- Discover/browse a campus canteen menu.
- Select food and place a canteen order.
- Receive preparation/order-status updates.
- See an order token suitable for counter collection.
- Collect the prepared order from the canteen counter.
- Use a design direction distinct from the POS; final assets/references will come from the user.

### Observed, approval TBD

- Multi-restaurant discovery and nearby search.
- Item variations, modifier groups/options, quantities, and notes.
- Cart persistence, coupon preview, taxes/charges, and checkout instructions.
- Phone OTP, Truecaller, and guest sessions.
- Razorpay order payment, wallet top-up/payment, redeem codes, and coupons.
- Order history, cancellation, active-order banner, and feedback/ratings.
- Saved delivery addresses and delivery-oriented fields.
- Push-notification hooks and real-time/Pusher infrastructure.

## Canteen POS

### Confirmed

- Canteen-specific POS experience.
- Clean Mealy-specific POS UI; ProBills/Firebase is reference-only and will not be imported.
- Direct counter billing alongside student-app and QR-originated orders.
- Receive/identify student orders.
- Show token numbers and create/manage KOTs.
- Move orders through approved preparation and collection statuses.

### Observed, approval TBD

- Full catalog browsing, variations/modifiers, taxes, charges, tables, reservations, customers, waiters, delivery, tips, split payments, printing, cash-register sessions, and multi-POS machine registration.
- Per-order KOT creation and KOT-item status updates.
- Printer/receipt configuration and direct printing.
- Owner-configurable visibility of POS action buttons.

## Kitchen display system (KDS)

### Confirmed

- A separate, kitchen-focused interface rather than kitchen controls embedded inside the billing/admin application.
- Optional per-canteen module; KDS is shown only when enabled and requires KOT routing.
- Receive KOTs from POS counter orders, student-app orders, and QR orders through the shared backend.
- Show token/order identity, source, items, variants/add-ons, quantities, notes, timestamps, and preparation state.
- Advance approved KOT/item preparation states and propagate readiness to POS and student-facing surfaces.

## Canteen/admin management

### Confirmed

- Canteen operators need enough management capability to support menus, incoming orders, tokens, KOTs, and statuses.
- Central platform administration is a separate application from canteen administration.
- Platform admins manage campuses, canteen onboarding and lifecycle, module entitlements, Mealy internal users, scoped roles/permissions, operational oversight, audit history, and platform defaults.
- Platform operational monitoring is investigative and read-only for normal order/KOT execution; routine preparation and collection actions stay with canteen POS/KDS users.
- In the first release, a campus record represents the college/campus operating location. A separate college parent record is deferred until a multi-campus institution requirement is approved.
- One owner may hold access memberships for multiple canteens and view an aggregate portfolio without merging canteen-scoped operational records.
- The owner app defaults to a simple Main view for statistics, records, reports, and alerts. Configuration lives in a separate Advanced management mode that requires one explicit canteen context.
- Advanced owner controls cover assigned menu/catalog, availability, inventory, outlets/hours, kitchen routing, devices/printers, staff/roles, taxes/charges, activity, and settings, subject to backend permissions and enabled modules.

### Observed, approval TBD

- Canteen/restaurant, branch, menu, category, item, variation, modifier, tax, charge, order type, printer, receipt, staff/role, report, payment, coupon, wallet, payout, and feedback management.
- Superadmin restaurant/package/subscription controls.
- Commission collection and manual payout tracking.
- Customer/order data export and menu bulk import.

## Shared backend

### Confirmed

- Be the source of truth shared by the student/QR app, POS, KDS, and management surfaces.
- Coordinate student orders with canteen KOT/token/status operations.
- Avoid duplicated operational rules across frontends.
- Use the implemented PostgreSQL foundation for campus/canteen/outlet tenancy, catalog, POS, orders, tokens, KOTs, payments and central controls.

### Observed, approval TBD

- Laravel modular monolith rather than new independent services.
- MySQL, Sanctum bearer authentication, API-key middleware, rate limiting, Pusher, queues, S3-capable storage, Message Central OTP, and Razorpay.
- Global Mealy user identity linked to individual restaurants/canteens.
- Idempotent consumer order placement.

### Implemented foundation

- Central campus/canteen creation and assignment, outlets, counters and POS terminals.
- Scoped users, student profiles, staff memberships, roles and permissions.
- Variants, add-ons/modifiers, multi-component taxes, service charges, outlet availability/prices and inventory.
- Orders with immutable snapshots, atomic tokens, KOT routing/history and reliable outbox events.
- POS registers/shifts/cash, printers/print jobs and receipts.
- Payment/refund, promotion, wallet, commission/payout and subscription structures behind feature controls.

## Explicitly not approved yet

Delivery logistics, dine-in/table service, reservations, hotel room service, delivery partners, loyalty, subscriptions, marketplace discovery, ratings, coupons, wallet, and every payment/provider not selected in the blocking decisions are **TBD**, not MVP commitments.
