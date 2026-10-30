# Mealy Cloud Backend

One modular TypeScript/Fastify backend with three runtime modes:

- `api`: HTTP APIs for auth/session bootstrap, catalog, pricing, orders, payments, kitchen operations, administration, entitlements, gateway enrollment, and local-event upload.
- `realtime`: authenticated outlet-gateway WebSockets with heartbeat, durable acknowledgement, and sequence/cursor replay.
- `worker`: transactional-outbox publication plus gateway-event reconciliation.

All modes use the same codebase and Railway PostgreSQL schema. Menu, order, payment, token, KOT, and admin capabilities are modules, not separately deployed microservices.

## Docker preparation

The repository-level `compose.yaml` builds PostgreSQL, a one-shot migration container, API, realtime, and worker services.

For first-time local setup:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform
Copy-Item .env.docker.example .env
Copy-Item apps\backend\.env.example apps\backend\.env
```

Replace both example passwords/tokens. The password embedded in `MEALY_DATABASE_URL` must match `MEALY_DB_PASSWORD` in the root `.env`; for Docker, keep the database host as `postgres`.

Start the local backend stack with:

```powershell
docker compose up -d --build
```

Do not expose PostgreSQL publicly in production. The local port mapping exists only for development tooling.

## Initial service endpoints

- API health: `http://127.0.0.1:8080/health`
- API readiness/schema: `http://127.0.0.1:8080/ready`
- Realtime health: `http://127.0.0.1:8081/health`
- Gateway WebSocket: `ws://127.0.0.1:8081/v1/realtime/gateway`

## Bootstrap and provider boundaries

`POST /v1/auth/bootstrap-session` creates the first platform super-admin session only when `X-Mealy-Bootstrap-Token` matches the environment secret. Rotate or disable that secret after provisioning.

Student/staff OTP providers, online payment providers, object storage, offline-order financial reconciliation, refunds, printer drivers, and production gateway enrollment/certificate rotation still require the product/provider decisions recorded in the project documents. The backend stores provider-neutral records and rejects or quarantines operations that cannot yet be processed safely.

## Verification status

The containers build and start locally, migrations complete at schema version 8, and the API/realtime health checks pass. Full authenticated order, KDS, gateway-enrollment, browser, payment, and concurrency workflows remain pending. See the repository [startup guide](../../README.md) for the complete local order and port map.
