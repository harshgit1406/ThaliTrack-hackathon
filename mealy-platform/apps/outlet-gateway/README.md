# Mealy Outlet Gateway

The outlet gateway is the always-on local service between the Mealy cloud and an outlet's POS, KDS, and printers. It listens on the outlet LAN, persists operational actions in SQLite before acknowledging them, publishes local kitchen events, and retains a durable cloud-sync outbox.

## Local setup

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\outlet-gateway
Copy-Item .env.example .env
npm install
npm run dev
```

Environment variables are read from the process. PowerShell example:

```powershell
$env:MEALY_GATEWAY_LAN_TOKEN='replace-with-a-long-random-lan-token'
npm run dev
```

The gateway automatically loads `apps/outlet-gateway/.env` when that file exists. Values explicitly supplied by the process remain suitable for service/production configuration.

Default URLs:

- Health: `http://127.0.0.1:8788/health`
- KDS when built: `http://127.0.0.1:8788/kds/`
- LAN API: `http://127.0.0.1:8788/v1/`

For another device on the same Wi-Fi/LAN, replace `127.0.0.1` with the gateway computer's private LAN IP. Windows Firewall must allow the configured TCP port on the Private network profile.

## Safety and current boundary

- SQLite runs in WAL mode and every local mutation commits a replayable event to the sync outbox.
- `Idempotency-Key` is mandatory for order creation.
- Ticket/item transitions are validated locally and all items must be ready before the ticket can become ready.
- `MEALY_GATEWAY_LAN_TOKEN` protects LAN API calls. Production mode refuses a missing or short token.
- The cloud sync worker is dormant until `MEALY_CLOUD_URL` is configured. Pending events remain durable meanwhile.
- One authenticated outbound WebSocket receives pushed online orders, persists before acknowledging, and resumes from the durable sequence/cursor after reconnecting. The local process builds successfully; the enrolled-gateway end-to-end workflow remains to be tested.
- The token-block reservation algorithm, printer adapters, device enrollment/certificates, staff authentication, and authoritative cloud reconciliation remain future gateway work.

Do not expose this service directly to the public internet. It is designed for a trusted outlet LAN and initiates its own authenticated connections to the Railway-hosted Mealy cloud.
