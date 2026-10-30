# API

## Contract policy

- API behavior must be versioned, documented, validated, and shared with frontend types.
- The backend is authoritative for prices, totals, permissions, tokens, KOTs, payment state, and fulfillment transitions.
- All write endpoints must define authentication, authorization, validation, idempotency/retry behavior, errors, and audit effects.
- Every module endpoint must enforce the effective canteen entitlement server-side and return a stable feature-disabled error when unavailable.
- Exact target contracts remain **TBD** until the MVP feature set and workflows are approved. Legacy and ProBills contracts are references, not target contracts.

## Existing consumer API (observed)

Base path: `/api/v1/mealy`.

Security observed:

- Optional/configurable `X-Mealy-Api-Key` middleware.
- Laravel Sanctum bearer token on protected routes.
- Public and authenticated rate-limit groups.
- Custom CORS and module-enabled middleware.

Endpoint groups verified in backend routes/spec:

| Group | Existing capabilities |
| --- | --- |
| Meta | API metadata and served OpenAPI documentation |
| Auth | register, guest, login, request/verify OTP, Truecaller config/callback/complete |
| Discovery | restaurant listing and GPS-nearby listing |
| Restaurant/catalog | restaurant, branches, order types, payment methods, menus, catalog, item detail, rating summary |
| Student profile | get/update profile, logout, delivery-address CRUD |
| Orders | create, list, detail, cancel, feedback read/write |
| Payments | create and verify Razorpay order payment |
| Wallet | balance, transactions, Razorpay top-up create/verify, redeem code |
| Coupons | list and preview |

Notable drift: `../mealyapp/docs/openapi.yaml` omits feedback endpoints that exist in the backend OpenAPI file. The backend module spec is the stronger current reference, but target source-of-truth ownership is **TBD**.

## Existing POS integration API (observed)

Base path: `/api/application-integration`.

- Login plus Sanctum-protected user/config/permissions/branch-switch routes.
- Menu, category, item, variation, modifier, tax, charge, order-type, and table data.
- Order create/update/list/detail/status/payment/tip/split-payment operations.
- KOT create/list/detail/status and KOT-item status operations.
- Customer, reservation, waiter, delivery, notification, printer/receipt, Pusher, cash-register, and multi-POS operations.
- Feature/package middleware protects the main POS group.

The API is much broader than confirmed campus pickup scope. Do not port all routes by default.

## Minimum target API surface (proposed)

Exact paths/payloads/status codes are **TBD**.

## Initial cloud API implementation

The Fastify implementation defines these versioned module boundaries. On 2026-10-30 schema version 12 and the authenticated ThaliTrack pickup workflow were verified locally end to end.

| Module | Initial routes |
| --- | --- |
| Health | `GET /health`, `GET /ready` |
| Identity | `POST /v1/auth/bootstrap-session`, `POST /v1/auth/staff-session`, `GET /v1/auth/me`, `POST /v1/auth/logout` |
| Student discovery and identity | `GET /v1/student/discovery`, `POST /v1/student/auth/otp/request`, `POST /v1/student/auth/otp/verify`, `GET /v1/student/me` |
| Hackathon demo identity | `POST /v1/auth/demo-session` only when `MEALY_DEMO_MODE=true`; returns Aarav, Meera, or manager sessions backed by seeded users |
| Catalog | `GET /v1/catalog/outlets/{outletId}`, `PUT /v1/catalog/outlets/{outletId}/items/{itemId}/availability` |
| Pricing | `POST /v1/pricing/quote` |
| Orders | `POST /v1/orders`, `GET /v1/orders`, `GET /v1/orders/{orderId}`, `POST /v1/orders/{orderId}/transitions` |
| ThaliTrack student | pickup slots, queue status, and surplus offers under `/v1/student/outlets/{outletId}/*` |
| ThaliTrack manager | rush board, per-dish forecast, leftover logging, and surplus offer creation under `/v1/management/outlets/{outletId}/*` |
| Payments | `GET /v1/payments/outlets/{outletId}/methods`, `POST /v1/orders/{orderId}/payment-intents`, `POST /v1/payment-intents/{intentId}/manual-capture`, `POST /v1/payments/webhooks/{provider}` |
| Kitchen | `GET /v1/kitchen/tickets`, ticket start, item readiness, and ticket ready routes |
| Platform admin | feature catalogue, campus list/create, canteen onboarding, team, roles, audit, operations, canteen entitlement update, and gateway enrollment routes under `/v1/admin/*` |
| Canteen management | Portfolio snapshot plus scoped catalog, stock, staff, business-hour, tax, station, terminal, printer/route, and gateway setup reads/writes under `/v1/management/*` |
| Gateway upload | `POST /v1/outlet-sync` |
| Gateway realtime | `GET /v1/realtime/gateway` as an authenticated WebSocket on the realtime process |
| POS operations | POS context, shift open/close, configured settlement, full refund, and receipt routes under `/v1/pos/*` |
| Gateway operations | token reservation, print claim/result, entitlements, offline reconciliation, KDS delay/remake, and durable replay |
| Management writes | live menu/staff creation, availability, outlet state, audited stock adjustments, and audited restaurant setup under `/v1/management/*` |

