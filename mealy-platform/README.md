# Mealy local startup guide

This repository contains one Docker-based cloud stack and six applications that run directly on the Windows development machine.

## What runs where

| Component | Where it runs locally | Port / URL | Purpose |
| --- | --- | --- | --- |
| PostgreSQL 16 | Docker | `localhost:5432` | Authoritative cloud-development database |
| Database migrations | One-shot Docker container | No port | Applies migrations, then exits successfully |
| Backend API | Docker | `http://127.0.0.1:8080` | Authentication, catalog, orders, KOT, payments, and administration APIs |
| Realtime service | Docker | `ws://127.0.0.1:8081` | Backend-owned WebSocket delivery to enrolled outlet gateways |
| Background worker | Docker | No port | Outbox publication, retries, and background processing |
| Outlet gateway | Windows / outlet computer | `http://127.0.0.1:8788` | Local SQLite durability and LAN API for KDS/offline outlet work |
| POS | Windows Electron app | Renderer uses `http://127.0.0.1:5173` | Cashier application |
| Platform admin | Windows browser dev server | `http://127.0.0.1:5174` | Mealy platform administration |
| Canteen admin | Windows browser dev server | `http://127.0.0.1:5175` | Canteen owner/manager application |
| KDS | Preferably served by the gateway | `http://127.0.0.1:8788/kds/` | Kitchen display and ticket actions |
| Student web | Windows browser dev server | `http://127.0.0.1:5177` | Phone-first campus food browsing and local cart |

The migration container showing `Exited (0)` is normal: it is supposed to finish before the API, realtime service, and worker start.

Student web is deliberately dynamic: it reads a configured outlet's public catalog, requests backend pricing, and places authenticated pickup orders into 10-minute slots. Production uses phone OTP; `MEALY_DEMO_MODE=true` additionally exposes named hackathon demo users and mock UPI without weakening the production path.

## Prerequisites

- Windows PowerShell
- Docker Desktop running
- Node.js 22 or newer
- npm

Check the local tools:

```powershell
docker version
node --version
npm --version
```

All commands below assume this folder:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform
```

## First-time setup

### 1. Create the private Docker environment files

These files are ignored by Git. Do not commit them.

```powershell
if (-not (Test-Path .env)) {
  Copy-Item .env.docker.example .env
}

if (-not (Test-Path apps\backend\.env)) {
  Copy-Item apps\backend\.env.example apps\backend\.env
}
```

Edit both files:

- `.env`: replace `MEALY_DB_PASSWORD`.
- `apps/backend/.env`: use the same password inside `MEALY_DATABASE_URL`.
- Keep the Docker database hostname as `postgres`, not `localhost`.
- Replace `MEALY_BOOTSTRAP_ADMIN_TOKEN` with a long private value.
- Ensure `MEALY_ALLOWED_ORIGINS` contains the frontend origins you will run, normally ports `5173`, `5174`, `5175`, `5176`, and `5177` on both `localhost` and `127.0.0.1`.

### 2. Install local application dependencies

Run once, and again whenever a package lock changes:

```powershell
$apps = @('pos', 'admin', 'canteen-admin', 'kds', 'outlet-gateway', 'student-web')
foreach ($app in $apps) {
  Push-Location "apps\$app"
  npm install
  Pop-Location
}
```

### 2A. Load the development sample dataset

After the Docker backend is running, load the idempotent local sample data:

```powershell
docker compose run --rm -e MEALY_ALLOW_SAMPLE_DATA=true api node dist/seed.js
```

This creates two campuses, two canteens, three outlets, counters, terminals, staff/students,
published menus, variants, add-ons, taxes, inventory, payment methods, printers, live orders,
tokens, kitchen tickets, 10 tracked dishes, 280 demand-history observations, timetable rush
windows, pickup slots, and a surplus offer. It is development-only and is never a production migration.

The backend dependencies are installed inside its Docker image. Install them locally only if you plan to compile or run the backend outside Docker.

### 3. Create frontend and gateway environment files

```powershell
$apps = @('pos', 'admin', 'canteen-admin', 'kds', 'outlet-gateway', 'student-web')
foreach ($app in $apps) {
  $target = "apps\$app\.env"
  if (-not (Test-Path $target)) {
    Copy-Item "apps\$app\.env.example" $target
  }
}
```

The placeholder outlet, counter, terminal, gateway, and access-token values must be replaced with records created by the backend. Applications intentionally show empty or configuration-error states instead of fake records.

For `apps/student-web/.env`, set `VITE_MEALY_OUTLET_ID` to an outlet UUID that has a published catalog. `VITE_MEALY_API_BASE_URL` defaults to `http://127.0.0.1:8080`.

## Normal startup order

### Step 1: Start the Docker backend

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform
docker compose up -d --build
docker compose ps -a
```

Verify it:

```powershell
curl.exe --noproxy "*" http://127.0.0.1:8080/health
curl.exe --noproxy "*" http://127.0.0.1:8080/ready
curl.exe --noproxy "*" http://127.0.0.1:8081/health
```

Expected results:

- API status is `ok`.
- Readiness status is `ready` with schema version `12`.
- Realtime status is `ok`.
- PostgreSQL, API, and realtime containers are healthy.
- Worker is running.
- Migration container exited with code `0`.

### Step 2: Create the first local administrator session

This is needed only when the database is new or when the old session expired. Use the same private bootstrap token configured in `apps/backend/.env`.

```powershell
$bootstrapToken = Read-Host 'Enter MEALY_BOOTSTRAP_ADMIN_TOKEN'
$body = @{
  display_name = 'Local Administrator'
  email = 'admin@local.mealy'
  device_name = 'Local Windows development'
} | ConvertTo-Json

