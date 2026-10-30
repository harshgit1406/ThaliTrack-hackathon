# ThaliTrack by Mealy

ThaliTrack is a campus canteen operating system that connects student pre-orders, counter POS billing, kitchen tickets, pickup queues, manager controls, demand forecasting, and food-waste tracking in one product.

The repository contains a working multi-device demo as well as the foundations needed for a real canteen rollout. A student order appears in the canteen workflow, moves through preparation and pickup, updates the student's phone, and contributes to queue, demand, and waste insights.

## What the product includes

| Experience | Main capabilities | Local URL |
| --- | --- | --- |
| Student app | Live menu and photos, cart, 10-minute pickup slots, simulated UPI checkout, token and live order notifications | `http://127.0.0.1:5177` |
| Counter POS | Staff sign-in, counter billing, online orders, tender selection, receipts, tokens, and KOT creation | `http://127.0.0.1:5173` |
| Kitchen display (KDS) | Live kitchen tickets, preparation states, delays, ready and remake actions | `http://127.0.0.1:8788/kds/` |
| Canteen manager | All-outlet rush board, live order control, forecasting, leftover logging, surplus offers, staff and setup controls | `http://127.0.0.1:5175` |
| Platform admin | Campus, canteen, outlet, counter, device, and entitlement administration | `http://127.0.0.1:5174` |
| Backend | PostgreSQL, API, realtime delivery, background worker, audit trail, and outlet synchronization | `http://127.0.0.1:8080` |

### End-to-end flow

1. A student selects food and a 10-minute pickup slot in the student app.
2. The order is priced by the backend and confirmed through the clearly labelled local UPI simulation.
3. The order appears in the POS/manager views and is sent to the kitchen as a KOT.
4. Kitchen staff move the ticket from received to preparing to ready.
5. The student's order timeline and ready-for-pickup notification update automatically.
6. The manager sees rush load, estimated wait time, tomorrow's dish forecast, leftovers, food saved, and surplus opportunities.

## How forecasting and wait time work

- **Demand forecast:** a lightweight ridge-regression model runs inside the Node.js backend. It learns from 28 days of dish-level orders and leftovers and considers weekday, recent trend, lecture-rush timing, and waste. It predicts the next-day quantity for each dish without requiring a separate paid ML service.
- **Wait time:** pickup-slot load, open orders, order state, outlet preparation time, and capacity are combined to estimate the live queue. As tickets are accepted, prepared, or completed, the estimate changes.
- **Food saved:** the dashboard compares forecast-led preparation and logged leftovers against the historical waste baseline. Managers enter closing leftovers so future forecasts adapt to the outlet's real activity.

The development seed supplies 10 dishes, 280 demand-history observations, timetable rush windows, live orders, and a surplus offer so these features are visible immediately.

## Architecture

```text
Student web ─┐
POS ─────────┼── REST API ── PostgreSQL
Manager ─────┘       │
                     ├── Realtime service
                     └── Worker / outbox
                              │
                    Outlet gateway (SQLite)
                         ├── KDS
                         └── local print/KOT queue
```

The outlet gateway keeps essential counter and kitchen work available on the canteen LAN during an internet interruption and replays queued events when cloud access returns.

## Technology

- React, TypeScript, Vite, and Electron
- Node.js, Fastify, WebSockets, and background workers
- PostgreSQL 16 for central data and SQLite at the outlet gateway
- In-process ridge regression for demand prediction
- Docker Compose for the local backend
- Vercel-ready web applications and container-ready backend services

## Prerequisites

- Windows PowerShell
- Docker Desktop running
- Node.js 22 or newer
- npm

Check the tools:

```powershell
docker version
node --version
npm --version
```

All commands below start here:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform
```

## First-time setup

### 1. Create private environment files

Environment files are ignored by Git. Never commit passwords or tokens.

```powershell
Copy-Item .env.docker.example .env
Copy-Item apps\backend\.env.example apps\backend\.env