### Restaurant setup management

All routes require an authenticated scoped staff session. Tax writes require `catalog.manage`; outlet hours, terminals, stations, printers, routes, and gateways require `outlet.manage`. Reads never return gateway token hashes.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/v1/management/canteens/{canteenId}/setup` | Returns pickup hours, counters, tax categories/rates, terminals, kitchen stations, printers/routes, and gateway health for one authorized canteen. |
| `PUT` | `/v1/management/outlets/{outletId}/business-hours` | Atomically replaces the seven-day pickup schedule and records an audit event. |
| `POST`, `PUT` | `/v1/management/canteens/{canteenId}/tax-rates[/{taxId}]` | Creates or edits a tax rate and its canteen-scoped tax-category assignments. Existing order tax snapshots remain unchanged. |
| `POST`, `PUT` | `/v1/management/outlets/{outletId}/terminals[/{terminalId}]` | Enrolls or edits a POS terminal and optional same-outlet counter assignment. |
| `POST`, `PUT` | `/v1/management/outlets/{outletId}/kitchen-stations[/{stationId}]` | Creates or edits a KDS/KOT station. |
| `POST`, `PUT` | `/v1/management/outlets/{outletId}/printers[/{printerId}]` | Enrolls or edits a printer, Windows queue name, paper width, and status. |
| `POST`, `DELETE` | `/v1/management/outlets/{outletId}/printer-routes[/{routeId}]` | Adds or removes receipt/KOT routing with same-outlet station and terminal validation. |
| `POST` | `/v1/management/outlets/{outletId}/gateways` | Enrolls an outlet gateway and returns its private token once. |
| `POST` | `/v1/management/outlets/{outletId}/gateways/{gatewayId}/rotate-token` | Invalidates the old token and returns a replacement once. |

Bootstrap identity exists only to create the first platform administrator securely. Student sign-in is passwordless phone OTP. `MEALY_OTP_PROVIDER=console` logs codes only in local development; production refuses console delivery and will return an unavailable response until the selected SMS adapter is configured. Student discovery returns active campuses and their active outlets, ordered by supplied browser coordinates when permission is granted. Student payment methods exclude cash. Razorpay is the selected student provider, but the current provider-neutral intent endpoint continues to expose a provider-adapter-required state until the later Razorpay plan implements server-side order creation, signature/webhook verification, pending recovery, and verified order/KOT release.

Production administrator bootstrap is disabled by default. A controlled initial provisioning window must set `MEALY_BOOTSTRAP_ADMIN_ENABLED=true`, use a minimum 32-character token, and then disable and rotate that token. API requests have bounded bodies and rates, non-health responses are non-cacheable, untrusted proxy headers are ignored unless explicitly enabled, and authentication routes use a stricter limit. Idempotency keys are required where documented, limited to 160 safe characters, and financial/inventory retry paths serialize before applying effects.

## Outlet gateway LAN API (implemented initial contract)

Base URL: `http://<gateway-lan-ip>:8788`. The gateway serves the built KDS at `/kds/` and exposes a versioned LAN API under `/v1/`.

Security:

- `/health` is available without a token for local monitoring.
- `/v1/*` requires `X-Mealy-Gateway-Token` whenever `MEALY_GATEWAY_LAN_TOKEN` is configured; production refuses a missing token or one shorter than 24 characters.
- Every browser origin, including a gateway-hosted KDS origin, must appear exactly in `MEALY_GATEWAY_ALLOWED_ORIGINS`.
- Requests, event-stream clients, and cloud/realtime payloads have configured ceilings. Production cloud URLs must use HTTPS/WSS and a strong gateway token.
- This service is for a trusted private outlet LAN and must not be exposed directly to the public internet.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Minimal gateway/store health without outlet or cloud-authentication details. |
| `GET` | `/v1/context` | Gateway, outlet, station, and capability context. |
| `GET` | `/v1/kitchen/tickets` | Canonical local KDS queue. |
| `POST` | `/v1/orders` | Persist a counter/POS order and its KDS ticket; requires `Idempotency-Key`. |
| `POST` | `/v1/kitchen/tickets/{ticketId}/start` | Move a new ticket to preparing. |
| `POST` | `/v1/kitchen/tickets/{ticketId}/items/{itemId}/readiness` | Set one item line's `ready` boolean. |
| `POST` | `/v1/kitchen/tickets/{ticketId}/ready` | Mark a ticket ready only when every item line is ready. |
| `GET` | `/v1/events` | Replayable server-sent LAN event stream using event sequence IDs. |
| `GET` | `/v1/sync/status` | Durable outbox counts and connected KDS client count. |
| `POST` | `/v1/sync/flush` | Request an immediate cloud-sync attempt. |