$session = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8080/v1/auth/bootstrap-session' `
  -Headers @{ 'X-Mealy-Bootstrap-Token' = $bootstrapToken } `
  -ContentType 'application/json' `
  -Body $body

$accessToken = $session.data.token
$accessToken
```

Copy the resulting token into:

- `apps/admin/.env` as `VITE_MEALY_ACCESS_TOKEN`
- `apps/canteen-admin/.env` as `VITE_MEALY_ACCESS_TOKEN`
- `apps/pos/.env` as `VITE_MEALY_ACCESS_TOKEN`

Restart a frontend after changing its `.env` file.

### Step 3: Start the platform admin

Open a new PowerShell window:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\admin
npm run dev -- --port 5174
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174). Use this application to create the first campus and onboard a canteen/outlet/counter. The returned identifiers are used by the POS and outlet gateway environment files.

### Step 4: Build and start the outlet gateway

First build the KDS so the gateway can serve it:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\kds
npm run build
```

Configure `apps/outlet-gateway/.env` with the real outlet identity and a long LAN token. Use the same LAN token in `apps/kds/.env`.

For cloud connectivity, enroll the gateway through the backend and configure:

```text
MEALY_CLOUD_URL=http://127.0.0.1:8080
MEALY_CLOUD_REALTIME_URL=ws://127.0.0.1:8081
MEALY_CLOUD_GATEWAY_TOKEN=<token returned by gateway enrollment>
```

Then start it in another PowerShell window:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\outlet-gateway
npm run dev
```

Verify the gateway at [http://127.0.0.1:8788/health](http://127.0.0.1:8788/health), then open the built KDS at [http://127.0.0.1:8788/kds/](http://127.0.0.1:8788/kds/).

The gateway stores local runtime data in `apps/outlet-gateway/.data/`. That directory is local machine state and is ignored by Git.

### Step 5: Start the POS

Configure `apps/pos/.env` with the API URL, real outlet UUID, counter UUID, optional terminal UUID, and access token. Then open another PowerShell window:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\pos
npm run dev
```

This starts the renderer on port `5173` and opens the Electron window.

### Step 6: Start the canteen-admin application

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\canteen-admin
npm run dev -- --port 5175
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175).

### Step 7: Start student web

Create `apps/student-web/.env` from its example, set a real published outlet UUID, then run:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\student-web
npm run dev -- --port 5177
```

Open [http://127.0.0.1:5177](http://127.0.0.1:5177). This build has no sample menu or fake order records: it will explain when its outlet configuration or catalog is missing.

### Optional: run the KDS as a separate Vite development server

Normally the gateway serves the built KDS. For frontend development:

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\kds
npm run dev -- --port 5176
```

Open [http://127.0.0.1:5176](http://127.0.0.1:5176). Add this origin to `MEALY_GATEWAY_ALLOWED_ORIGINS` in the gateway `.env`.

## Everyday quick start

After first-time setup, the usual order is:

1. Start Docker Desktop.
2. Run `docker compose up -d` from `mealy-platform`.
3. Start the outlet gateway with `npm run dev`.
4. Start only the interfaces you need: POS, platform admin, canteen admin, or student web.
5. Open the KDS through the gateway at `/kds/`.

You do not need to run the backend API, realtime service, or worker manually when Docker Compose is running them.

## Status, logs, restart, and shutdown

From `mealy-platform`:

```powershell
# Show every container, including the completed migration container
docker compose ps -a

# Follow backend logs
docker compose logs -f api realtime worker

# Restart only backend runtime services
docker compose restart api realtime worker

# Stop the stack but keep PostgreSQL data
docker compose down

# Start it again without rebuilding
docker compose up -d
```

Do not use `docker compose down -v` unless you intentionally want to delete the local PostgreSQL volume and all local database data.

Stop a locally running npm application with `Ctrl+C` in its PowerShell window.

## Common startup problems

### `MEALY_DB_PASSWORD is missing`

The root `.env` file is missing or still incomplete. Create it from `.env.docker.example`.

### API is healthy but an application is empty

Dynamic clients do not contain fallback records. Check:

- The application `.env` has the API/gateway URL.
- The access token is present and unexpired.
- The campus, canteen, outlet, counter, catalog, and gateway records actually exist.
- The frontend was restarted after its `.env` changed.

### `401` or `403` from the backend

The session token is missing, expired, or does not have the required permission. Create a new bootstrap session for local development, then update the frontend `.env` files.

### KDS cannot reach the gateway

- Start the outlet gateway first.
- Confirm [http://127.0.0.1:8788/health](http://127.0.0.1:8788/health) works.
- Use the same `MEALY_GATEWAY_LAN_TOKEN` and `VITE_MEALY_GATEWAY_TOKEN`.
- Add the KDS origin to `MEALY_GATEWAY_ALLOWED_ORIGINS`.

### A frontend port is already in use

Keep the recommended allocation: POS `5173`, platform admin `5174`, canteen admin `5175`, standalone KDS `5176`, and student web `5177`.

## What is not ready yet

- Student sign-in UI and backend OTP contracts exist, but production SMS delivery still needs a provider. Razorpay is selected for online-only student payment and is intentionally not connected yet; the current web supports live catalog browsing, local cart, server pricing quotes, and an honest checkout-readiness state without creating an order or payment.
- Full authenticated end-to-end workflow testing remains pending.
- OTP, online payment providers, printers, production gateway certificates, monitoring, backups/restore, and Railway deployment are not production-ready.
- Unsupported admin features intentionally show unavailable states rather than pretending to save data.
