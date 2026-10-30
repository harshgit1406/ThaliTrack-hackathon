# Known Issues and Risks

## Blocking uncertainties

The only questions blocking development are listed in `PROJECT_CONTEXT.md`. This file records discovered risks and cleanup needs; it does not add more blocking questions.

## Legacy repository findings

| Severity | Finding | Required handling |
| --- | --- | --- |
| High | `../mealyapp/app/.env.local` is tracked | Audit without exposing values; rotate any real secrets; purge history only with explicit coordination |
| High | Confirmed campus-pickup scope is much narrower than the restaurant platform code | Approve MVP feature set; do not inherit delivery/dine-in/hotel/subscription complexity automatically |
| Medium | Consumer OpenAPI copies drift: backend includes feedback paths absent from `../mealyapp/docs/openapi.yaml` | Select one authoritative spec and generate client types from it |
| Medium | `../mealyapp/app/dist/` and `.vercel/project.json` are tracked | Do not copy generated/deployment-bound artifacts into the new project |
| Medium | Untracked student dev logs exist in the legacy repo | Leave untouched; ensure new root ignore rules cover logs |
| Medium | Legacy browser client stores bearer token/user/cart in Web Storage | Decide target session strategy and test XSS/session expiry behavior |
| Medium | A browser-exposed API key is described as an API security layer | Treat it as public identification/rate-limit input, never a secret/authorization boundary |
| Medium | OTP example configuration permits fallback test behavior on provider errors | Enforce production fail-closed configuration |
| Medium | POS backend is broad and tightly coupled to TableTrack models/modules/core overrides | Port incrementally behind documented boundaries; inventory override dependencies before upgrades |
| Low | Several repository READMEs are generic/minimal | Replace with target-specific setup docs after stack approval |
| Low | Encoding artifacts are visible in some source comments/output | Preserve behavior but normalize text when code is intentionally migrated |

## Unverified operational areas

- On 2026-10-26 schema version 11 and the authenticated counter flow were verified through payment, receipt, gateway delivery, KDS delay/remake/readiness, collection, refund, stock adjustment, file-spool printing, and realtime terminal cleanup.
- On 2026-10-26 the canteen owner setup flow was verified against live PostgreSQL for seven-day pickup hours, tax creation/category scope, terminal and kitchen-station enrollment, printer enrollment/routing, gateway enrollment and token rotation. Browser checks covered the corresponding manager forms. Temporary verification records and sessions were removed.
- Physical thermal printers and driver-specific Windows queues still require outlet-hardware certification; file-spool printing and cloud claim/result handling are verified.
- Manual UPI/card tenders record an external terminal reference. Automatic provider capture/refund requires a configured provider adapter and credentials.
- Gateway installer/service packaging, production certificate rotation, monitoring, and rush-hour/load certification remain release/deployment work.

- On 2026-10-21 all six existing application modules built successfully, and the local Docker PostgreSQL, migration, API, realtime, and worker services started successfully. Full authenticated workflows, payments, OTP, printing, browser flows, concurrency, and deployment remain untested.
- Current production domains/configuration, active modules, database contents, migration state, provider credentials, and deployment health are unknown.
- License/provenance and upgrade constraints for the TableTrack base and copied UI assets are **TBD**.
- Performance during campus rush and atomic token behavior under real concurrency are unverified.

## New database foundation follow-ups

- The schema and transactional smoke test pass locally, but the backend runtime role/grants and optional PostgreSQL row-level-security policies cannot be finalized until the backend authentication framework is selected.
- Tax, promotion and pricing tables support the needed rules, but calculation/rounding precedence needs product/accounting fixtures before API implementation.
- The seeded pickup status flow is a safe baseline, not final UI policy; cancellation/rejection timing still needs confirmation.
- Atomic token allocation is verified functionally; high-concurrency load testing remains a release task.
- Optional dine-in, reservations, delivery, wallet, coupons, feedback, inventory, commissions and subscriptions are modeled and default disabled, not approved launch features.
- Split payment settles atomically only when configured tender lines exactly equal the order total. The current refund action is full-order only; partial-item and partial-tender refunds are not exposed.

## Railway architecture follow-ups

- Railway is confirmed for the backend and PostgreSQL. API, WebSocket, worker, Docker, and migrations build and run locally; Railway provisioning and load testing remain pending.
- The enrolled gateway, WebSocket replay, token reservation, offline cash reconciliation, entitlement cache, file printing, and KDS upload paths are verified locally.
- Offline orders reconcile only when catalog price, token, staff, terminal, shift, and payment configuration remain authoritative; conflicts fail visibly instead of silently changing financial data.
- PostgreSQL automated backups, off-platform logical dumps, restore drills, connection pooling, high availability/PITR, production sizing, and monitoring must be completed before a live canteen depends on the platform.
- Object storage/CDN selection remains open. Do not add Supabase SDKs or keys as a shortcut; clients continue to use Mealy backend contracts only.
