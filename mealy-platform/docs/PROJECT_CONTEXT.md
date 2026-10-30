# Project Context

## Document status

- Documentation baseline: **Approved to begin foundation work on 2026-09-14**
- Database foundation: **Implemented and locally verified**
- Student/POS/KDS/admin UI implementation: **Clean separated-app direction approved; student web now implements live configured-outlet browsing, local cart, and backend price quotes while authentication/order completion decisions remain below**
- Evidence used: the user's current project summary plus read-only inspection of `../mealyapp/` and `../mealy-backend/` on 2026-09-13
- Prior Mealy-specific requirements outside the available conversation: **TBD**; no Mealy entry was found in the local conversation-memory registry

## Product statement

**Confirmed:** Mealy is a campus food-ordering platform for students. Students browse a canteen menu, place an order, receive preparation updates, and collect food from the counter. The product should reduce counter crowds and help canteens identify and fulfill orders using token numbers, kitchen order tickets (KOTs), and order-status updates.

**Confirmed:** Mealy includes clean, separately designed student/QR ordering, counter POS, kitchen/KDS, and admin/management interfaces. The combined ProBills/Firebase app will not be imported because it was designed as an all-in-one small-cafe product. It may be consulted only for useful workflow ideas. All Mealy clients use the shared backend and PostgreSQL source of truth.

**Confirmed:** Mealy is modular per canteen. Central/platform admin assigns the required modules; unused modules are not provided. Backend entitlement checks, not UI hiding, control access. KOT routing and the optional KDS interface are separate capabilities so a canteen may use printed KOTs without KDS.

**Confirmed on 2026-10-21:** Railway hosts the modular Mealy cloud backend, its API/WebSocket/worker process types, and PostgreSQL. Supabase is not part of the target architecture. Outlet gateways receive pushed orders over one persistent authenticated WebSocket, acknowledge only after local persistence, and replay missed events from a sequence/cursor after reconnecting. The initial scale target of approximately 1,500 customers or orders per day does not justify feature-specific microservices.

**Confirmed on 2026-10-22:** Student identity is passwordless phone OTP only; the provider is still to be chosen. Student discovery lists real canteens/outlets and ranks nearby campuses after location consent. Student checkout is online-payment-only using Razorpay. The responsive web flow is the current delivery priority; native Android and iOS follow later, and Razorpay integration will be implemented under a separate payment plan.

## Product areas

| Area | Confirmed responsibility | Current evidence |
| --- | --- | --- |
| Student ordering application | Browse menu, order, see preparation progress, collect at counter | `apps/student-web` provides a phone-first, desktop-responsive Mealy-only shell with discovery, configured-outlet catalog browsing, variants and kitchen notes, browser-local cart, backend price quotes, OTP UI/contracts, and Razorpay checkout-readiness states; legacy React/Vite apps remain reference-only. Production OTP delivery, verified order/payment placement, token confirmation, and status tracking remain pending |
| Canteen POS | Counter billing; identify/process POS, student-app, and QR orders; tokens, payment, KOT dispatch, receipts | Clean Mealy UI approved; legacy and ProBills implementations are reference-only |
| Kitchen display system | Receive KOTs from every approved order channel and manage preparation through readiness | Standalone KDS uses the live outlet-gateway queue/actions and shows no substitute tickets when the gateway is unavailable; exact workflow/device design remains TBD |
| Platform administration | Create campuses/canteens, assign modules, manage Mealy team access, and oversee operations/audit | `apps/admin` reads backend campuses, canteens, modules, team, roles, operations, and audit data; some write contracts remain pending |
| Canteen administration | Operate one or more assigned canteens without self-granting modules | `apps/canteen-admin` reads a scoped backend snapshot and supports availability/outlet-ordering writes; unfinished configuration contracts show unavailable states |
| Shared backend | Shared source of truth for identity, catalog, orders, KOTs, status, integrations, background work, and cloud realtime | TypeScript/Fastify API, WebSocket, worker, Docker, and migration 008 are implemented; local Docker health/readiness passes while full authenticated workflow testing remains pending |

## Read-only legacy inventory

### `../mealyapp/`

- Git repository: `mealy-in/mealyapp`, branch `main`.
- Student UI: React 19, TypeScript, Vite, React Router, Tailwind/Radix-style components.
- Pages observed: home, search within home, restaurant/menu, item customization, cart, checkout, order success/history/detail, OTP auth, profile, addresses, wallet, coupons, help.
- API client observed: consumer API at `/api/v1/mealy`, Sanctum bearer token in `localStorage`, API-key header, OTP, Truecaller, guest access, Razorpay, wallet, coupons.
- Current hygiene issue: `app/.env.local`, `app/dist/`, and `.vercel/project.json` are tracked; two development log files are untracked.

### `../mealy-backend/`

- Git repository, branch `main`.
- `tabletrack/`: Laravel 12/PHP 8.2 modular monolith with Livewire POS/admin, MySQL default configuration, Sanctum, queues, Pusher, printing, KOTs, tokens, payment providers, and operational management.
- Mealy modules observed: `MealyApi`, `MealyCore`, `MealyCoupons`, `MealyFeedback`, `MealyPayments`, `MealyShopExtras`, `MealyUser`, and `MealyWallet`.
- `RestApi` exposes a second, POS-oriented API under `/api/application-integration`.
- `customer-site/app/`: a newer React/Vite student frontend that substantially diverges from `../mealyapp/app`; it adds feedback, search, generated OpenAPI types, error boundaries, pending-payment handling, analytics hooks, push hooks, richer Truecaller handling, and more.
- `changes-core-tabletrack/`: core override files that must be understood before any future migration or upgrade.

## Scope control

The existing TableTrack product includes restaurant delivery, dine-in tables, reservations, delivery partners, hotels, multi-POS, many payment gateways, subscriptions, and other restaurant features. Their presence in code does not make them approved Mealy scope. Unless approved, each remains **TBD/out of MVP**.

## Blocking questions before development

The database no longer has a blocking question: it deliberately models optional capabilities behind canteen feature controls. These decisions still block the corresponding application flows:

1. Is the first release counter-pickup only, or must it retain dine-in, delivery, reservation, wallet, coupon, feedback, or multi-restaurant discovery features?
2. Confirm or revise the implemented pickup baseline: `placed -> confirmed -> preparing -> ready_for_pickup -> collected`. Cancellation/rejection rules are configurable but need product approval before UI/API wiring.
3. Razorpay is selected for online-only student checkout. The remaining payment blocker is the exact verified-payment-to-order/KOT sequence, including failure, pending, retry, cancellation, and refund behavior.
4. Student sign-in is phone OTP only. The remaining identity blocker is SMS-provider selection and production configuration.
5. Database mapping is canteen organization -> campus assignment -> physical outlet -> service counter -> POS terminal. The student-facing campus selection/verification UX remains **TBD**.
6. For QR orders, does each code identify the outlet, a service counter, a table/zone, or another pickup point, and may guests order without sign-in?
7. Per-item-line readiness inside a ticket is approved. Per-unit readiness, batch preparation, and item splitting across multiple stations remain **TBD**.
8. Provide remaining colors, screenshots, and separate student/POS/KDS references before visual implementation begins.
