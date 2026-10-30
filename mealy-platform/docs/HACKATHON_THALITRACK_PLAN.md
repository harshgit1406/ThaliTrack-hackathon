# ThaliTrack Hackathon Gap Analysis and Build Plan

## Status

- **Brief requirement:** PS-06 asks for campus canteen pre-ordering, 10-minute pickup slots, a live queue, next-day per-dish forecasts, and food-waste reporting.
- **Observed:** Mealy already has separate student web, canteen management, KDS, POS, gateway, Fastify backend, PostgreSQL migrations, orders, tokens, KOTs, and status transitions.
- **Proposed:** Use the existing Mealy platform as the base and add a narrow ThaliTrack demo slice. Do not rebuild the platform or add another backend.
- **TBD:** Hackathon deadline/build-time budget, event rules, and the approved demo authentication/payment behavior.

## Executive recommendation

The strongest submission is one complete story:

1. Two students choose food and different available 10-minute pickup slots.
2. Both orders receive IDs/tokens in under 30 seconds.
3. The canteen dashboard updates without a page reload, shows slot load and estimated wait, and lets staff mark an order ready.
4. The manager opens tomorrow's forecast by dish, logs today's leftover kilograms, and sees estimated food saved.

Keep real payment, delivery, native apps, advanced ML, printer certification, and full offline-outlet setup outside the hackathon demo.

## Requirement coverage

| Brief requirement | Current status | Evidence / gap | Required work |
| --- | --- | --- | --- |
| Menu and pre-order | **Partial** | Live catalogue, cart, OTP contracts, price quote, and backend order creation exist. Student checkout is deliberately disabled. | Add pickup-slot selection, submit the existing order contract, return order ID/token, clear cart, and show confirmation. |
| 10-minute pickup slots | **Partial foundation** | `outlets.max_orders_per_slot` exists but is not used. Orders have no pickup-slot relationship. | Add slot persistence/availability, capacity enforcement in the order transaction, and slot UI. |
| Live queue status | **Partial** | Typical preparation minutes and a real KDS queue exist. There is no public current wait time or orders-per-slot response. | Add queue summary API and poll it every 2-3 seconds for the demo. Show slot load, queue position, and estimated wait. |
| Canteen dashboard | **Partial** | Canteen admin reads live orders; KDS can transition tickets to ready through the gateway. The management order view is read-only. | Add a focused live rush board grouped by slot and a guarded ready action using the existing transition contract. |
| Demand forecast | **Missing** | No forecast model, endpoint, or chart. | Generate four weeks of realistic dish/order data and add an explainable moving-average forecast per dish. |
| Food saved in kg | **Missing** | Inventory supports a generic waste movement, but no leftover log or saved-food metric exists. | Store daily per-dish leftover kg and calculate saved kg against a documented four-week baseline. |
| Leftover logging | **Missing** | No closing workflow. | Add manager form, validation, audit fields, and forecast adjustment. |
| Surplus alerts after 3 PM | **Missing** | No surplus model or student alert UI. | P1 only: expose discounted surplus dishes after the configured time. |
| Timetable-aware rush prediction | **Missing** | No lecture timetable data. | P1 only: seed lecture end times and overlay predicted rush windows. |
| Two-phone live demo | **Not ready** | Students can browse concurrently but cannot place orders. Browser-facing realtime is absent. | Complete student ordering and use short polling for reliable demo synchronization. |

## Product scope

### P0: required for submission

- Student live menu, cart, pickup-slot selection, mock payment confirmation, order creation, ID/token, and order status.
- Capacity-controlled 10-minute slots and a live wait/slot-load indicator.
- Canteen rush dashboard with incoming orders grouped by slot and `New -> Preparing -> Ready` actions.
- Four-week sample dataset for 10 dishes.
- Tomorrow forecast quantity per dish using an explainable model.
- Leftover kilograms entry and estimated food-saved kilograms.
- Railway backend/PostgreSQL deployment and two Vercel projects: student web and canteen dashboard.
- A rehearsed two-phone demo plus a laptop dashboard.

### P1: add only after P0 is stable

- Discounted surplus alerts after 3 PM.
- Lecture timetable overlay for predicted rush periods.
- Forecast confidence band and CSV export.

### Explicitly out of scope

- Real money movement, refunds, delivery, native mobile apps, neural-network forecasting, multi-region scaling, and physical printer/gateway certification.
- Reworking the POS, platform-admin, or the broader offline architecture unless a P0 path depends on it.

## Proposed technical design

### Database migration

Add an append-only migration with:

- `pickup_slots`: outlet, start/end time, capacity, status, and uniqueness per outlet/start time.
- `orders.pickup_slot_id`: nullable for existing POS/offline orders, required for new student-web orders.
- `leftover_logs`: outlet, catalogue item, business date, leftover kg, logger, timestamps, and one active log per dish/day.

Capacity must be checked and locked inside the existing order transaction so two phones cannot overbook the final slot.

### API contracts

- `GET /v1/student/outlets/:outletId/pickup-slots?date=YYYY-MM-DD`
- Extend `POST /v1/orders` with `pickup_slot_id` for `student_web`.
- `GET /v1/student/outlets/:outletId/queue-status`
- `GET /v1/management/outlets/:outletId/rush-board`
- Existing `POST /v1/orders/:orderId/transitions` for staff actions.
- `POST /v1/management/outlets/:outletId/leftovers`
- `GET /v1/management/outlets/:outletId/forecast?date=YYYY-MM-DD`

