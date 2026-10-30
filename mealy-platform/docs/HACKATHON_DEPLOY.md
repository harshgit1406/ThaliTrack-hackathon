# ThaliTrack deployment runbook

The hackathon deployment uses Railway for PostgreSQL and the existing modular backend, plus two Vercel projects for the student and canteen experiences. No Python or separate ML service is required; the ridge-regression model runs inside the Node API.

## Railway

Create one Railway project and add PostgreSQL. Add the GitHub repository three times, using this root directory for every backend service:

```text
/mealy-platform/apps/backend
```

### API service

- Dockerfile: automatically detected from the service root.
- Start command: `node dist/api.js`
- Pre-deploy command: `node dist/migrate.js`
- Healthcheck: `/health`
- Public networking: enabled.

### Realtime service

- Start command: `node dist/realtime.js`
- Healthcheck: `/health`
- Public networking: optional for the hackathon; required only for an outlet gateway demo.

### Worker service

- Start command: `node dist/worker.js`
- Public networking: disabled.

### Shared backend variables

```text
NODE_ENV=production
MEALY_DATABASE_URL=${{Postgres.DATABASE_URL}}
MEALY_DATABASE_POOL_MAX=5
MEALY_TRUST_PROXY=true
MEALY_ALLOWED_ORIGINS=https://YOUR-STUDENT.vercel.app,https://YOUR-CANTEEN.vercel.app
MEALY_BOOTSTRAP_ADMIN_TOKEN=GENERATE_AT_LEAST_32_RANDOM_CHARACTERS
MEALY_BOOTSTRAP_ADMIN_ENABLED=false
MEALY_DEMO_MODE=true
MEALY_OTP_PROVIDER=unconfigured
MEALY_SESSION_TTL_HOURS=12
```

Railway injects `PORT`; both API and realtime entrypoints now use it automatically. Do not set a database URL in either Vercel project.

### One-time demo data

After the first successful API deployment, temporarily add `MEALY_ALLOW_SAMPLE_DATA=true` to the API service and run:

```text
node dist/seed.js
```

Remove the variable afterward. The seed is idempotent and creates the campus, canteen, students, manager, 10-dish four-week history, timetable rush windows, and an after-3 PM surplus offer.

Verify:

```text
GET https://YOUR-API.up.railway.app/health
GET https://YOUR-API.up.railway.app/ready
```

Readiness must report schema version `12`.

## Vercel

Import the same GitHub repository twice.

### Student project

- Root directory: `mealy-platform/apps/student-web`
- Environment variables:

```text
VITE_MEALY_API_BASE_URL=https://YOUR-API.up.railway.app
VITE_MEALY_OUTLET_ID=e0000000-0000-4000-8000-000000000001
VITE_MEALY_DEMO_MODE=true
```

### Canteen project

- Root directory: `mealy-platform/apps/canteen-admin`
- Environment variables:

```text
VITE_MEALY_API_BASE_URL=https://YOUR-API.up.railway.app
VITE_MEALY_DEMO_MODE=true
```

Both apps include Vite SPA rewrites, so `/orders/:id` and other deep links resolve correctly. Every `VITE_` value is browser-visible; only public URLs and identifiers belong there.

## Demo rehearsal

1. Open student URL on phone A and sign in as Aarav.
2. Open student URL in an incognito session on phone B and sign in as Meera.
3. Open canteen URL on a laptop and enter the demo dashboard.
4. Place orders into two 10-minute slots.
5. Show the rush board updating within three seconds and mark both orders ready.
6. Show both phones updating their token/status timelines.
7. Log leftover kilograms, show the recomputed forecast, and schedule the 35% surplus offer.
