# Mealy Platform Admin

The platform-level administration interface for managing campuses, canteens, module entitlements, Mealy team access, permissions, operational oversight, audit history, and safe defaults.

This first increment is a frontend-only UI preview. Its records and actions are intentionally held in local React state until the versioned Railway-hosted Mealy backend and authorization contracts are connected. It never connects to PostgreSQL directly.

## Local development

```powershell
npm install
npm run dev
```

Use `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before committing changes.
