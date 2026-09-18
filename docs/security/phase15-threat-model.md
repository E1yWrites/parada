# PARADA Phase 15 Threat Model

Status: working audit record for pre-deployment review. Findings are evidence-based; physical-camera, device, deployment, and payment-provider controls still require environment verification.

## Trust boundaries

| Boundary | Attacker | Asset / attack | Mitigation | Regression evidence | Result |
| --- | --- | --- | --- | --- | --- |
| User -> Mobile | Lost or compromised device user | Token theft, account takeover, unsafe form handling | SecureStore token storage, server-derived identity, password and verification flows, autofill hints, accessible validation states | Mobile auth and form stability suites; API auth/account suites | Covered in code/tests; device theft and biometric policy remain deployment decisions |
| Mobile -> API | Authenticated or unauthenticated client | IDOR/BOLA, role tampering, malformed or oversized requests | Auth middleware, token-derived user id/role, ownership-scoped domain queries, JSON body limits, route validation and rate limits | API app, account, reservation, assignment, session, violation, and audit regression suites | Covered by 291 passing API tests |
| API -> Database | API bug or concurrent request | Occupancy corruption, duplicate events, reservation/session races, secret exposure | Prisma transactions, uniqueness constraints, idempotency keys, bounded inputs, domain invariants | Occupancy, vision-pipeline, phase13, simulator, reservation, session suites | Covered by regression tests; production load/concurrency still required |
| Vision/Camera -> API | Spoofed camera or replay attacker | Fake plate/zone event, event flooding, replay | `X-API-Key`, constant-time comparison, production key requirement, source-event uniqueness, camera rate limit, OCR confidence threshold, bounded event fields | Event route tests cover key enforcement, replay behavior, and oversized identifiers | Covered in API tests; key rotation and network allow-list remain deployment tasks |
| API -> SSE clients | Authenticated user or admin client | Cross-user event leakage or admin stream access | Authenticated realtime route, audience/user scoping, role-aware hub subscriptions, disconnect cleanup | Realtime, cross-layer, rollback, assignment, reservation, and event suites | Covered by API tests |
| Admin -> API | Compromised user account or tampered admin request | Privilege escalation or unauthorized mutation | Server-side role checks; acting identity derived from token, never request body; admin rate limits | App security tests include user/admin and body-identity tampering cases | Covered by API tests |
| API -> Mail / logs | Malicious input or operator access | Credential, token, password, or personal-data leakage | Generic recovery responses, hashed stored tokens, branded templates, controlled console/memory transport, generic internal errors | Account tests verify hashes, generic responses, and mail contents | Covered in tests; production log sink/redaction review remains required |

## Findings and disposition

- **Fixed:** production app construction could let an explicit `cameraApiKey: null` override an environment key. Production now rejects a missing effective key before registering camera ingress.
- **Fixed:** camera identifiers, source event ids, and detected plates were not bounded at the ingress route. They now have explicit maximum lengths before domain/database work.
- **Fixed:** API integration suites reused hard-coded records between files/reruns. The test-only Jest setup truncates the dedicated API test database before each file.
- **Open:** `npm audit --workspaces --omit=dev` reports 19 advisories (1 critical, 2 high, 16 moderate). Remediation is not applied automatically because the suggested forced upgrades include breaking Next.js, Expo Router, and Nodemailer changes.
- **Open:** payment-provider authorization/state verification, production SSE proxy limits, camera key rotation, network segmentation, raw-image retention, and physical-device accessibility need deployment/environment evidence.

## Release gates

1. Set non-default production `DATABASE_URL`, `JWT_SECRET`, and `CAMERA_API_KEY`; production startup must fail when required secrets are absent.
2. Keep camera ingress behind TLS and a network policy in addition to the API key.
3. Run the full database, API, admin, mobile, types, and vision suites in CI with isolated test data.
4. Review dependency advisories package-by-package; do not use `npm audit fix --force` without upgrade-specific regression runs.
5. Confirm payment callbacks are server-authoritative and idempotent before enabling payment in production.
