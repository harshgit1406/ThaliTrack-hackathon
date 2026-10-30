# Mealy Kitchen Display

Standalone React/Vite outlet and station-scoped kitchen display backed only by the live outlet gateway.

## Run locally

```powershell
npm install
npm run dev
```

Vite listens on the local network for standalone development. For gateway-backed development, copy `.env.example` to `.env`, use the same LAN token as `apps/outlet-gateway`, build the KDS, and open `http://127.0.0.1:8788/kds/`. A kitchen tablet can replace `127.0.0.1` with the gateway computer's private LAN IP.

## Current boundary

- Gateway-backed queue and actions for POS, student-app, and QR tickets. A missing or unavailable gateway is shown as an explicit error; no demo tickets are substituted.
- Ticket-level `New -> Preparing -> Ready` workflow with per-item-line readiness and correction while preparing.
- Clear gateway connectivity, loading, empty, error, and pending-action states.
- `src/services/kds-service.ts` is the integration boundary for the outlet-local gateway; the KDS never connects to Railway PostgreSQL or the public cloud backend directly during routine kitchen work.
- Durable local operations belong to the gateway. Staff authentication, entitlement enforcement, printing, cloud reconciliation, and exception workflows remain pending.
