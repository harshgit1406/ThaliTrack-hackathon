# Design System

## Direction

- **Confirmed:** Student ordering and canteen POS have separate design inspirations.
- **Confirmed:** The user will provide logo, colors, screenshots, and references.
- **Confirmed:** Build clean Mealy interfaces; do not preserve or import the combined ProBills application shell.
- **Confirmed:** POS billing, kitchen/KDS, student/QR ordering, and admin are distinct task-focused interfaces.
- Final visual rules: **TBD pending assets and reference identification**.

## Shared product-level principles

These are proposed until approved:

- Make token number and current order status the strongest information on active-order and handoff surfaces.
- Optimize student screens for quick one-handed ordering and noisy campus environments.
- Optimize POS screens for speed, high information density, obvious state, and touch/counter use.
- Never encode status, availability, or payment state by color alone.
- Use explicit loading, empty, offline, payment-pending, retry, and error states.
- Keep tap targets at least 44 by 44 CSS pixels and support keyboard focus on desktop POS.
- Respect reduced-motion preferences.

## Student application system

| Token/category | Status |
| --- | --- |
| Logo and wordmark | Use only `apps/pos/src/assets/mealy-logo.png`; do not reuse the reference or legacy-app logo |
| Primary/secondary/accent colors | Shared Mealy orange/slate/near-white platform language; the supplied green reference palette is not a brand source |
| Typography | Existing platform system/UI font stack; do not introduce an unrelated font |
| Spacing/radius/elevation | Phone-first 4 px rhythm, 16-20 px mobile cards, restrained desktop radii/elevation |
| Iconography | One consistent outlined family with text/non-color status reinforcement |
| Motion | Shared-element continuity for context, canteen, item, cart, token, and order status; reduced-motion support is mandatory |

Legacy student implementations use orange/indigo variants and extensive Tailwind/Radix-derived components. Those colors/components are **Observed**, not approved brand decisions.

The full approved planning direction, responsive compositions, screens, motion matrix, component boundaries, and acceptance criteria are recorded in `STUDENT_WEB_PLAN.md`.

## POS system

| Concern | Rule |
| --- | --- |
| Visual source | Clean Mealy-specific POS design; supplied references and ProBills may inform interactions but are not implementation sources |
| Layout | Prioritize rapid counter billing, order-source visibility, touch use, keyboard speed, and minimal navigation |
| Operational state | Incoming, accepted, preparing, ready, collected, cancelled, and payment states must be unmistakable; exact set **TBD** |
| Token/KOT | Token should be easy to scan at a distance; KOT must retain item options, notes, quantities, and timestamps |
| Feedback | Every order/status action needs immediate success/failure/pending feedback and duplicate-action protection |
| Resilience | Temporary connection loss must be visible; offline write behavior is **TBD** |

### Initial POS handoff received 2026-09-21

- **Confirmed:** The Mealy logo asset is available at `apps/pos/src/assets/mealy-logo.png` for the POS shell.
- **Confirmed:** The supplied desktop POS reference establishes the first shell composition: top task navigation, category rail, searchable item grid, and persistent current-bill panel.
- **Proposed:** Use the wordmark's orange as the temporary action/selected-state accent, balanced with near-white surfaces and dark slate text. Replace it with documented brand tokens when the user supplies the final palette.
- **Implemented:** The cashier shell includes explicit empty, search-empty, offline, payment-blocked, success/error message, and unexpected-renderer-error recovery states. It supports a three-dot and long-press availability action for rush-hour operation.

## Kitchen display system

| Concern | Rule |
| --- | --- |
| Purpose | Focus only on KOT intake, preparation sequencing, item progress, readiness, delays, and exceptions |
| Order source | Clearly distinguish POS counter, student app, and QR orders without changing the kitchen workflow |
| Layout | Large, distance-readable tickets optimized for continuous kitchen operation; do not embed admin or billing navigation |
| Actions | Fast, permission-controlled KOT/item transitions with duplicate-action protection and immediate feedback |

### Initial KDS implementation received 2026-10-11

