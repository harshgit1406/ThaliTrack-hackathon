# Mealy POS

The Mealy POS is a Windows Electron shell with a React/TypeScript cashier workspace. Catalog, availability, orders, and order transitions use the versioned Mealy API; the runtime does not substitute local menu or order records when the API is unavailable.

## Test it on Windows

Start the local Docker backend first, copy `.env.example` to `.env`, and configure the outlet, counter, terminal, and session values. Database credentials stay in the backend and must never be placed in the POS renderer.

### 1. Open PowerShell and go to the POS folder

```powershell
cd C:\Users\Harsh\Desktop\mealy\mealy-platform\apps\pos
```

### 2. Confirm Node.js is installed

```powershell
node --version
npm --version
```

Use Node.js 20 or newer. If either command is not found, install the current Node.js LTS release, reopen PowerShell, then repeat step 1.

### 3. Install dependencies (first time only)

```powershell
npm install
```

### 4. Start the desktop POS

```powershell
npm run dev
```

The first Electron launch may download the Windows Electron runtime. Keep PowerShell open until the Mealy POS window appears. To stop it later, return to PowerShell and press `Ctrl + C`.

If the desktop window does not open after the first download attempt, close it with `Ctrl + C` and run `npm run dev` once more. If you only need to inspect the UI while Electron downloads, run:

```powershell
npm run dev:renderer
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173) in a browser. Stop that server with `Ctrl + C` when finished.

## What to test

1. Click menu items and confirm they appear in the current bill.
2. Use the plus/minus buttons; an item should disappear when its quantity reaches zero.
3. Press `/`, search for an item, and clear the search.
4. Click the three dots on an item—or long-press it—to mark it available, low quantity, or sold out.
5. Click **Hold** and check that a friendly confirmation appears.
6. Click **Charge** with items in the bill and confirm the order is created through the backend. Online payment capture is not connected yet.
7. Add an item, refresh the renderer/browser, and confirm the draft bill returns.
8. Add items, press **Hold**, and use **Restore latest** in the bill panel to bring the held bill back.
9. Open **Online orders** and confirm only backend-returned orders appear.
10. Advance an active token through preparation, readiness, and collection; confirm it appears in **History**.
11. Confirm no more than two notification cards appear at once in the top-right corner.
12. Confirm unavailable payment or inventory write paths explain their missing backend contract instead of reporting false success.

For this test, please report any layout issue, confusing action, broken button, error message, or slow interaction with a screenshot and the exact step that caused it.

## Useful checks

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

`npm run build` checks TypeScript and builds the renderer. The Electron main process keeps Node.js disabled in the renderer, enables context isolation, and exposes only a small, validated runtime-information bridge.

## Current UX safeguards

- Saved local draft bill to avoid losing an in-progress checkout after a renderer refresh.
- Visible online/offline state with safe, user-friendly recovery guidance.
- Non-cash payment blocked while offline, with an immediate Cash fallback action.
- User-facing success/error messages and an error boundary that preserves the draft bill.
- Quick item availability actions through the three-dot button or a long press.
- Top-right notification queue capped at two visible messages.
- API-backed catalog, order creation, live order lists, availability, and order transitions.
- Recoverable local draft and held-bill state only; these are cashier work-in-progress records, not fallback catalog or orders.
- Explicit empty/error states when backend data or an unfinished API capability is unavailable.

## Integration boundary

`src/services/menu-service.ts` is the versioned Mealy API boundary. Do not place Railway PostgreSQL credentials in the renderer or connect it directly to operational tables.
