# PARADA — CLAUDE.md

- PARADA is an LPU Batangas capstone.
- Current stack: Mobile (Expo/React Native), Admin (Next.js), API (Express/TS), Vision (Python), PostgreSQL/Prisma.
- Completed through Phase 12. Next: 13 → 14 → 15 → 16.
- Work ONLY on the requested phase/task. Never start the next phase automatically.

## Core Rules
- Inspect before changing.
- Reuse existing code; do not rebuild without evidence.
- Keep changes minimal and scoped.
- Backend/domain/database are authoritative.
- Mobile/Admin/Vision do not directly access Prisma/PostgreSQL.
- PARADA is zone-based; slots are inventory/layout only.
- Recommendation ≠ Assignment ≠ Reservation ≠ Session.
- GPS is navigation only.
- Vision identifies observations; backend decides business meaning.
- Never fake OCR, confidence, hardware, tests, accuracy, or deployment.

## Security
- Roles: USER / ADMIN.
- Authorization is enforced by backend.
- Preserve HttpOnly Admin auth and Mobile SecureStore.
- Only explicit 401/UNAUTHORIZED may invalidate credentials.
- Never expose secrets, JWTs, API keys, passwords, DB URLs, or camera credentials.

## Camera / Vision
Camera → Vision/OCR → API → Domain → DB.
Supported Phase 11C sources: USB, RTSP/IP, video file.
Never let Vision access the DB or implement parking business logic.
Preserve camera auth, zone mapping, direction, timestamps, and idempotency.

## Database / API
- Inspect schema, routes, domain, shared types, and tests before contract changes.
- Never guess payloads or duplicate business logic.
- Preserve occupancy atomicity, reservation concurrency, assignment/session uniqueness, violation state transitions, and ownership.

## Git
Before work:
`git status --short`
`git branch --show-current`
`git rev-parse HEAD`

Never run without explicit approval:
`git reset`, `git restore`, `git checkout`, `git clean`, `git stash`

Default: no commit, no push.

## Testing
- Add focused regression tests for every behavior change.
- Use real DB/integration tests where relevant.
- Report exact results only.
- Distinguish unit, integration, real OCR, physical camera, device, and deployment testing.
- Never weaken tests to make them pass.

## Phase Workflow
AUDIT → IMPLEMENT ONLY REQUESTED SCOPE → TEST → TYPECHECK/LINT/BUILD → REVIEW DIFF → REPORT → STOP.

## Reporting
Keep reports concise:
- Implemented
- Tests / verification
- Files changed
- Warnings
- Deferred
- Git status

For audits: finding + severity + evidence + impact + recommendation.

## UI
- Preserve existing design systems unless redesign is requested.
- No text overflow/clipping.
- Preserve accessibility, loading, error, and empty states.
- Do not introduce unnecessary dependencies.

## Golden Rule
Inspect first. Do not guess. Do not expand scope. Do not destroy existing work. Do not claim unperformed verification.