- **Implemented:** `apps/kds` uses three large `New`, `Preparing`, and `Ready` lanes with prominent token numbers, order-source labels, elapsed-time urgency, item modifiers/notes, and immediate pending/success feedback.
- **Implemented:** Preparing tickets show per-item readiness controls and progress. Completed item lines remain visible with explicit green/check treatment, and the whole-order action stays unavailable until every line is ready.
- **Implemented:** The layout reuses the Mealy wordmark and established orange/slate product language while remaining a focused kitchen surface without POS, billing, or administration navigation.
- **Implemented:** Gateway connected/offline states, safe action disabling, fullscreen and sound controls, loading/error/empty states, and responsive kitchen-display/tablet layouts.
- **Boundary:** This is a frontend-only ticket and item-line baseline. Live KOT transport, entitlement enforcement, multi-station routing, audio policy, exceptions, and durable recovery remain future work.

## Platform administration system

| Concern | Rule |
| --- | --- |
| Visual source | Reuse the implemented POS product language: Mealy wordmark, near-white surfaces, dark slate text, orange action/selection states, light borders, rounded controls, and explicit status treatments |
| Layout | Persistent desktop sidebar with grouped platform, access, and oversight navigation; compact top search/status bar; responsive drawer navigation on smaller screens |
| Scope | Central campus/canteen setup, feature entitlements, Mealy team RBAC, operational oversight, audit, and safe defaults |
| Separation | Do not place canteen catalog editing, station/printer routing, routine KOT transitions, or kitchen execution in the platform-admin interface |
| Safety | Never substitute demo operational records; show honest empty/error states and require explicit reasons plus audit events for sensitive/critical backend actions |
| Accessibility | Keyboard-visible focus, labeled switches/actions, status text in addition to color, responsive tables, and reduced-motion support |

### Initial platform-admin handoff received 2026-10-10

- **Confirmed:** The platform admin should use the POS layout and color language rather than introduce another visual identity.
- **Implemented:** `apps/admin` includes overview, campuses, canteens, entitlement controls, Mealy team access, roles and permissions, operations monitoring, audit history, settings, guided canteen onboarding, detail drawers, responsive navigation, and UI-only feedback states.
- **Boundary:** Payment and wallet modules remain visibly unavailable until their launch rules are approved; operational monitoring does not expose kitchen preparation actions.

## Canteen owner administration system

| Concern | Rule |
| --- | --- |
| Visual source | Reuse the Mealy POS/admin wordmark, typography, orange/slate palette, near-white surfaces, light borders, rounded controls, status patterns, and feedback behavior |
| Main view | Default, calm daily workspace containing only statistics, read-only records, reports, alerts, and portfolio/canteen context switching |
| Advanced view | Explicitly entered configuration workspace with a persistent canteen editing banner and no all-canteen mutation context |
| Multi-canteen UX | Main view may aggregate every assigned canteen; Advanced management must target exactly one canteen and keep that context visible |
| Navigation | Main and Advanced modes expose different navigation sets instead of mixing daily records with complex setup |
| Safety | Routine kitchen execution stays in POS/KDS; module assignment and campus relationships remain central-platform responsibilities |

### Initial canteen-owner handoff received 2026-10-10

- **Confirmed:** Owners may manage multiple canteens from one account.
- **Confirmed:** The initial view should remain simple and focus on statistics, records, reports, and current problems.
- **Confirmed:** Complete cafe configuration belongs behind a separate Advanced management mode.
- **Implemented:** `apps/canteen-admin` provides responsive Main and Advanced modes, contextual portfolio/canteen selection, backend-sourced management data, and explicit unavailable states for contracts not implemented yet.

## Required design handoff

Before frontend implementation, capture:

- Original logo assets (prefer SVG plus raster fallback), usage rules, and favicon/app icon needs.
- Color values and semantic roles, not screenshots alone.
- Student references and exact screens/states they apply to.
- POS and KDS references plus exact counter, tablet, kitchen-display, and desktop device targets.
- Accessibility or campus branding constraints.
- Image licensing/ownership confirmation.
