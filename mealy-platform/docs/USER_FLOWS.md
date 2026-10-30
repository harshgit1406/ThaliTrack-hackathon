# User Flows

These flows separate confirmed intent from proposed detail. Anything marked **TBD** cannot be treated as approved acceptance criteria.

## Central admin: assign canteen modules

1. Authorized platform admin selects a canteen and reviews its effective modules, dependencies, configuration, and activation dates.
2. Admin enables, configures, schedules, or disables a module such as KDS, QR ordering, online payments, or inventory.
3. Backend validates dependencies and records the actor, previous value, new value, and effective period.
4. Each application refreshes effective capabilities and updates its routes/navigation; disabled-module API calls remain rejected server-side.
5. A canteen admin may configure an assigned module but cannot self-enable an unassigned module.

## Student: browse, order, and collect

1. Student opens Mealy and is scoped to a campus/canteen. Scoping mechanism: **TBD**.
2. Student browses the canteen's available menu. **Confirmed**.
3. Student selects item options and adds items to a cart. Variations/modifiers/notes: **TBD**, though supported by legacy code.
4. Student reviews the authoritative server quote and selects the online-only Razorpay checkout. Cash/pay-at-counter is not offered. **Confirmed provider; detailed integration pending**.
5. Student authenticates with passwordless phone OTP. Guest and password paths are not offered. **Confirmed**.
6. The backend creates a unique checkout attempt and Razorpay order using the quoted amount; duplicate submission must not create a second payment/order attempt. **Required for the later payment implementation**.
7. Razorpay Checkout may return an immediate client result, but the backend verifies the signature and authoritative webhook/status before marking payment successful. Pending, failed, cancelled, and replayed events must not create a paid order.
8. Only after verified payment does the backend persist/activate the accepted student order, assign its token/KOT, and publish it to the outlet gateway. Exact reservation-versus-final-order modeling remains part of the payment plan.
9. Student sees order confirmation and token number. **Confirmed outcome**.
10. Student receives preparation updates through the backend-owned authenticated WebSocket channel, with API recovery after reconnect/version gaps. Exact customer-facing statuses remain **TBD**.
11. When ready, student presents the token and collects food at the counter. **Confirmed**.
12. Canteen marks the order collected/complete. Final status name and authorization: **TBD**.

## Canteen POS: fulfill a student order

1. Authorized canteen staff signs in and enters the correct canteen/branch/POS context. **TBD details**.
2. The outlet gateway receives complete incoming student orders through its persistent backend WebSocket without polling, persists before acknowledgement, and publishes them to POS/KDS over the LAN. **Confirmed**.
3. Staff identifies the order using order number/token/customer context. **Confirmed for token**; other identifiers **TBD**.
4. Staff accepts/confirms the order according to the approved state machine. **TBD**.
5. The system creates/routes a KOT with item options, quantity, notes, token, source, and timestamps. Exact automatic/manual trigger and printer routing: **TBD**.
6. The KDS receives the KOT and kitchen staff advances preparation status without entering the POS billing/admin interface.
7. POS marks the order ready; the student-facing app receives the corresponding update.
8. Staff validates the token at handoff and marks the order collected.
9. Exceptions such as rejection, cancellation, remake, no-show, refund, or payment failure follow rules that are **TBD**.

## POS: canteen-created counter order

The canteen-specific POS implies staff may create orders directly, and legacy code supports this, but the complete counter-order flow is **TBD**. Required decisions include customer optionality, payment timing, KOT trigger, token assignment, draft behavior, bill/receipt behavior, and whether these orders appear in the student account.

## QR ordering

1. A customer scans a canteen/outlet/counter-scoped QR code.
2. The student web experience opens with trusted server-resolved location context; QR payload signing and fallback behavior are **TBD**.
3. The customer browses, customizes, pays or selects an approved payment method, and places an idempotent order.
4. The shared backend assigns the order source as QR, creates the authoritative order/token/KOT relationship, and routes it to POS/KDS.
5. The customer follows preparation status and collects using the token. Authentication requirements are **TBD**.

## Kitchen/KDS: prepare orders from every channel

1. Authorized kitchen staff opens the KDS for the assigned outlet/KOT station.
2. KOTs from POS, student app, and QR ordering appear in a consistent queue with their source visible.
3. Staff starts a ticket and may mark each item line ready independently. An accidental item-ready action can be corrected, and the complete ticket can become ready only after every item line is ready.
4. Delays, rejected items, remakes, and printer/display failures use audited exception paths that are **TBD**.
5. Marking the KOT ready updates the authoritative backend and all relevant POS/student views.

## Canteen/admin: manage operating data

1. Authorized manager selects a canteen/branch.
2. Manager creates/updates menu categories, items, availability, pricing, options, taxes/fees, and operating state.
3. Changes become the shared catalog consumed by student and POS surfaces.
4. Manager configures KOT destinations/printers and staff permissions if included in MVP.
5. Manager views orders and operational reports if included in MVP.

The specific management feature set, approval workflow, audit requirements, and immediate-versus-scheduled publication are **TBD**.

## Cross-surface invariant

An order must have one authoritative identity, totals snapshot, canteen/branch, token/KOT relationship, payment state, and fulfillment state. Student/QR UI, POS, KDS, and admin may present different views, but must not maintain competing copies of those facts.