For the hackathon, clients should poll queue/rush endpoints every 2-3 seconds. This is simpler and safer for the demo than extending the gateway-only WebSocket protocol.

### Forecast method

Use a transparent four-week weighted moving average:

- Start with the average ordered quantity for the same weekday across the prior four weeks.
- Weight recent weeks more heavily.
- Reduce the recommendation when that dish repeatedly produced leftovers.
- Round to a non-negative whole cooking quantity.
- Return the historical values, leftover adjustment, final recommendation, and a short human-readable explanation.

Estimated food saved in kg should be `max(0, historical average leftover kg - current leftover kg)` summed across dishes. Label it as an estimate, not a measured environmental claim.

## Deployment plan

### Railway

Create one Railway project with PostgreSQL plus three services built from `mealy-platform/apps/backend`:

1. API: `node dist/api.js`, public domain, `/health` health check.
2. Realtime: `node dist/realtime.js`, public only if the outlet gateway demo needs it.
3. Worker: `node dist/worker.js`, private service.

Before deployment:

- Make API and realtime read Railway's injected `PORT` while keeping local fallback ports.
- Run `node dist/migrate.js` as the API pre-deploy command.
- Use Railway's PostgreSQL `DATABASE_URL` reference for `MEALY_DATABASE_URL`.
- Set `NODE_ENV=production`, a 32+ character bootstrap secret, exact Vercel origins, proxy trust, pool limits, and production-safe OTP mode.
- Seed sample data only through a separate, explicitly enabled one-time command; never during every deploy.
- Verify `/health`, `/ready`, schema version, order creation, slot locking, forecast, and transition endpoints against the deployed database.

### Vercel

Create two Vercel projects from the same repository:

1. Root `mealy-platform/apps/student-web` with `VITE_MEALY_API_BASE_URL` and a demo outlet ID.
2. Root `mealy-platform/apps/canteen-admin` with `VITE_MEALY_API_BASE_URL`.

Add SPA rewrites to each app, use `npm run build`, and publish `dist`. Do not place secrets in any `VITE_` variable. Add a real canteen-manager sign-in screen rather than requiring a manually pasted session token.

## Sequenced build checklist

- [ ] **1. Lock the demo contract**
  Acceptance: approve mock-payment behavior, demo authentication, deadline, and whether P1 is attempted.
  Verify: decisions are recorded before implementation.
- [ ] **2. Add pickup-slot and leftover schema**
  Acceptance: migration applies from a clean database and preserves existing orders.
  Verify: migration tests plus concurrent final-capacity booking test.
- [ ] **3. Add four-week realistic sample data**
  Acceptance: 10 dishes, daily orders, slot patterns, and leftovers are deterministic and idempotent.
  Verify: sample-data SQL checks pass.
- [ ] **4. Implement slot availability and queue summary APIs**
  Acceptance: only future/open slots appear; full slots reject new orders; wait/load values match stored orders.
  Verify: API tests cover capacity, timezone, and concurrent requests.
- [ ] **5. Complete student checkout**
  Acceptance: a student selects a slot and receives an order ID/token in under 30 seconds.
  Verify: production build plus phone-sized browser flow.
- [ ] **6. Add student order tracking**
  Acceptance: status, queue position, pickup slot, and wait estimate update without reload.
  Verify: transition an order from another client and observe the phone update.
- [ ] **7. Build the canteen rush board**
  Acceptance: incoming orders are grouped by slot and staff can mark preparing/ready.
  Verify: two phone orders appear and transitions update both phones.
- [ ] **8. Implement forecast and leftover APIs**
  Acceptance: every dish gets tomorrow's recommended quantity and an explainable calculation; leftover entry changes the next forecast.
  Verify: fixed-fixture calculation tests.
- [ ] **9. Add forecast, leftover, and food-saved UI**
  Acceptance: one clear chart, closing form, and kg-saved card are usable on a laptop.
  Verify: manual demo using the seeded four-week history.
- [ ] **10. Make Railway deployment-ready**
  Acceptance: API/worker/realtime use production ports, migrations, variables, health checks, and no committed secrets.
  Verify: deployed health/readiness plus smoke test.
- [ ] **11. Make both Vercel apps deployment-ready**
  Acceptance: deep links work, API CORS is exact, manager sign-in works, and no browser secret is shipped.
  Verify: production URLs tested on two phones and one laptop.
- [ ] **12. Rehearse and capture submission proof**
  Acceptance: a 2-3 minute run shows two orders, live dashboard movement, ready status, tomorrow forecast, leftovers, and saved kg.
  Verify: record one uninterrupted rehearsal and save screenshots/results.

## Decision gates

1. **Payment conflict:** existing Mealy decisions require Razorpay for real student checkout; the hackathon brief explicitly puts real payments out of scope. **Proposed:** on this branch, use a clearly labelled mock UPI success step that creates a paid demo order. This requires approval and must not be presented as production payment.
2. **Authentication:** production OTP needs an SMS provider and canteen management lacks a finished user-facing login. **Proposed:** keep phone OTP contracts, add a guarded hackathon demo identity path, and implement manager employee-code/PIN login. This requires approval before deployment.
3. **Build budget:** P0 is the submission; P1 should be attempted only after the full demo works on deployed URLs. The available hours and deadline are **TBD**.