Local mutations commit the operational record, event log, and cloud-sync outbox entry in one SQLite transaction. Success uses `{ data, meta? }`; errors use `{ error: { code, message, fields?, request_id? } }`. Invalid transitions return `409`. Cloud receiver, device enrollment, printer claim/result, token-block reservation, and reconciliation endpoints are implemented. Physical hardware and installed-service certification remain release checks.

### Student ordering application

- Session/auth: request OTP, verify OTP, current student, logout; guest/Truecaller only if approved.
- Context: resolve/select campus and canteen.
- QR context: resolve a signed/scoped QR target and expose only the permitted outlet/counter/menu context.
- Catalog: canteen summary, availability, menu/categories/items/options.
- Checkout: server quote/preview if prices, tax, discount, fees, or payment require it.
- Orders: idempotent create, list, detail, allowed cancellation.
- Payments: create/confirm provider intent and receive server-side webhook if online payment is approved.
- Updates: authenticated backend WebSocket subscription with sequence/version recovery; HTTP is retained for initial hydration and explicit recovery, not continuous polling.

### Canteen POS

- Session/current staff/canteen/terminal and permissions.
- Catalog needed for direct POS ordering, if in scope.
- Incoming orders and order detail.
- Atomic, authorized status transitions.
- Retry-safe KOT create/reprint/status operations.
- Token lookup/validation and collection completion.
- POS-created order/payment/receipt operations only if approved.

### Kitchen display system

- Session/current staff/outlet/KOT-station context and permissions.
- Recoverable KOT queue with explicit POS, student-app, and QR order sources.
- Atomic, authorized ticket/item preparation transitions.
- Delay, rejection, remake, readiness, reprint, and exception operations only as approved.
- Realtime event consumption with sequence/version recovery and a canonical queue refresh endpoint.

### Canteen/admin management

- Canteen/outlet/counter/terminal configuration as approved.
- Menu/category/item/option/availability management.
- Staff/role management.
- KOT destination/printer/status configuration.
- Order/report/payment configuration only for approved MVP features.
- Read effective capabilities and configure only modules already assigned to the canteen.

### Central/platform administration

- List the module catalogue, dependencies, defaults, and configuration schema.
- Enable, configure, schedule, or disable a module entitlement for a canteen with audit history.
- Validate dependencies and activation rules, including at least one order-entry channel for an active canteen.
- Return effective capabilities for each authenticated application context.

## Proposed response and error conventions

- Success envelope: `{ data, meta? }`; error envelope: `{ error: { code, message, fields?, request_id? } }`.
- Machine-readable stable error codes; safe human-facing messages.
- Cursor pagination for growing event/order lists or approved page pagination for compatibility: **TBD**.
- Timestamps in UTC ISO 8601; display conversion at clients.
- Money represented in minor units plus ISO currency.
- Reject invalid status transitions with `409 Conflict`.
- Use an `Idempotency-Key` header for order/KOT/payment-sensitive creates.
- Optimistic concurrency/version field for contested operational updates: **TBD**.

## Real-time contract

Cloud transport is an authenticated WebSocket owned by the Railway-hosted Mealy backend. Outlet gateways maintain one outbound connection and receive complete committed order/event payloads without polling. The gateway persists before acknowledging; reconnect requests include the last accepted sequence/cursor so the backend can replay missed durable outbox events. The realtime process passes local Docker health checks; the enrolled-gateway end-to-end workflow remains untested.

Each event must include event ID, order UUID, canteen/outlet scope, event type, authoritative current state or sufficient canonical payload, occurred-at timestamp, and version/sequence. Consumers deduplicate by event ID/version. HTTP queue/order refresh remains available for initial hydration, explicit recovery, or a detected unrecoverable version gap. Exact handshake, heartbeat, acknowledgement, replay-window, backpressure, and close/error schemas remain **TBD**.