$apps = @('pos', 'admin', 'canteen-admin', 'kds', 'outlet-gateway', 'student-web')
foreach ($app in $apps) {
  Copy-Item "apps\$app\.env.example" "apps\$app\.env" -ErrorAction SilentlyContinue
}
```

In `.env`, replace `MEALY_DB_PASSWORD`. Use the same password in `apps/backend/.env` inside `MEALY_DATABASE_URL`. Also set:

```text
MEALY_DEMO_MODE=true
MEALY_BOOTSTRAP_ADMIN_TOKEN=<a-long-private-random-value>
```

For the included Main Food Court dataset, use these public identifiers:

```text
OUTLET_ID=e0000000-0000-4000-8000-000000000001
COUNTER_ID=f0000000-0000-4000-8000-000000000001
TERMINAL_ID=11000000-0000-4000-8000-000000000001
```

Set the outlet ID in `apps/student-web/.env`. Set all three IDs in `apps/pos/.env`. Enable `VITE_MEALY_DEMO_MODE=true` in the student and canteen-manager environment files.

### 2. Install application dependencies

```powershell
$apps = @('pos', 'admin', 'canteen-admin', 'kds', 'outlet-gateway', 'student-web')
foreach ($app in $apps) {
  Push-Location "apps\$app"
  npm install
  Pop-Location
}
```

### 3. Start and seed the backend

```powershell
docker compose up -d --build
docker compose run --rm -e MEALY_ALLOW_SAMPLE_DATA=true api node dist/seed.js
docker compose ps -a
```

The migration container showing `Exited (0)` is expected. Confirm the services:

```powershell
curl.exe --noproxy "*" http://127.0.0.1:8080/health
curl.exe --noproxy "*" http://127.0.0.1:8080/ready
curl.exe --noproxy "*" http://127.0.0.1:8081/health
```

Readiness should report schema version `12`.

### 4. Configure the outlet gateway

In `apps/outlet-gateway/.env`, use the Main Food Court outlet/counter/terminal IDs above. Create a long `MEALY_GATEWAY_LAN_TOKEN`, then copy the same value to `VITE_MEALY_GATEWAY_TOKEN` in `apps/kds/.env` and `apps/pos/.env`.

Build the KDS once so the gateway can serve it:

```powershell
cd apps\kds
npm run build
cd ..\..
```

For a cloud-connected gateway, enroll it through the manager/platform setup flow and add the returned token to the gateway environment. LAN-only operation does not require cloud gateway values.

## Start the complete system

Keep Docker running, then use a separate PowerShell window for each interface.

### Outlet gateway and KDS

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\outlet-gateway
npm run dev
```

Open `http://127.0.0.1:8788/health` and then `http://127.0.0.1:8788/kds/`.

### Counter POS

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\pos
npm run dev
```

Seeded cashier login:

```text
Employee code: CB-CASHIER-01
PIN: 2468
```

### Canteen manager

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\canteen-admin
npm run dev -- --port 5175
```

Open `http://127.0.0.1:5175` and choose the demo manager workspace.

### Student app

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\student-web
npm run dev -- --port 5177
```

Open `http://127.0.0.1:5177` and choose Aarav Sharma or Meera Nair on the sign-in screen.

### Platform admin (optional)

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\admin
npm run dev -- --port 5174
```

## Multi-device demo on a laptop hotspot

Recommended screen assignment:

- **Laptop:** POS on port `5173` and manager on port `5175`
- **iPad:** KDS at `http://<LAPTOP-IP>:8788/kds/`
- **Phone:** student app at `http://<LAPTOP-IP>:5177`

Setup:

1. Connect the laptop to college Wi-Fi and enable Windows **Mobile hotspot**.
2. Join the phone and iPad to the laptop hotspot.
3. Run `ipconfig` and note the IPv4 address of the Mobile Hotspot adapter (often `192.168.137.1`).
4. In root `.env`, set `MEALY_BIND_ADDRESS=0.0.0.0`.
5. Use `http://<LAPTOP-IP>:8080` as `VITE_MEALY_API_BASE_URL` for the student and manager apps.
6. Add the laptop-IP origins for ports `5175` and `5177` to `MEALY_ALLOWED_ORIGINS` in `apps/backend/.env`.
7. Add `http://<LAPTOP-IP>:8788` to `MEALY_GATEWAY_ALLOWED_ORIGINS` in the gateway environment.
8. Restart Docker and the affected applications after changing environment files.

