# Deployment

For the hackathon's exact Railway and Vercel settings, environment variables, seed command, and rehearsal checklist, see [`HACKATHON_DEPLOY.md`](HACKATHON_DEPLOY.md).

## Confirmed target

Mealy uses Railway for the authoritative cloud backend and PostgreSQL. Supabase is not part of the target architecture.

| Runtime | Location | Responsibility |
| --- | --- | --- |
| Student/QR/platform-admin/canteen-admin web builds | Vercel or Cloudflare Pages, final provider TBD | User interfaces and API/WebSocket clients; never direct database access |
| API process | Railway | Versioned HTTP APIs, authentication/session validation, authorization, tenant scope, entitlements, catalog/pricing, orders, payments/webhooks, tokens/KOTs, and admin operations |
| WebSocket process | Railway | Authenticated cloud push, gateway connections, heartbeats, acknowledgements, sequence/cursor replay, and client status delivery |
| Worker process | Railway | Transactional-outbox publishing, retries, reconciliation, scheduled/background work, and provider side effects |
| PostgreSQL | Railway | Authoritative cloud data, transactional outbox, idempotency, audit history, and operational records |
| Object storage/CDN | TBD; Railway-compatible storage or Cloudflare R2 candidate | Menu images, canteen branding, exports, and approved uploads |
| Outlet gateway | Outlet Windows computer or managed local device | Local SQLite durability, POS/KDS/printer LAN routing, offline work, cloud synchronization, and one outbound cloud WebSocket |
| POS | Outlet Windows computer | Electron cashier client using the outlet gateway/backend contracts |
| KDS | Served by the outlet gateway on the outlet LAN | Kitchen queue and actions without an internet round trip |

## Initial Railway topology

Use one modular backend codebase with different start modes:

1. One API process.
2. One persistent WebSocket process.
3. One worker process.
4. One Railway PostgreSQL service in the same region and private network.

Menu, orders, payments, tokens, KOTs, and entitlements remain modules, not separately deployed microservices. The initial expectation of approximately 1,500 customers or orders per day does not justify feature-specific services. Scale only after production-like lunch-hour tests or availability requirements show a need.

Add a second API replica when availability or measured load requires it. Add shared Redis/pub-sub only when multiple replicas need cross-instance WebSocket routing, distributed rate limits, shared ephemeral state, or cache invalidation. Do not use in-process state as the authority for orders, acknowledgements, or replay.

## Order delivery

1. The API commits the order and transactional-outbox record atomically in PostgreSQL.
2. The worker claims the outbox event and passes the complete committed payload to the WebSocket process.
3. The outlet gateway receives the payload without polling and writes it to local SQLite.
4. The gateway acknowledges only after durable local persistence.
5. The gateway routes the order to POS/KDS/printers over the LAN.
6. On reconnect, the gateway presents its last accepted sequence/cursor and the backend replays missed events idempotently.

HTTP remains available for sign-in, initial hydration, commands, explicit recovery, and version-gap refresh. It is not used for continuous order discovery.

## Production requirements

- Railway PostgreSQL must be private to the API/worker services; no database connection string may be shipped to a browser or outlet client.
- Configure connection pooling and per-process connection budgets before horizontal scaling.
- Enable automated backups and maintain encrypted off-platform logical dumps.
- Test both Railway backup restoration and logical-dump restoration before pilot launch.
- Decide high availability and PITR objectives from acceptable downtime/data-loss targets before production.
- Configure API, WebSocket, worker, and database monitoring plus queue age, delivery lag, reconnect rate, acknowledgement latency, failed-event, and storage alerts.
- Use environment-only secrets, explicit CORS/origin rules, TLS, gateway credential rotation, and least-privilege runtime database roles.
- Load test concentrated menu browsing, checkout, order creation, payment callbacks, outbox delivery, WebSocket reconnect/replay, and token allocation for the expected lunch rush rather than using only daily averages.

## Implementation status

The repository now has portable PostgreSQL migrations, a modular Fastify API, WebSocket and worker modes, Docker Compose wiring, frontend shells, and an outlet gateway with local durability, HTTP upload, and cloud WebSocket/cursor replay. It has no Supabase runtime dependency.

The local Docker images build and the PostgreSQL, migration, API, realtime, and worker topology starts successfully. Local health/readiness checks pass at schema version 8. The outlet gateway and frontend applications run directly on the Windows development machine; they are not part of the current Compose file. Railway production provisioning, object storage, provider adapters, production secrets, monitoring, backups/restore, and full authenticated workflow verification remain future work. See the repository `README.md` for the exact local startup order.
