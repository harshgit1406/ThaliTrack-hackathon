# Outlet Gateway

## Purpose

The outlet gateway is the local source of truth for active outlet operations. POS terminals, kitchen displays, and future printer adapters use it over the private LAN. It persists an action before acknowledging it and queues every cloud-bound event, allowing counter and kitchen work to continue when internet access is unavailable.

## Run locally

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\kds
Copy-Item .env.example .env
npm install
npm run build

cd ..\outlet-gateway
Copy-Item .env.example .env
npm install
npm run dev
```

Use the same token in `VITE_MEALY_GATEWAY_TOKEN` and `MEALY_GATEWAY_LAN_TOKEN`. Open:

- gateway machine: `http://127.0.0.1:8788/kds/`
- another device on the outlet LAN: `http://<gateway-private-ip>:8788/kds/`
- health check: `http://<gateway-private-ip>:8788/health`

The Windows Firewall rule, when required, should allow TCP port `8788` only on the Private profile. Do not expose the gateway through a public router or public DNS.

## POS to kitchen flow

1. POS sends `POST /v1/orders` with a globally unique order/ticket ID and `Idempotency-Key`.
2. The gateway writes the order, ticket, item lines, event, and synchronization outbox entry in one SQLite transaction.
3. KDS obtains the canonical queue from `GET /v1/kitchen/tickets` and can consume `/v1/events` for replayable low-latency notifications.
4. Kitchen staff starts the ticket and marks item lines ready. The gateway rejects invalid or duplicate state transitions.
5. The complete ticket becomes ready only after every line is ready.
6. When configured, the sync worker uploads ordered outbox batches to the cloud receiver and acknowledges only accepted event IDs. Failed events remain local and retry with backoff.

The gateway now includes a separate authenticated outbound WebSocket client for the Railway backend. That connection receives complete committed online-order/event payloads without polling. The gateway saves each payload before acknowledging it and reconnects with its last accepted sequence/cursor to replay missed events. The existing HTTP sync worker remains the upload path for locally-created/offline actions. This cloud path is implemented but not yet runtime-tested.

## Persistence and recovery

- Runtime data is stored under `.data/gateway.sqlite` by default and is ignored by Git.
- SQLite uses WAL mode, foreign keys, and transactional mutations.
- Order creation is retry-safe through the idempotency record and request-content hash.
- The event log is sequence-addressable for local replay.
- The cloud outbox tracks attempts, last error, and next retry time.
- Restart persistence and readiness invariants are covered by automated tests.

## Current production gaps

The initial gateway is functional for local POS-to-KDS operations and now has unverified cloud WebSocket/replay plus HTTP upload clients. A production rollout still needs runtime verification, production certificate/key rotation, staff authorization, full KDS/KOT entitlement checks, approved offline commercial reconciliation, reserved offline token blocks, printer adapters, monitoring, backup/support procedures, and Windows service/installer packaging.