Expose the browser apps to the hotspot:

```powershell
# Student app
npm run dev -- --host 0.0.0.0 --port 5177

# Manager app (run from its own folder)
npm run dev -- --host 0.0.0.0 --port 5175
```

If another device cannot connect, allow Node.js and Docker through Windows Firewall on **Private networks**. Do not expose this demo configuration directly to the public internet.

## Suggested live demo

1. Show the student menu, photos, surplus offer, and timetable rush alert on the phone.
2. Add an item, choose a pickup slot, complete simulated UPI, and show the order token popup.
3. On the laptop, show the new order in manager/POS and send or confirm its KOT.
4. On the iPad, open the ticket, mark it preparing, then ready.
5. Return to the phone and show the live state change and ready notification.
6. In the manager app, show slot demand, wait time, tomorrow's per-dish forecast, food saved, and leftover logging.
7. Explain that the gateway/SQLite layer keeps the outlet operating locally if internet access drops.

## Deployment

- Web applications can be deployed to Vercel.
- The API, realtime service, worker, and PostgreSQL can be deployed to Railway, Render, or another container host.
- The outlet gateway remains on the canteen computer because it provides LAN/offline operation.

See [docs/HACKATHON_DEPLOY.md](docs/HACKATHON_DEPLOY.md) for the exact Railway/Vercel runbook and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the broader production checklist.

## Useful operations

```powershell
# Service status
docker compose ps -a

# Backend logs
docker compose logs -f api realtime worker

# Restart backend services
docker compose restart api realtime worker

# Stop while preserving database data
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the local PostgreSQL volume.

## Troubleshooting

### `Failed to fetch`

- Confirm `http://127.0.0.1:8080/health` works on the laptop.
- On a phone/iPad, never use `localhost` or `127.0.0.1` for the laptop API; use the laptop hotspot IP.
- Confirm the frontend origin is listed in backend `MEALY_ALLOWED_ORIGINS`.
- Restart the frontend after editing `.env`.

### Orders do not appear in KDS or manager

- Ensure student, POS, manager, and gateway use the same seeded outlet ID.
- Confirm the gateway health endpoint works and its cloud/gateway token is valid.
- Confirm Docker API, realtime, and worker services are running.
- The manager rush board aggregates all outlets in the selected canteen and refreshes automatically.

### Menu photos are missing

Photos are bundled with the student and POS applications. Restart the relevant Vite server and perform a hard browser refresh after pulling changes.

### Port already in use

Use the expected allocation: POS `5173`, platform admin `5174`, manager `5175`, standalone KDS `5176`, student `5177`, gateway `8788`, API `8080`, realtime `8081`.

## Repository structure

```text
mealy-platform/
├── apps/
│   ├── backend/          API, realtime service, worker, migrations, seed, forecasting
│   ├── student-web/      student ordering experience
│   ├── pos/              Electron counter POS
│   ├── kds/              kitchen display
│   ├── canteen-admin/    manager workspace
│   ├── admin/            platform administration
│   └── outlet-gateway/   offline/LAN gateway and SQLite state
├── data/                 forecasting sample data
├── docs/                 architecture, API, operations, security, and deployment
├── compose.yaml          local PostgreSQL and backend services
└── CHANGELOG.md
```

## Scope and production notes

- The included UPI flow is a **payment simulation**, not a real money transaction. A production payment provider must be connected before accepting payments.
- Delivery is outside this product's current scope; ThaliTrack focuses on campus counter pickup.
- Production OTP needs an SMS provider. Local demo identities exist only when demo mode is enabled.
- Replace all development secrets, restrict allowed origins, configure backups/monitoring, and complete the security/deployment checklist before a real rollout.

Further technical references: [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md), and [known issues](docs/KNOWN_ISSUES.md).
