# Security

## Review status (2026-10-26)

The active review covers the PostgreSQL/Fastify backend, POS Electron app, KDS, canteen administration, platform administration, outlet gateway, realtime gateway channel, printing path, and local Compose deployment. The paused student app was dependency-scanned and built, but its end-to-end product flow was not security-tested in this pass.

The implementation is materially hardened and all known package advisories are cleared. It is not yet a claim of production penetration-test or compliance certification. Controls that depend on the production network, identity provider, payment provider, secret manager, and monitoring platform remain launch gates.

## Protected trust boundaries

- Bearer sessions are stored as SHA-256 hashes, expire, can be revoked, and are sent with `Cache-Control: no-store` responses.
- Staff PIN verification uses salted scrypt hashes, constant-time comparisons, account attempt limits, and a stricter authentication-route rate limit.
- Bootstrap and LAN gateway tokens use timing-safe comparisons. Production startup rejects weak bootstrap/LAN/cloud tokens and insecure cloud HTTP/WebSocket URLs.
- Platform, canteen, and outlet membership scopes are distinct. Outlet membership no longer satisfies a canteen-wide check; canteen membership can reach only outlets whose server-resolved parent is that canteen.
- Management snapshots require canteen-level reporting permission. Team and audit data are returned only for separately authorized scopes.
- Gateway credentials resolve their outlet on the server. Sync identity mismatches return `403`; gateway enrollment and rotation never return stored hashes.
- Orders and all financial mutations recalculate or validate server-side amounts. Required idempotency keys are bounded and validated.
- POS settlement and refund transactions lock the order row. Same-key retries return the prior result, while competing requests serialize before balance checks.
- API and gateway request bodies, request rates, realtime payloads/connections, and gateway event-stream clients have explicit ceilings.
- CORS and WebSocket origins are exact allowlists. The gateway no longer trusts a caller-controlled `Host` header as proof of same origin.
- API, gateway, and Electron surfaces set defensive CSP/HTTP/browser controls. Electron uses isolation, sandboxing, no Node integration, denied permissions, blocked webviews/popups, and exact navigation checks.
- Compose binds database/API/realtime ports to loopback by default. Backend containers are read-only, drop Linux capabilities, and set `no-new-privileges`.
- Outlet cloud calls have bounded timeouts; WebSocket compression is disabled and inbound frames are bounded.
- Browser staff tokens are session-only and are no longer accepted from `VITE_*` build variables.

## Verified abuse cases

- Unknown browser origins receive no API CORS grant and are rejected by the outlet gateway.
- Oversized API and gateway payloads return `413`, not an internal error.
- Repeated authentication requests return `429` with a generic response.
- Outlet staff cannot act on a different outlet or promote their membership into canteen scope.
- Canteen staff can act only on outlets whose parent canteen was resolved by the backend.
- Missing, oversized, whitespace-bearing, or otherwise unsafe idempotency keys are rejected.
- Production gateway configuration rejects HTTP cloud APIs, unencrypted WebSockets, and short cloud tokens.
- All seven npm dependency trees report zero known vulnerabilities after lockfile refresh.

## Remaining production launch gates

These are not safely solvable by application code alone and must remain visible:

1. **Staff identity and MFA:** platform/canteen admin apps still need a user-facing production sign-in, recovery, MFA, and session/device-management flow. A token must not be pasted into storage or injected at build time.
2. **KDS/POS LAN device identity:** the current per-outlet LAN token is shared with configured clients and must not be considered tamper-resistant. Replace it with per-device enrollment/rotation (ideally hardware-backed), restrict the gateway to a trusted VLAN/firewall, and revoke lost devices.
3. **Payment providers:** online provider adapters and webhook signature verification are not implemented. The current webhook route records an unverified event and performs no financial effect. Do not enable live online payments until signature, amount, currency, ownership, replay, refund, and reconciliation tests pass.
4. **OTP delivery:** production deliberately fails closed because no SMS adapter is configured. Provider delivery, abuse monitoring, cost controls, and account-recovery policy are required before student sign-in launch.
5. **Shared distributed controls:** in-memory rate/connection limits protect one process. Multi-instance production requires a shared limiter or edge/WAF enforcement with tested client-IP forwarding. Enable `MEALY_TRUST_PROXY` only behind an explicitly trusted reverse proxy path.
6. **Transport and edge:** terminate TLS with HSTS at the public edge, configure frontend CSP/frame headers at the static host, restrict API/realtime ingress, and protect administrative routes with network and identity-aware controls.
7. **Secrets and operations:** use a production secret manager, rotate bootstrap/gateway/provider/database secrets, disable bootstrap after initial provisioning, alert on token rotation and authorization failures, and redact sensitive logs centrally.
8. **Database defense:** use a least-privilege runtime role, private networking, encrypted backups, restore drills, retention/deletion controls, and consider PostgreSQL row-level security as defense in depth.
9. **Outlet data at rest:** the gateway SQLite database and print spool contain operational/customer data. Require full-disk encryption, restricted OS accounts, secure device disposal, and a defined retention cleanup job.
10. **Independent assurance:** run authenticated SAST/secret scanning in CI, DAST against the deployed environment, a third-party penetration test, dependency monitoring, and an incident-response/tabletop exercise.

## Required production tests

- Cross-tenant API matrix for every role, object ID, canteen, outlet, order, payment, KOT, report, device, and audit route.
- Concurrent order, token, settlement, refund, inventory, print, reconnect, and replay tests against production-like PostgreSQL.
- Brute-force, credential stuffing, session theft/revocation, MFA recovery, CORS, DNS-rebinding, request-smuggling, oversized-input, slow-client, and WebSocket exhaustion tests at the real proxy/edge.
- Provider-signed payment success/failure/replay/refund/reconciliation tests in sandbox, then controlled production canaries.
- Gateway theft/re-enrollment, revoked token, malicious LAN client, offline tampering, disk extraction, printer failure, and prolonged disconnect tests.
- Backup restore, regional/service outage, log/alert delivery, key rotation, and breach-response drills.

## Privacy and compliance decisions

Indian privacy obligations, campus policy, payment scope, tax/invoice retention, minors, consent, breach notification, employee monitoring, account deletion, and data-retention periods require owner/legal approval before launch.
