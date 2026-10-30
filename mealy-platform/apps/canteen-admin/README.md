# Mealy Canteen Owner

The separate owner and management workspace for people responsible for one or more Mealy canteens.

The application deliberately separates a simple default **Main view** for portfolio statistics, order records, reports, and alerts from **Advanced management** for menu, inventory, outlet, kitchen, device, team, tax, module, activity, and business settings.

The workspace loads its canteens, outlets, orders, catalog, team, activity, and alerts through the versioned Railway-hosted Mealy backend API. Supported availability and outlet-ordering changes are also API-backed. Unfinished management contracts show explicit empty or unavailable states; no local operational records are substituted.

Copy `.env.example` to `.env` and configure the API URL and session token before running the app. It never receives PostgreSQL credentials or writes operational tables directly.

## Local development

```powershell
npm install
npm run dev
```

Before committing, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
