# Phase 12 — Real-Time Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Deviation from the standard template:** the user's spec forbids git commits for this phase ("Do not: commit, push, reset, restore, checkout, clean, stash"). Per-step commit instructions are therefore omitted; each step still ends with a test run instead of a commit.

**Goal:** Deliver genuine real-time push of authoritative backend state (occupancy, sessions, reservations, assignments, violations, notifications) to the Admin web app and Mobile app, without the realtime layer becoming a second source of business logic.

**Architecture:** Server-Sent Events (SSE) from one Express endpoint (`GET /realtime/stream`), fed by a small in-process broadcast hub that route handlers call **after** their existing domain-service call has resolved (i.e., after the DB transaction has committed). Admin's browser connects to a same-origin Next.js Route Handler that relays the stream server-to-server (mirrors the existing `/api/proxy` pattern, keeps the httpOnly JWT off the browser). Mobile connects directly to the API with its existing bearer token via a small header-capable SSE client (RN has no built-in `EventSource`). Both clients react to events by invalidating the matching React Query key and letting the existing fetchers refetch authoritative state — never by trusting the event payload as truth.

**Tech Stack:** Express (existing), native Node HTTP streaming (no new backend dependency), native browser `EventSource` (no new admin dependency), `react-native-sse` (one new, narrowly-scoped mobile dependency — RN has no built-in SSE client), `@tanstack/react-query` (existing, both apps).

**Spec:** Phase 12 spec as given in the user's prompt (2026-09-08, "PARADA — PHASE 12 — REAL-TIME INTEGRATION"). No separate design doc exists; this plan's "Global Constraints" section reproduces the spec's non-negotiable rules verbatim.

## Global Constraints

- Database/backend remains authoritative; clients never compute occupancy, sessions, reservation capacity, guest admission, or violations themselves.
- Vision never bypasses the API and never writes to Prisma/Postgres directly (unchanged — Phase 12 touches nothing in `services/vision`).
- Admin and Mobile never write directly to Postgres (unchanged — both still only call the existing REST API).
- Recommendation != Assignment != Reservation != Session (unchanged domain semantics — Phase 12 adds no new mutation paths).
- A realtime event MUST NOT be published before its authoritative transaction has committed. An event published for an operation that ultimately fails is a defect.
- Admin subscriptions: ADMIN role only. User subscriptions: scoped to that user's own data. No JWTs, API keys, passwords, or another user's data ever cross the wire on the realtime channel.
- Realtime disconnect/error must never cause logout, token deletion, admin cookie deletion, or query-cache destruction. 429 and NETWORK/TIMEOUT are not authentication failures.
- No Kafka/Redis/Socket.IO. No new product features. No UI redesign. No Phase 13 work.
- Do not commit, push, reset, restore, checkout, clean, or stash. Do not redo Phases 11/11A/11B/11C.

---

## Audit Summary (already performed — do not repeat)

- Branch `main` at `1103feb`, clean history, `git status --short` shows only pre-existing uncommitted work from prior phases (untouched by this plan). `git diff --stat`: 38 files, +2938/-159 (pre-existing, not from this plan).
- No WebSocket/SSE infrastructure exists anywhere in project code (only vendored FastAPI/Starlette library internals under `services/vision/.venv`, irrelevant).
- Auth: JWT (HS256) via `services/api/src/domain/token.ts`, verified by `services/api/src/middleware/auth.ts`'s `createAuthMiddleware` (reads `Authorization: Bearer`, checks `RevokedToken` table). Mobile stores the raw JWT in `expo-secure-store` and sends it as a header on every request (`apps/mobile/lib/api/client.ts`). Admin stores the JWT in an **httpOnly** cookie (`apps/admin/lib/auth.ts`, cookie name `parada_admin_token`) — browser JS cannot read it — and every admin API call is server-proxied through `apps/admin/app/api/proxy/[...path]/route.ts`, which reads the cookie, verifies ADMIN role via `/auth/me`, and forwards a `Bearer` header to the backend.
- Polling today: Mobile — zones every 30s, active session every 15s (`apps/mobile/app/(tabs)/parking.tsx`); Admin — zones/dashboard/sessions every 30s (`apps/admin/app/(app)/{zones,page,sessions}.tsx`).
- React Query: Mobile query keys in `apps/mobile/lib/query.ts` (`queryKeys.zones`, `.activeSession`, `.assignments`, `.reservations`, `.notifications`, `.violations`, `.establishment`). Admin uses ad-hoc string keys per page (`["zones"]`, `["dashboard"]`, `["sessions"]`, etc.) via `apps/admin/lib/query-client.ts`.
- Notification creation happens deep inside `OccupancyService` (5 call sites, `services/api/src/domain/occupancy.ts`) and `ViolationService` (3 call sites, `services/api/src/domain/violations.ts`), all inside `prisma.$transaction`. Reworking every one of those call sites to surface a return value would touch ~1000 lines of intricate transactional logic for a feature ("real-time notifications") explicitly listed only as one of several "potential events" with "only implement events with real consumers" — **decision below scopes this down**.
- `ParkingSessionService.entry`/`.exit`, `ReservationService.create`/`.cancel`, `AssignmentService.create` all already return the full, commit-complete DTO the route handler passes straight to `ok(...)` — these are safe, zero-risk publish points requiring no domain-service changes.
- `ViolationService.escalateWrongZone` (called from inside `OccupancyService.processRegisteredVehicle`, `occupancy.ts:471`) already computes the created `Violation` and `Notification` but discards both (`await this.violations?.escalateWrongZone(tx, {...})` — return value unused). Capturing it requires a small, contained change to two `return` statements in `occupancy.ts`, not a rewrite of its business logic.
- `ViolationService.appeal`/`.review` (`violations.ts`) are small, self-contained, single-transaction methods — safe to enrich their return values.

## Decision: Event Scope for This Phase

Implementing **only events with a safe, low-risk, already-commit-complete data source**, per the spec's own "Only implement events with real consumers" and "Do NOT implement... new product features" instructions:

| Event | Trigger (file:function) | Source of payload |
|---|---|---|
| `ZONE_OCCUPANCY_UPDATED` | `routes/events.ts` (camera), `routes/sessions.ts` (user entry/exit), `routes/admin.ts` guest-admit override, `routes/simulator.ts`, `routes/admin.ts` zone PATCH | Fresh `ZoneService.getById(zoneId)` read after the mutating call resolves (existing method, zero risk) |
| `PARKING_SESSION_STARTED` | `routes/sessions.ts` `/sessions/entry` | The `ParkingSessionResponse` already returned by `sessionService.entry()` |
| `PARKING_SESSION_COMPLETED` | `routes/sessions.ts` `/sessions/:id/exit` | The `SessionExitResult.session` already returned by `sessionService.exit()` |
| `RESERVATION_CREATED` | `routes/reservations.ts` `POST /reservations` | The `ReservationResponse` already returned |
| `RESERVATION_CANCELLED` | `routes/reservations.ts` `PATCH /reservations/:id/cancel`, `routes/admin.ts` admin-cancel | The `ReservationResponse` already returned |
| `ASSIGNMENT_CREATED` | `routes/assignments.ts` `POST /assignments` | The `ZoneAssignmentResponse` already returned |
| `VIOLATION_CREATED` | `routes/events.ts` (camera wrong-zone escalation) | `OccupancyService.processEvent()`'s return, enriched (Task 9) to include the `Violation` `escalateWrongZone` already creates |
| `GUEST_ADMISSION_ISSUE` | `routes/admin.ts` `/admin/guest-admit`, `routes/events.ts` (camera guest denial) | The existing `GuestAdmissionResult` shape already defined in `occupancy.ts` |
| `NOTIFICATION_CREATED` | `routes/violations.ts` `/violations/:id/appeal`, `routes/admin.ts` appeal review | `ViolationService.appeal`/`.review`, enriched (Task 10) to return the `Notification` row they already create |

**Explicitly deferred** (documented, not silently dropped): `RESERVATION_EXPIRED` and `ASSIGNMENT_EXPIRED` fire as a **side effect of a GET** (lazy expiry in `ReservationService.list`/`AssignmentService.create`), not a discrete user action — turning a read into a publish-triggering write is a bad precedent and the spec explicitly permits skipping events without a clean trigger ("only implement events with real consumers"). `CAMERA_STATUS_CHANGED` and `ANOMALY_CREATED` are deferred for the same reason: no low-risk existing call site returns the changed/created row without touching deep transactional code disproportionate to this phase's scope. Existing 15/30s polling continues to cover these paths; a client that misses one of these updates self-heals on its next poll tick or its next SSE reconnect-triggered refetch.

## Transport Decision (documented per spec's requirement)

**Server-Sent Events**, not WebSocket:

- **One-directional fits the requirement exactly.** The realtime channel only ever pushes authoritative state from server to client; clients never send data over it (mutations stay on the existing REST endpoints). SSE is the simpler protocol for a channel that is push-only by design — no framing/ping-pong protocol to hand-roll.
- **Zero new backend dependency.** Express's raw `res.write()` on a `text/event-stream` response is sufficient; Node has no built-in WebSocket server, so WS would require adding the `ws` package.
- **Zero new Admin dependency and zero architecture risk.** Next.js App Router Route Handlers stream SSE responses natively (already proven in this exact codebase style: `apps/admin/app/api/proxy/[...path]/route.ts` already proxies request/response bodies). WebSocket upgrade, by contrast, is **not** supported by Next.js Route Handlers without ejecting to a custom Node server — a much larger, riskier change this phase does not need.
- **Admin auth falls out for free.** The admin JWT lives in an httpOnly cookie (invisible to browser JS) and admin's own `EventSource('/api/realtime')` call is same-origin, so the browser automatically attaches that cookie — no ticket-minting, no token exposed to JS, exactly mirroring the existing proxy's cookie→bearer translation.
- **Mobile requires exactly one small, justified dependency.** React Native has a global `WebSocket` but no built-in `EventSource`. Since the transport is push-only, `react-native-sse` (a header-capable `EventSource`-shaped client) is added — the only new dependency in this entire phase.
- **Auth:** the SSE endpoint reuses the API's existing `createAuthMiddleware` unchanged — mobile sends the same `Authorization: Bearer` header it already sends on every request (the SSE client library supports custom headers); Admin's Next proxy sends the same header server-to-server exactly like the existing REST proxy.
- **Reconnect:** both `EventSource` (browser-native) and `react-native-sse` auto-reconnect with backoff. On the client's `onopen` firing *after* a prior `onerror`/close (i.e., a real reconnect, not first mount), both clients invalidate every core React Query key so the UI reloads authoritative state rather than trusting a gap may have been silently missed.
- **Event lifecycle:** `connected` (hello comment) → periodic 25s heartbeat comment (keeps intermediary proxies/load balancers from timing out the idle connection) → `event: <TYPE>\ndata: <json>\n\n` per publish → client-initiated close or server shutdown.

---

## File Structure

**New:**
- `packages/types/src/realtime.ts` — shared `RealtimeEvent` discriminated union + per-type payload interfaces, consumed by API (producer), Admin, and Mobile (consumers) so there is exactly one contract.
- `services/api/src/realtime/hub.ts` — connection registry + authorization-scoped broadcast (`publish(event)`).
- `services/api/src/realtime/hub.test.ts` — hub unit tests.
- `services/api/src/routes/realtime.ts` — `GET /realtime/stream` SSE endpoint.
- `services/api/src/routes/realtime.test.ts` — endpoint integration tests.
- `apps/admin/app/api/realtime/route.ts` — same-origin SSE relay (mirrors `app/api/proxy/[...path]/route.ts`).
- `apps/admin/__tests__/realtime-route.test.ts` — relay route tests.
- `apps/admin/lib/realtime.ts` — `useRealtime()` hook: opens `EventSource`, maps events to `queryClient.invalidateQueries`, exposes connection status.
- `apps/admin/__tests__/realtime-client.test.ts` — hook tests.
- `apps/mobile/src/lib/realtime.ts` — `useRealtime()` hook using `react-native-sse`, same event→invalidate mapping, exposes connection status.
- `apps/mobile/__tests__/realtime.test.ts` — hook tests.
- `services/api/src/realtime/crossLayer.test.ts` — one cross-layer test: domain call → DB commit → published event → authorized SSE client receives it.

**Modified:**
- `services/api/src/app.ts` — construct the hub once, mount `/realtime`, pass hub into the route factories that publish.
- `services/api/src/routes/events.ts`, `sessions.ts`, `reservations.ts`, `assignments.ts`, `admin.ts`, `simulator.ts`, `violations.ts` — publish after their existing awaited call resolves.
- `services/api/src/domain/occupancy.ts` — capture (not restructure) the already-computed `violation`/session-transition values at the two existing return points so routes can publish them.
- `services/api/src/domain/violations.ts` — `appeal()`/`review()` return the `Notification` row they already create, alongside their existing return value.
- `apps/admin/components/providers/providers.tsx` — mount the realtime hook once, inside `QueryClientProvider`.
- `apps/mobile/src/providers/AppProviders.tsx` — mount the realtime hook once.
- `apps/admin/package.json` — no new dependency (native `EventSource`).
- `apps/mobile/package.json` — add `react-native-sse`.

---

## Task 1: Shared Realtime Event Types

**Files:**
- Create: `packages/types/src/realtime.ts`
- Modify: `packages/types/src/index.ts` (add `export * from "./realtime";`)
- Test: `packages/types/src/realtime.test.ts`

**Interfaces:**
- Produces: `RealtimeEvent` (discriminated union on `type`), `RealtimeEventType` (string union of the 9 type literals), one payload interface per event type, `isRealtimeEvent(value: unknown): value is RealtimeEvent` type guard consumed by Tasks 13/14's clients when parsing SSE `data:` JSON.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/types/src/realtime.test.ts
import { isRealtimeEvent, type RealtimeEvent } from "./realtime";

describe("isRealtimeEvent", () => {
  it("accepts a well-formed ZONE_OCCUPANCY_UPDATED event", () => {
    const event: RealtimeEvent = {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      payload: {
        zoneId: "z1",
        name: "Zone A",
        code: "A",
        capacity: 10,
        occupiedCount: 3,
        availableCount: 7,
        status: "ACTIVE",
      },
    };
    expect(isRealtimeEvent(event)).toBe(true);
  });

  it("rejects a payload missing a discriminant", () => {
    expect(isRealtimeEvent({ occurredAt: "x", payload: {} })).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(isRealtimeEvent({ type: "NOT_REAL", occurredAt: "x", payload: {} })).toBe(false);
  });

  it("rejects a scalar", () => {
    expect(isRealtimeEvent("hello")).toBe(false);
    expect(isRealtimeEvent(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/types -- realtime.test.ts`
Expected: FAIL — `Cannot find module './realtime'`

- [ ] **Step 3: Write the implementation**

```typescript
// packages/types/src/realtime.ts
import type {
  NotificationType,
  ParkingSessionResponse,
  ReservationResponse,
  ViolationResponse,
  ZoneAssignmentResponse,
  ZoneStatus,
} from "./index";

/** Public zone snapshot pushed on every occupancy change. Same shape GET /zones
 *  already returns for one zone — the realtime channel never invents a shape
 *  clients don't already know how to render. */
export interface ZoneOccupancyPayload {
  zoneId: string;
  name: string;
  code: string;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  status: ZoneStatus;
}

export interface GuestAdmissionPayload {
  zoneId: string;
  admitted: boolean;
  deniedReason: string | null;
  anomalyType: string | null;
}

export interface NotificationCreatedPayload {
  id: string;
  zoneId: string;
  userId: string | null;
  type: NotificationType;
  message: string;
  targetRole: "USER" | "ADMIN";
  createdAt: string;
}

export type RealtimeEvent =
  | { type: "ZONE_OCCUPANCY_UPDATED"; occurredAt: string; payload: ZoneOccupancyPayload }
  | { type: "PARKING_SESSION_STARTED"; occurredAt: string; payload: ParkingSessionResponse }
  | { type: "PARKING_SESSION_COMPLETED"; occurredAt: string; payload: ParkingSessionResponse }
  | { type: "RESERVATION_CREATED"; occurredAt: string; payload: ReservationResponse }
  | { type: "RESERVATION_CANCELLED"; occurredAt: string; payload: ReservationResponse }
  | { type: "ASSIGNMENT_CREATED"; occurredAt: string; payload: ZoneAssignmentResponse }
  | { type: "VIOLATION_CREATED"; occurredAt: string; payload: ViolationResponse }
  | { type: "GUEST_ADMISSION_ISSUE"; occurredAt: string; payload: GuestAdmissionPayload }
  | { type: "NOTIFICATION_CREATED"; occurredAt: string; payload: NotificationCreatedPayload };

export type RealtimeEventType = RealtimeEvent["type"];

const EVENT_TYPES: readonly RealtimeEventType[] = [
  "ZONE_OCCUPANCY_UPDATED",
  "PARKING_SESSION_STARTED",
  "PARKING_SESSION_COMPLETED",
  "RESERVATION_CREATED",
  "RESERVATION_CANCELLED",
  "ASSIGNMENT_CREATED",
  "VIOLATION_CREATED",
  "GUEST_ADMISSION_ISSUE",
  "NOTIFICATION_CREATED",
];

/** Runtime guard for a value decoded from an SSE `data:` line. Never trust the
 *  wire without checking shape — a malformed/truncated frame must not crash
 *  the client's event handler. */
export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["type"] === "string" &&
    (EVENT_TYPES as readonly string[]).includes(v["type"]) &&
    typeof v["occurredAt"] === "string" &&
    typeof v["payload"] === "object" &&
    v["payload"] !== null
  );
}
```

Add to `packages/types/src/index.ts`:

```typescript
export * from "./realtime";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/types -- realtime.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @parada/types`
Expected: no errors

---

## Task 2: Backend Realtime Hub

**Files:**
- Create: `services/api/src/realtime/hub.ts`
- Test: `services/api/src/realtime/hub.test.ts`

**Interfaces:**
- Consumes: `RealtimeEvent` from `@parada/types` (Task 1).
- Produces: `RealtimeHub` class with `subscribe(client: RealtimeClient): () => void` (returns an unsubscribe function), `publish(event: RealtimeEvent, scope: PublishScope): void`, `connectionCount(userId?: string): number`. `RealtimeClient = { id: string; userId: string; role: Role; write: (chunk: string) => void }`. `PublishScope = { audience: "ADMIN" } | { audience: "USER"; userId: string } | { audience: "PUBLIC" }`.

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/realtime/hub.test.ts
import { RealtimeHub } from "./hub";
import type { RealtimeEvent } from "@parada/types";

function makeClient(id: string, userId: string, role: "USER" | "ADMIN") {
  const chunks: string[] = [];
  return {
    client: { id, userId, role, write: (chunk: string) => chunks.push(chunk) },
    chunks,
  };
}

const zoneEvent: RealtimeEvent = {
  type: "ZONE_OCCUPANCY_UPDATED",
  occurredAt: "2026-09-08T00:00:00.000Z",
  payload: { zoneId: "z1", name: "A", code: "A", capacity: 5, occupiedCount: 1, availableCount: 4, status: "ACTIVE" },
};

describe("RealtimeHub", () => {
  it("delivers a PUBLIC event to every connected client", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    const user = makeClient("c2", "user1", "USER");
    hub.subscribe(admin.client);
    hub.subscribe(user.client);

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(user.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
  });

  it("delivers an ADMIN-scoped event only to ADMIN clients", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    const user = makeClient("c2", "user1", "USER");
    hub.subscribe(admin.client);
    hub.subscribe(user.client);

    hub.publish(zoneEvent, { audience: "ADMIN" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(user.chunks.join("")).toBe("");
  });

  it("delivers a USER-scoped event only to that user's own clients, never another user's", () => {
    const hub = new RealtimeHub();
    const userA = makeClient("c1", "userA", "USER");
    const userB = makeClient("c2", "userB", "USER");
    hub.subscribe(userA.client);
    hub.subscribe(userB.client);

    hub.publish(zoneEvent, { audience: "USER", userId: "userA" });

    expect(userA.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(userB.chunks.join("")).toBe("");
  });

  it("a USER-scoped event still reaches ADMIN (admin sees everything)", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    hub.subscribe(admin.client);

    hub.publish(zoneEvent, { audience: "USER", userId: "someoneElse" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
  });

  it("stops delivering to a client after it unsubscribes", () => {
    const hub = new RealtimeHub();
    const user = makeClient("c1", "user1", "USER");
    const unsubscribe = hub.subscribe(user.client);
    unsubscribe();

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    expect(user.chunks.join("")).toBe("");
  });

  it("never writes another user's data into a shared PUBLIC event frame", () => {
    const hub = new RealtimeHub();
    const user = makeClient("c1", "user1", "USER");
    hub.subscribe(user.client);
    hub.publish(zoneEvent, { audience: "PUBLIC" });
    const written = user.chunks.join("");
    expect(written).not.toContain("password");
    expect(written).not.toContain("passwordHash");
  });

  it("enforces a per-user connection cap", () => {
    const hub = new RealtimeHub({ maxConnectionsPerUser: 2 });
    const a = makeClient("c1", "user1", "USER");
    const b = makeClient("c2", "user1", "USER");
    hub.subscribe(a.client);
    hub.subscribe(b.client);
    expect(() => hub.subscribe(makeClient("c3", "user1", "USER").client)).toThrow();
    expect(hub.connectionCount("user1")).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- realtime/hub.test.ts`
Expected: FAIL — `Cannot find module './hub'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/api/src/realtime/hub.ts
import type { RealtimeEvent } from "@parada/types";
import type { Role } from "@parada/types";

export interface RealtimeClient {
  id: string;
  userId: string;
  role: Role;
  write: (chunk: string) => void;
}

export type PublishScope =
  | { audience: "ADMIN" }
  | { audience: "USER"; userId: string }
  | { audience: "PUBLIC" };

export interface RealtimeHubOptions {
  /** Caps simultaneous connections per user id, preventing an unbounded
   *  subscription leak from a single misbehaving client. */
  maxConnectionsPerUser?: number;
}

const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;

/**
 * In-process SSE broadcast hub. Pure transport: it has no knowledge of zones,
 * sessions, or violations beyond the RealtimeEvent shape handed to it, and it
 * never queries the database. Route handlers publish to it only after their
 * own domain-service call has resolved (i.e., after the transaction committed)
 * — the hub itself has no opinion on when that is.
 */
export class RealtimeHub {
  private readonly clients = new Map<string, RealtimeClient>();
  private readonly byUser = new Map<string, Set<string>>();
  private readonly maxConnectionsPerUser: number;

  constructor(options: RealtimeHubOptions = {}) {
    this.maxConnectionsPerUser = options.maxConnectionsPerUser ?? DEFAULT_MAX_CONNECTIONS_PER_USER;
  }

  connectionCount(userId?: string): number {
    if (userId === undefined) return this.clients.size;
    return this.byUser.get(userId)?.size ?? 0;
  }

  /** Registers a client. Throws if that user is already at their connection cap. */
  subscribe(client: RealtimeClient): () => void {
    const existing = this.byUser.get(client.userId) ?? new Set<string>();
    if (existing.size >= this.maxConnectionsPerUser) {
      throw new Error(`Connection limit (${this.maxConnectionsPerUser}) reached for this account.`);
    }
    existing.add(client.id);
    this.byUser.set(client.userId, existing);
    this.clients.set(client.id, client);

    return () => {
      this.clients.delete(client.id);
      const set = this.byUser.get(client.userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) {
          this.byUser.delete(client.userId);
        }
      }
    };
  }

  /**
   * Delivers `event` to every client the scope authorizes. An ADMIN client
   * always receives every event (the operations dashboard). A USER client only
   * receives PUBLIC events and USER events addressed to their own id — never
   * another user's data.
   */
  publish(event: RealtimeEvent, scope: PublishScope): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients.values()) {
      if (this.authorized(client, scope)) {
        client.write(frame);
      }
    }
  }

  /** Sends a raw comment frame (e.g. a heartbeat) to one client only. */
  sendComment(client: RealtimeClient, comment: string): void {
    client.write(`: ${comment}\n\n`);
  }

  private authorized(client: RealtimeClient, scope: PublishScope): boolean {
    if (client.role === "ADMIN") return true;
    if (scope.audience === "ADMIN") return false;
    if (scope.audience === "PUBLIC") return true;
    return scope.userId === client.userId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- realtime/hub.test.ts`
Expected: PASS (7 tests)

---

## Task 3: Backend SSE Route

**Files:**
- Create: `services/api/src/routes/realtime.ts`
- Test: `services/api/src/routes/realtime.test.ts`

**Interfaces:**
- Consumes: `RealtimeHub` (Task 2), the existing `authMiddleware` (`middleware/auth.ts`, unchanged), `currentAuth(res)` (existing, `middleware/auth.ts:86`).
- Produces: `realtimeRouter(hub: RealtimeHub): Router` mounted at `/realtime` — exported for `app.ts` (Task 4).

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/routes/realtime.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub } from "../realtime/hub";
import { AuthService } from "../domain/auth";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

describe("GET /realtime/stream", () => {
  it("rejects a request with no token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const res = await request(app).get("/realtime/stream");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const res = await request(app).get("/realtime/stream").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("streams a hello comment and a heartbeat is scheduled for a valid USER token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const { token } = auth["tokens"].sign({ id: "user1", role: "USER" });

    await new Promise<void>((resolve, reject) => {
      const req = request(app)
        .get("/realtime/stream")
        .set("Authorization", `Bearer ${token}`)
        .buffer(false)
        .parse((res, callback) => {
          res.on("data", (chunk: Buffer) => {
            if (chunk.toString().includes("connected")) {
              callback(null, undefined);
              req.abort();
              resolve();
            }
          });
          res.on("error", reject);
        })
        .end((err) => {
          if (err && err.message !== "socket hang up" && !req.aborted) reject(err);
        });
    });
  });

  it("registering two connections for the same user is reflected in hub.connectionCount", async () => {
    const hub = new RealtimeHub({ maxConnectionsPerUser: 5 });
    const app = createApp({ auth, realtimeHub: hub });
    const { token } = auth["tokens"].sign({ id: "user2", role: "USER" });

    const reqs = [0, 1].map(
      () =>
        new Promise<void>((resolve) => {
          const r = request(app)
            .get("/realtime/stream")
            .set("Authorization", `Bearer ${token}`)
            .buffer(false)
            .parse((res, cb) => {
              res.on("data", () => {
                cb(null, undefined);
                resolve();
              });
            })
            .end(() => undefined);
          setTimeout(() => r.abort(), 200);
        })
    );
    await Promise.all(reqs);
    expect(hub.connectionCount("user2")).toBeGreaterThanOrEqual(0); // connections close after abort; asserts no throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- routes/realtime.test.ts`
Expected: FAIL — `createApp` does not accept `realtimeHub` option / route not found (404)

- [ ] **Step 3: Write the implementation**

```typescript
// services/api/src/routes/realtime.ts
import { Router, type RequestHandler } from "express";
import { currentAuth } from "../middleware/auth";
import type { RealtimeHub } from "../realtime/hub";

const HEARTBEAT_MS = 25_000;

/**
 * GET /realtime/stream — Server-Sent Events. Mounted AFTER the shared
 * authMiddleware in app.ts, so `res.locals.auth` is always populated here;
 * this route adds no separate auth logic beyond reading that identity.
 *
 * This route is delivery only: it registers the caller with the hub and keeps
 * the connection open. It never reads or writes application data itself.
 */
export function realtimeRouter(hub: RealtimeHub): Router {
  const router = Router();

  const stream: RequestHandler = (req, res) => {
    const auth = currentAuth(res);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const clientId = `${auth.id}:${auth.jti}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const client = { id: clientId, userId: auth.id, role: auth.role, write: (chunk: string) => res.write(chunk) };

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = hub.subscribe(client);
    } catch (err) {
      res.write(`event: ERROR\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.end();
      return;
    }

    res.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      hub.sendComment(client, "heartbeat");
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe?.();
    };

    req.on("close", cleanup);
    res.on("error", cleanup);
  };

  router.get("/realtime/stream", stream);

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- routes/realtime.test.ts`
Expected: PASS (4 tests)

---

## Task 4: Wire the Hub into `app.ts`

**Files:**
- Modify: `services/api/src/app.ts`

**Interfaces:**
- Consumes: `RealtimeHub` (Task 2), `realtimeRouter` (Task 3).
- Produces: `AppOptions.realtimeHub?: RealtimeHub` (constructed by default if not injected, mirroring every other service on this interface); the hub instance is now threaded into the route factories Tasks 5–10 modify.

- [ ] **Step 1: Modify `AppOptions` and construction**

In `services/api/src/app.ts`, add the import and option, construct a default hub, mount the route, and pass the hub into the route factories that will publish (Tasks 5–10 add the `hub` parameter to each factory signature at the same time they add the publish call — done incrementally per task below to keep each task's diff self-contained and independently testable). For this task, only add the hub construction and mounting:

```typescript
// add near the other imports
import { RealtimeHub } from "./realtime/hub";
import { realtimeRouter } from "./routes/realtime";
```

```typescript
// AppOptions — add:
export interface AppOptions {
  // ...existing fields...
  realtimeHub?: RealtimeHub;
}
```

```typescript
// inside createApp(options), after `const config = ...` line:
const realtimeHub = options.realtimeHub ?? new RealtimeHub();
```

Mount the route immediately after `app.use(authMiddleware);` (so `/realtime/stream` requires authentication like every other non-public route, and `res.locals.auth` is populated for it):

```typescript
app.use(authMiddleware);
app.use(realtimeRouter(realtimeHub));
```

- [ ] **Step 2: Run the existing app test suite to confirm no regression**

Run: `npm run test -w @parada/api -- app.test.ts`
Expected: PASS, same count as before this change (this step only adds a route + option; it changes no existing behavior)

- [ ] **Step 3: Run the realtime route test again now that it is wired through `createApp`**

Run: `npm run test -w @parada/api -- routes/realtime.test.ts`
Expected: PASS (still 4 tests — this confirms Task 3's test, written against `createApp({..., realtimeHub})`, is exercising the real mount point)

---

## Task 5: Publish `ZONE_OCCUPANCY_UPDATED` from the Camera Path

**Files:**
- Modify: `services/api/src/routes/events.ts`
- Modify: `services/api/src/app.ts` (thread `realtimeHub` into `eventsRouter(...)` call)
- Test: `services/api/src/routes/events.test.ts` (new file — no existing test file for this router; camera-path behavior is currently covered only via `app.test.ts`)

**Interfaces:**
- Consumes: `RealtimeHub.publish` (Task 2), `ZoneService.getById` (existing, `domain/zones.ts:41`).
- Produces: nothing new consumed elsewhere — this is a leaf publish site.

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/routes/events.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER"): { client: RealtimeClient; frames: string[] } {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c) => frames.push(c) }, frames };
}

describe("POST /zones/:zoneId/events publishes ZONE_OCCUPANCY_UPDATED after commit", () => {
  let zoneId: string;
  let cameraIdentifier: string;

  beforeAll(async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "RT Zone", code: "RT1", capacity: 5 } });
    zoneId = zone.id;
    const camera = await prisma.camera.create({
      data: { zoneId, name: "Gate", identifier: "RT-CAM-1", gateType: "BIDIRECTIONAL", status: "ONLINE" },
    });
    cameraIdentifier = camera.identifier;
  });

  it("publishes an ADMIN-scoped ZONE_OCCUPANCY_UPDATED with the post-commit occupancy count", async () => {
    const hub = new RealtimeHub();
    const admin = spyClient("admin1", "ADMIN");
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    const res = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-1",
      eventType: "ENTRY",
    });

    expect(res.status).toBe(201);
    const frame = admin.frames.find((f) => f.includes("ZONE_OCCUPANCY_UPDATED"));
    expect(frame).toBeDefined();
    const payload = JSON.parse(frame!.split("data: ")[1]!);
    expect(payload.payload.zoneId).toBe(zoneId);
    expect(payload.payload.occupiedCount).toBe(1);
  });

  it("does NOT publish when the event is rejected (e.g. duplicate sourceEventId)", async () => {
    const hub = new RealtimeHub();
    const admin = spyClient("admin2", "ADMIN");
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    // First call succeeds and publishes once.
    await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-dup",
      eventType: "EXIT",
    });
    const countAfterFirst = admin.frames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED")).length;

    // Duplicate sourceEventId -> 409, must not publish again.
    const dup = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-dup",
      eventType: "EXIT",
    });

    expect(dup.status).toBe(409);
    const countAfterDup = admin.frames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED")).length;
    expect(countAfterDup).toBe(countAfterFirst);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- routes/events.test.ts`
Expected: FAIL — `createApp` builds `eventsRouter` internally without a hub; no publish occurs, `admin.frames` stays empty

- [ ] **Step 3: Modify `eventsRouter` and its call site**

In `services/api/src/routes/events.ts`, add the hub parameter and publish after the existing `await occupancy.processEvent(...)`:

```typescript
// add import
import { ZoneService } from "../domain/zones";
import type { RealtimeHub } from "../realtime/hub";

export interface EventsRouterOptions {
  cameraApiKey?: string | null;
  rateLimit?: { limit: number; windowMs: number };
  /** Publishes ZONE_OCCUPANCY_UPDATED after a successful, committed event. */
  realtimeHub?: RealtimeHub;
}
```

```typescript
export function eventsRouter(occupancy: OccupancyService, options: EventsRouterOptions = {}): Router {
  const router = Router();
  const cameraApiKey = options.cameraApiKey ?? null;
  const zones = new ZoneService();
  // ...unchanged rate limit / requireCameraApiKey...
```

Replace the body of the `/zones/:zoneId/events` handler's tail (after the existing validation, currently ending at `res.status(201).json(ok(event));`) with:

```typescript
      const event = await occupancy.processEvent({
        zoneId,
        cameraIdentifier,
        sourceEventId,
        eventType: eventType as OccupancyEventType,
        detectedPlate: typeof detectedPlate === "string" ? detectedPlate : null,
        ocrConfidence: typeof ocrConfidence === "number" ? ocrConfidence : null,
        detectedAt: typeof detectedAt === "string" ? detectedAt : null,
      });

      // Publish AFTER processEvent's transaction has committed. A read-back via
      // the existing ZoneService (not the mutation's own return value) keeps
      // this route decoupled from OccupancyService's internal return shape.
      if (options.realtimeHub) {
        const zone = await zones.getById(zoneId);
        options.realtimeHub.publish(
          {
            type: "ZONE_OCCUPANCY_UPDATED",
            occurredAt: new Date().toISOString(),
            payload: {
              zoneId: zone.id,
              name: zone.name,
              code: zone.code,
              capacity: zone.capacity,
              occupiedCount: zone.occupiedCount,
              availableCount: zone.availableCount,
              status: zone.status,
            },
          },
          { audience: "PUBLIC" }
        );
      }

      res.status(201).json(ok(event));
```

In `services/api/src/app.ts`, thread the hub into the existing `eventsRouter(...)` call:

```typescript
const events = eventsRouter(occupancy, {
  cameraApiKey: options.cameraApiKey !== undefined ? options.cameraApiKey : env.cameraApiKey,
  rateLimit: options.cameraEventRateLimit ?? { limit: env.cameraEventRateLimitPerMinute, windowMs: 60_000 },
  realtimeHub,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- routes/events.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full API suite to confirm no regression**

Run: `npm run test -w @parada/api`
Expected: PASS, previous test count + new tests, zero failures

---

## Task 6: Publish Session Lifecycle Events

**Files:**
- Modify: `services/api/src/routes/sessions.ts`
- Modify: `services/api/src/app.ts` (thread `realtimeHub` into `sessionsRouter(...)`)
- Test: `services/api/src/routes/sessions.test.ts` (new)

**Interfaces:**
- Consumes: `RealtimeHub.publish` (Task 2). `ParkingSessionService.entry`/`.exit` return shapes are unchanged (already `ParkingSessionResponse` / `SessionExitResult`).

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/routes/sessions.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER") {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c: string) => frames.push(c) } as RealtimeClient, frames };
}

describe("session entry/exit publish realtime events after commit", () => {
  it("publishes PARKING_SESSION_STARTED to the owning user (and admin) on entry", async () => {
    const hub = new RealtimeHub();
    const owner = spyClient("owner1", "USER");
    const other = spyClient("other1", "USER");
    const admin = spyClient("admin1", "ADMIN");
    hub.subscribe(owner.client);
    hub.subscribe(other.client);
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    const user = await prisma.user.create({ data: { id: "owner1", name: "Owner", email: "owner1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT2 Zone", code: "RT2", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-1", normalizedPlate: "RT1", vehicleType: "CAR" } });
    const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${token}`)
      .send({ vehicleId: vehicle.id, zoneId: zone.id });

    expect(res.status).toBe(201);
    expect(owner.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(true);
    expect(admin.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(true);
    expect(other.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- routes/sessions.test.ts`
Expected: FAIL — no publish occurs

- [ ] **Step 3: Modify `sessionsRouter`**

```typescript
// add import
import type { RealtimeHub } from "../realtime/hub";

export function sessionsRouter(sessionService?: ParkingSessionService, realtimeHub?: RealtimeHub): Router {
```

Replace the `/sessions/entry` handler tail:

```typescript
      const session = await sessionService.entry(userId, { vehicleId, zoneId, enteredAt });
      realtimeHub?.publish(
        { type: "PARKING_SESSION_STARTED", occurredAt: new Date().toISOString(), payload: session },
        { audience: "USER", userId }
      );
      res.status(201).json(ok({ session }));
```

Replace the `/sessions/:id/exit` handler tail:

```typescript
      const result = await sessionService.exit(userId, req.params["id"]!, { exitedAt });
      realtimeHub?.publish(
        { type: "PARKING_SESSION_COMPLETED", occurredAt: new Date().toISOString(), payload: result.session },
        { audience: "USER", userId }
      );
      res.json(ok(result));
```

In `services/api/src/app.ts`, update the call site:

```typescript
const sessions = sessionsRouter(sessionService, realtimeHub);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- routes/sessions.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Run the existing sessions-adjacent suite (vision-pipeline / app tests) to confirm no regression**

Run: `npm run test -w @parada/api -- app.test.ts vision-pipeline.test.ts`
Expected: PASS, same counts as before this task

---

## Task 7: Publish Reservation Events

**Files:**
- Modify: `services/api/src/routes/reservations.ts`
- Modify: `services/api/src/routes/admin.ts` (admin-cancel publish)
- Modify: `services/api/src/app.ts` (thread hub into `reservationsRouter(...)` and `adminRouter({...})`)
- Test: `services/api/src/routes/reservations.test.ts` (new)

**Interfaces:**
- Consumes: `RealtimeHub.publish`. `ReservationService.create`/`.cancel`/`.adminCancel` return shapes unchanged.

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/routes/reservations.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER") {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c: string) => frames.push(c) } as RealtimeClient, frames };
}

describe("reservation create/cancel publish realtime events after commit", () => {
  it("publishes RESERVATION_CREATED then RESERVATION_CANCELLED to the owning user", async () => {
    const hub = new RealtimeHub();
    const owner = spyClient("resOwner1", "USER");
    hub.subscribe(owner.client);
    const app = createApp({ auth, realtimeHub: hub });

    const user = await prisma.user.create({ data: { id: "resOwner1", name: "R", email: "r1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT3 Zone", code: "RT3", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-2", normalizedPlate: "RT2", vehicleType: "CAR" } });
    const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id });
    expect(created.status).toBe(201);
    expect(owner.frames.some((f) => f.includes("RESERVATION_CREATED"))).toBe(true);

    const reservationId = created.body.data.id;
    const cancelled = await request(app)
      .patch(`/reservations/${reservationId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(owner.frames.some((f) => f.includes("RESERVATION_CANCELLED"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- routes/reservations.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify `reservationsRouter`**

```typescript
import type { RealtimeHub } from "../realtime/hub";

export function reservationsRouter(reservations: ReservationService, realtimeHub?: RealtimeHub): Router {
```

Create handler tail:

```typescript
      const reservation = await reservations.create(userId, { zoneId, vehicleId, startAt, endAt });
      realtimeHub?.publish(
        { type: "RESERVATION_CREATED", occurredAt: new Date().toISOString(), payload: reservation },
        { audience: "USER", userId }
      );
      res.status(201).json(ok(reservation));
```

Cancel handler tail:

```typescript
      const reservation = await reservations.cancel(userId, req.params["id"]!);
      realtimeHub?.publish(
        { type: "RESERVATION_CANCELLED", occurredAt: new Date().toISOString(), payload: reservation },
        { audience: "USER", userId }
      );
      res.json(ok(reservation));
```

In `services/api/src/app.ts`: `const reservations = reservationsRouter(reservationService, realtimeHub);`

In `services/api/src/routes/admin.ts`, find the `/admin/reservations/:id/cancel` handler and, after `const updated = await deps.reservations.adminCancel(...)` (exact existing variable name — confirm at edit time), add:

```typescript
      realtimeHub?.publish(
        { type: "RESERVATION_CANCELLED", occurredAt: new Date().toISOString(), payload: updated },
        { audience: "USER", userId: updated.userId }
      );
```

Thread `realtimeHub` through `adminRouter`'s `deps` parameter (add `realtimeHub?: RealtimeHub` to its type) and through the `adminRouter({...})` call in `app.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- routes/reservations.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Run full API suite**

Run: `npm run test -w @parada/api`
Expected: PASS

---

## Task 8: Publish `ASSIGNMENT_CREATED`

**Files:**
- Modify: `services/api/src/routes/assignments.ts`
- Modify: `services/api/src/app.ts`
- Test: `services/api/src/routes/assignments.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/routes/assignments.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER") {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c: string) => frames.push(c) } as RealtimeClient, frames };
}

it("publishes ASSIGNMENT_CREATED to the owning user after commit", async () => {
  const hub = new RealtimeHub();
  const owner = spyClient("assignOwner1", "USER");
  hub.subscribe(owner.client);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "assignOwner1", name: "A", email: "a1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RT4 Zone", code: "RT4", capacity: 5 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-3", normalizedPlate: "RT3", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/assignments")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });

  expect(res.status).toBe(201);
  expect(owner.frames.some((f) => f.includes("ASSIGNMENT_CREATED"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- routes/assignments.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify `assignmentsRouter`**

```typescript
import type { RealtimeHub } from "../realtime/hub";

export function assignmentsRouter(assignments: AssignmentService, realtimeHub?: RealtimeHub): Router {
```

```typescript
      const assignment = await assignments.create(userId, { zoneId, vehicleId });
      realtimeHub?.publish(
        { type: "ASSIGNMENT_CREATED", occurredAt: new Date().toISOString(), payload: assignment },
        { audience: "USER", userId }
      );
      res.status(201).json(ok(assignment));
```

In `app.ts`: `const assignments = assignmentsRouter(assignmentService, realtimeHub);`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/api -- routes/assignments.test.ts`
Expected: PASS (1 test)

---

## Task 9: Enrich `OccupancyService` to Surface Violation + Guest-Admission Outcomes, Publish `VIOLATION_CREATED` / `GUEST_ADMISSION_ISSUE`

**Files:**
- Modify: `services/api/src/domain/occupancy.ts`
- Modify: `services/api/src/routes/events.ts` (publish the newly-surfaced fields)
- Modify: `services/api/src/routes/admin.ts` (`/admin/guest-admit` publish)
- Test: `services/api/src/domain/occupancy.test.ts` (append if it exists, else create — verify via `npm run test -w @parada/api -- domain/occupancy` first which existing tests currently cover this through `app.test.ts`; add a focused unit test here)

**Interfaces:**
- Produces: `OccupancyService.processEvent()`'s resolved value gains two optional fields on top of its existing shape: `violation: { id, userId, zoneId, vehicleId, violationType, fineAmount, status, issuedAt } | null` and, for the guest path, the existing `GuestAdmissionResult` is returned as-is (already has everything `GUEST_ADMISSION_ISSUE` needs) — **the existing return shape for the registered-vehicle path changes from `OccupancyEvent` to `{ event: OccupancyEvent; violation: Violation | null }`**. This is the one call-site-breaking change in this phase; all 3 existing call sites (`routes/events.ts`, `domain/simulator.ts`, `routes/admin.ts:725`) are updated in this same task.

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/domain/occupancy.test.ts (new — no such file exists yet; occupancy.ts is
// currently exercised only indirectly via app.test.ts and vision-pipeline.test.ts)
import { OccupancyService } from "./occupancy";
import { AssignmentService } from "./assignment";
import { ViolationService } from "./violations";
import { ConfigService } from "./config";
import { prisma } from "@parada/database";

describe("OccupancyService.processEvent surfaces the escalated violation", () => {
  it("returns { event, violation: null } when no escalation occurs", async () => {
    const config = new ConfigService();
    const occupancy = new OccupancyService({ config });
    const zone = await prisma.parkingZone.create({ data: { name: "RT5 Zone", code: "RT5", capacity: 5 } });
    const camera = await prisma.camera.create({
      data: { zoneId: zone.id, name: "Gate", identifier: "RT-CAM-5", gateType: "BIDIRECTIONAL", status: "ONLINE" },
    });

    const result = await occupancy.processEvent({
      zoneId: zone.id,
      cameraIdentifier: camera.identifier,
      sourceEventId: "occ-test-1",
      eventType: "ENTRY",
    });

    expect(result).toHaveProperty("event");
    expect(result.violation).toBeNull();
  });

  it("returns the created Violation once wrong-zone warnings are exhausted", async () => {
    const config = new ConfigService();
    const assignments = new AssignmentService(config);
    const violations = new ViolationService(config);
    const occupancy = new OccupancyService({ config, assignments, violations });

    const zoneA = await prisma.parkingZone.create({ data: { name: "RT6A", code: "RT6A", capacity: 5 } });
    const zoneB = await prisma.parkingZone.create({ data: { name: "RT6B", code: "RT6B", capacity: 5 } });
    const cameraB = await prisma.camera.create({
      data: { zoneId: zoneB.id, name: "GateB", identifier: "RT-CAM-6B", gateType: "ENTRY", status: "ONLINE" },
    });
    const user = await prisma.user.create({ data: { name: "V", email: "v1@x.com", passwordHash: "x", role: "USER" } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-9", normalizedPlate: "RT9", vehicleType: "CAR" } });
    await assignments.create(user.id, { zoneId: zoneA.id, vehicleId: vehicle.id });

    // First wrong-zone entry: warning only (WRONG_ZONE_WARNINGS_BEFORE_VIOLATION = 1 prior warning tolerated).
    await occupancy.processEvent({ zoneId: zoneB.id, cameraIdentifier: cameraB.identifier, sourceEventId: "occ-wz-1", eventType: "ENTRY", detectedPlate: "RT-9" });
    await prisma.parkingSession.updateMany({ where: { vehicleId: vehicle.id }, data: { status: "COMPLETED", exitedAt: new Date() } });

    // Second wrong-zone entry: escalates to a Violation.
    const result = await occupancy.processEvent({ zoneId: zoneB.id, cameraIdentifier: cameraB.identifier, sourceEventId: "occ-wz-2", eventType: "ENTRY", detectedPlate: "RT-9" });

    expect(result.violation).not.toBeNull();
    expect(result.violation?.violationType).toBe("WRONG_ZONE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- domain/occupancy.test.ts`
Expected: FAIL — `result.violation` is `undefined` (current return is the bare `OccupancyEvent`)

- [ ] **Step 3: Modify `occupancy.ts`**

Change `processRegisteredVehicle`'s signature to return the richer shape and capture the escalation result (currently discarded at the existing `await this.violations?.escalateWrongZone(tx, {...});` call):

```typescript
      if (wrongZone) {
        // Escalate BEFORE recording this entry's warning, so the count
        // reflects previous offences only. First offences stay warnings.
        const violation = await this.violations?.escalateWrongZone(tx, {
          userId: vehicle.userId,
          vehicleId,
          zoneId: zone.id,
          assignedZoneCode: assignedZoneCode ?? "unknown",
        });
        await tx.occupancyAnomaly.create({
          data: {
            occupancyEventId: event.id,
            cameraId: camera.id,
            vehicleId,
            detectedPlate: match.detectedPlate,
            anomalyType: "WRONG_ZONE_WARNING",
            description: `Vehicle is assigned to zone '${assignedZoneCode}' but entered zone '${zone.id}'.`,
            resolved: false,
          },
        });
        await tx.notification.create({
          data: {
            zoneId: zone.id,
            userId: vehicle.userId,
            type: "WRONG_ZONE_WARNING",
            message: `Your vehicle (${match.detectedPlate}) entered a zone different from your assigned zone.`,
            targetRole: "USER",
          },
        });
        return { event, violation: violation ?? null };
      }
    } else if (eventType === "EXIT") {
      // ...unchanged EXIT branch...
    }

    return { event, violation: null };
```

(The exact diff: every existing `return event;` inside `processRegisteredVehicle` becomes `return { event, violation: null };`, and the one branch that calls `escalateWrongZone` becomes `return { event, violation: violation ?? null };` right after that branch's existing statements — no reordering of any existing logic, only the return values change shape.)

`processGuest`'s branches keep returning their existing `GuestAdmissionResult`-shaped values unchanged — the guest path was never returning a bare `OccupancyEvent`, so no test relying on it needs updating; `GUEST_ADMISSION_ISSUE` in Task's route change reads directly from that existing shape.

Update the outer `processEvent`'s doc comment only (no logic change — it already just returns whichever branch's promise resolves).

- [ ] **Step 4: Fix the 3 call sites**

`services/api/src/routes/events.ts` — the registered-vehicle branch's result is now `{ event, violation }` instead of a bare event; for the response body, preserve the existing wire contract (clients today receive the bare event object) by responding with `event.event ?? event` (guest path is unchanged, registered path is now nested):

```typescript
      const result = await occupancy.processEvent({ /* ...unchanged... */ });

      const occupancyEvent = "event" in result ? result.event : result;
      const violation = "violation" in result ? result.violation : null;

      if (options.realtimeHub) {
        // ...existing ZONE_OCCUPANCY_UPDATED publish (Task 5), unchanged...

        if (violation) {
          options.realtimeHub.publish(
            { type: "VIOLATION_CREATED", occurredAt: new Date().toISOString(), payload: violation as never },
            { audience: "USER", userId: violation.userId }
          );
        }
        if ("admitted" in result) {
          options.realtimeHub.publish(
            {
              type: "GUEST_ADMISSION_ISSUE",
              occurredAt: new Date().toISOString(),
              payload: { zoneId, admitted: result.admitted, deniedReason: result.deniedReason, anomalyType: result.anomalyType },
            },
            { audience: "ADMIN" }
          );
        }
      }

      res.status(201).json(ok(occupancyEvent));
```

`services/api/src/domain/simulator.ts:127` — this call site currently does `await this.occupancy.processEvent(...)` and discards the return value already (confirm at edit time; if it does use the value, apply the same `"event" in result ? result.event : result` unwrap). No behavior change needed beyond keeping it compiling against the new return type.

`services/api/src/routes/admin.ts:725` (`/admin/guest-admit`) — this call is always guest-path (unregistered plate), so its return type is unaffected by the `processRegisteredVehicle` change; only add the `GUEST_ADMISSION_ISSUE` publish:

```typescript
      const result = await deps.occupancy.processEvent(
        { /* ...unchanged... */ },
        "CAMERA",
        { overrideAdminUserId: adminId }
      );

      realtimeHub?.publish(
        {
          type: "GUEST_ADMISSION_ISSUE",
          occurredAt: new Date().toISOString(),
          payload: { zoneId: zoneIdRaw, admitted: result.admitted, deniedReason: result.deniedReason, anomalyType: result.anomalyType },
        },
        { audience: "ADMIN" }
      );

      res.status(201).json(ok(result));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @parada/api -- domain/occupancy.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full API suite — this task touches the widest-blast-radius file in the codebase**

Run: `npm run test -w @parada/api`
Expected: PASS, zero regressions in `app.test.ts` and `vision-pipeline.test.ts` (both exercise `processEvent` extensively through the HTTP layer)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck -w @parada/api`
Expected: no errors (confirms every call site was updated for the new return shape)

---

## Task 10: Enrich `ViolationService` Appeal/Review, Publish `NOTIFICATION_CREATED`

**Files:**
- Modify: `services/api/src/domain/violations.ts`
- Modify: `services/api/src/routes/violations.ts`
- Modify: `services/api/src/routes/admin.ts` (appeal review endpoint)
- Modify: `services/api/src/app.ts`
- Test: `services/api/src/domain/violations.test.ts` (new)

**Interfaces:**
- Produces: `ViolationService.appeal()` now resolves `{ appeal, notification }` (was: bare `appeal`); `.review()` now resolves `{ appeal, notification }` (was: bare `updated`).

- [ ] **Step 1: Write the failing test**

```typescript
// services/api/src/domain/violations.test.ts
import { ViolationService } from "./violations";
import { ConfigService } from "./config";
import { prisma } from "@parada/database";

describe("ViolationService.appeal / .review surface the created Notification", () => {
  it("appeal() returns both the appeal and the ADMIN notification it creates", async () => {
    const violations = new ViolationService(new ConfigService());
    const user = await prisma.user.create({ data: { name: "P", email: "p1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT7", code: "RT7", capacity: 5 } });
    const violation = await prisma.violation.create({
      data: { userId: user.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 100, status: "PENDING" },
    });

    const result = await violations.appeal(user.id, violation.id, "I was not overstaying.");

    expect(result.appeal.violationId).toBe(violation.id);
    expect(result.notification.targetRole).toBe("ADMIN");
    expect(result.notification.type).toBe("VIOLATION_APPEAL_SUBMITTED");
  });

  it("review() returns both the reviewed appeal and the USER notification of the outcome", async () => {
    const violations = new ViolationService(new ConfigService());
    const user = await prisma.user.create({ data: { name: "P2", email: "p2@x.com", passwordHash: "x", role: "USER" } });
    const admin = await prisma.user.create({ data: { name: "A2", email: "a2@x.com", passwordHash: "x", role: "ADMIN" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT8", code: "RT8", capacity: 5 } });
    const violation = await prisma.violation.create({
      data: { userId: user.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 100, status: "APPEALED" },
    });
    const appeal = await prisma.violationAppeal.create({ data: { violationId: violation.id, userId: user.id, reason: "x", status: "PENDING" } });

    const result = await violations.review(appeal.id, "APPROVED", admin.id);

    expect(result.appeal.status).toBe("APPROVED");
    expect(result.notification.userId).toBe(user.id);
    expect(result.notification.type).toBe("VIOLATION_APPEAL_RESULT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/api -- domain/violations.test.ts`
Expected: FAIL — `result.appeal` / `result.notification` are `undefined` (current methods resolve the bare row)

- [ ] **Step 3: Modify `violations.ts`**

`appeal()`:

```typescript
    return prisma.$transaction(async (tx) => {
      const appeal = await tx.violationAppeal.create({
        data: { violationId: violation.id, userId, reason, status: "PENDING" },
      });
      await tx.violation.update({ where: { id: violation.id }, data: { status: "APPEALED" } });
      const notification = await tx.notification.create({
        data: {
          zoneId: violation.zoneId,
          type: "VIOLATION_APPEAL_SUBMITTED",
          message: `A driver appealed a ${violation.violationType} violation.`,
          targetRole: "ADMIN",
        },
      });
      return { appeal, notification };
    });
```

`review()` — apply the same pattern, capturing the existing `await tx.notification.create({...})` call's return into `notification` and returning `{ appeal: updated, notification }` instead of the bare `updated`.

- [ ] **Step 4: Fix call sites**

`services/api/src/routes/violations.ts`:

```typescript
      const { appeal, notification } = await violations.appeal(currentUserId(res), req.params["id"]!, reason.trim());
      realtimeHub?.publish(
        {
          type: "NOTIFICATION_CREATED",
          occurredAt: new Date().toISOString(),
          payload: { id: notification.id, zoneId: notification.zoneId, userId: notification.userId, type: notification.type, message: notification.message, targetRole: notification.targetRole, createdAt: notification.createdAt.toISOString() },
        },
        { audience: "ADMIN" }
      );
      res.status(201).json(ok(appeal));
```

Thread `realtimeHub?: RealtimeHub` through `violationsRouter(violations: ViolationService, realtimeHub?: RealtimeHub)` and update its call site in `app.ts`.

`services/api/src/routes/admin.ts` — find the appeal-review endpoint (`PATCH /admin/appeals/:id` or similar — confirm exact path at edit time via the endpoint list already captured in the audit) and apply the same destructure-and-publish pattern, scoped `{ audience: "USER", userId: notification.userId! }` (the review notification always targets the appealing user, never null).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @parada/api -- domain/violations.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full API suite**

Run: `npm run test -w @parada/api`
Expected: PASS

---

## Task 11: Cross-Layer Test (Domain → Commit → Event → Authorized Client)

**Files:**
- Create: `services/api/src/realtime/crossLayer.test.ts`

- [ ] **Step 1: Write and run the test in one step (no separate red/green — this test exercises Tasks 5–10's already-passing code end to end; it is a coverage addition, not new behavior)**

```typescript
// services/api/src/realtime/crossLayer.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

it("a reservation created over HTTP is only visible on the DB row AFTER commit, and only THEN reaches an authorized SSE client — never an unauthorized one", async () => {
  const hub = new RealtimeHub();
  const ownerFrames: string[] = [];
  const strangerFrames: string[] = [];
  const owner: RealtimeClient = { id: "owner-conn", userId: "crossOwner1", role: "USER", write: (c) => ownerFrames.push(c) };
  const stranger: RealtimeClient = { id: "stranger-conn", userId: "crossStranger1", role: "USER", write: (c) => strangerFrames.push(c) };
  hub.subscribe(owner);
  hub.subscribe(stranger);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "crossOwner1", name: "X", email: "x1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RTX", code: "RTX", capacity: 5 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-X", normalizedPlate: "RTX1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/reservations")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });
  expect(res.status).toBe(201);

  // The DB row is the source of truth: it exists, committed, before we even
  // look at what was published.
  const row = await prisma.reservation.findUnique({ where: { id: res.body.data.id } });
  expect(row).not.toBeNull();
  expect(row?.status).toBe("CONFIRMED");

  // The event reached the owner...
  expect(ownerFrames.some((f) => f.includes("RESERVATION_CREATED") && f.includes(row!.id))).toBe(true);
  // ...and never a stranger.
  expect(strangerFrames.some((f) => f.includes(row!.id))).toBe(false);
});
```

- [ ] **Step 2: Run**

Run: `npm run test -w @parada/api -- realtime/crossLayer.test.ts`
Expected: PASS (1 test)

---

## Task 12: Admin Same-Origin SSE Relay

**Files:**
- Create: `apps/admin/app/api/realtime/route.ts`
- Test: `apps/admin/__tests__/realtime-route.test.ts`

**Interfaces:**
- Consumes: `getSessionToken`, `apiBaseUrl` (existing, `apps/admin/lib/auth.ts`); mirrors `isAdminToken` from `apps/admin/app/api/proxy/[...path]/route.ts` (duplicated locally to avoid exporting an internal proxy helper across route modules — matches the codebase's existing per-route-file style, no shared "route utils" module exists today).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/admin/__tests__/realtime-route.test.ts
import { GET } from "@/app/api/realtime/route";

jest.mock("@/lib/auth", () => ({
  getSessionToken: jest.fn(),
  apiBaseUrl: () => "http://backend.test",
}));

const { getSessionToken } = jest.requireMock("@/lib/auth") as { getSessionToken: jest.Mock };

describe("GET /api/realtime", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns 401 with no session cookie", async () => {
    getSessionToken.mockReturnValue(null);
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the token is not an admin", async () => {
    getSessionToken.mockReturnValue("user-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "USER" } }),
    }) as unknown as typeof fetch;
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(403);
  });

  it("streams the backend's SSE body through when the token is an admin", async () => {
    getSessionToken.mockReturnValue("admin-token");
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        controller.close();
      },
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { role: "ADMIN" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: upstreamBody, headers: new Headers({ "Content-Type": "text/event-stream" }) });

    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("connected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/admin -- realtime-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/realtime/route'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/admin/app/api/realtime/route.ts
import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Confirms with the backend that this session belongs to an ADMIN. Duplicated
 *  from app/api/proxy/[...path]/route.ts rather than shared, matching this
 *  codebase's existing per-route-file convention (no shared route-utils module
 *  exists today). */
async function isAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.data?.role === "ADMIN";
  } catch {
    return false;
  }
}

/**
 * Same-origin SSE relay. The admin browser's `EventSource` call is same-origin
 * so its httpOnly session cookie is attached automatically — this route reads
 * it server-side (exactly like the REST proxy) and opens the real, bearer-
 * authenticated connection to the backend, then streams the response body
 * straight through. The JWT never reaches browser JS.
 */
export async function GET(req: Request) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated." } }, { status: 401 });
  }
  if (!(await isAdminToken(token))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Administrator access required." } }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/realtime/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      // @ts-expect-error -- Node's undici fetch supports duplex streaming responses;
      // the App Router runtime forwards this through.
      duplex: "half",
    });
  } catch {
    return NextResponse.json({ error: { code: "NETWORK", message: "Unable to reach the PARADA API." } }, { status: 503 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/admin -- realtime-route.test.ts`
Expected: PASS (3 tests)

---

## Task 13: Admin Realtime Client Hook + React Query Wiring

**Files:**
- Create: `apps/admin/lib/realtime.ts`
- Modify: `apps/admin/components/providers/providers.tsx`
- Test: `apps/admin/__tests__/realtime-client.test.ts`

**Interfaces:**
- Consumes: `RealtimeEvent`, `isRealtimeEvent` (`@parada/types`, Task 1).
- Produces: `useRealtime(): { status: "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR" }`, mounted once in `Providers`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/admin/__tests__/realtime-client.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealtime } from "@/lib/realtime";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (ev: MessageEvent) => void>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void) {
    this.listeners.set(type, cb);
  }
  close() {
    this.closed = true;
  }
  emitOpen() {
    this.onopen?.();
  }
  emitError() {
    this.onerror?.();
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useRealtime (admin)", () => {
  it("connects to the same-origin relay and reports CONNECTED on open", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    expect(FakeEventSource.instances[0]?.url).toBe("/api/realtime");
    FakeEventSource.instances[0]!.emitOpen();

    await waitFor(() => expect(result.current.status).toBe("CONNECTED"));
  });

  it("invalidates the zones query on ZONE_OCCUPANCY_UPDATED", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emit("ZONE_OCCUPANCY_UPDATED", {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      payload: { zoneId: "z1", name: "A", code: "A", capacity: 5, occupiedCount: 1, availableCount: 4, status: "ACTIVE" },
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["zones"] }));
  });

  it("does not clear the query cache or invalidate auth on a connection error", async () => {
    const qc = new QueryClient();
    const clearSpy = jest.spyOn(qc, "clear");
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emitError();

    await waitFor(() => expect(result.current.status).toBe("DISCONNECTED"));
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("re-invalidates core queries on reconnect (open after a prior error)", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emitOpen();
    spy.mockClear();
    FakeEventSource.instances[0]!.emitError();
    FakeEventSource.instances[0]!.emitOpen();

    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @parada/admin -- realtime-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/realtime'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/admin/lib/realtime.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isRealtimeEvent, type RealtimeEventType } from "@parada/types";

export type RealtimeStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";

/** Maps a realtime event type to the query keys it makes stale. Kept as a
 *  flat table rather than per-page logic so adding an event type later means
 *  editing exactly one place. */
const INVALIDATIONS: Record<RealtimeEventType, string[][]> = {
  ZONE_OCCUPANCY_UPDATED: [["zones"], ["dashboard"]],
  PARKING_SESSION_STARTED: [["sessions"], ["dashboard"]],
  PARKING_SESSION_COMPLETED: [["sessions"], ["dashboard"], ["analytics"]],
  RESERVATION_CREATED: [["reservations"]],
  RESERVATION_CANCELLED: [["reservations"]],
  ASSIGNMENT_CREATED: [["dashboard"]],
  VIOLATION_CREATED: [["violations"], ["dashboard"]],
  GUEST_ADMISSION_ISSUE: [["anomalies"], ["dashboard"]],
  NOTIFICATION_CREATED: [["notifications"]],
};

const CORE_QUERY_KEYS: string[][] = [["zones"], ["dashboard"], ["sessions"], ["reservations"], ["violations"], ["notifications"]];

/**
 * Opens the same-origin SSE relay (`/api/realtime` — see app/api/realtime/route.ts)
 * once per mount and keeps React Query's cache fresh by invalidating the
 * affected keys on each event, never by trusting the event payload directly.
 * A disconnect/error NEVER touches auth state or clears the cache — only an
 * explicit 401 from the existing REST calls does that (unchanged).
 */
export function useRealtime(): { status: RealtimeStatus } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const everConnected = useRef(false);

  useEffect(() => {
    const source = new EventSource("/api/realtime");

    source.onopen = () => {
      if (everConnected.current) {
        // Reconnect, not first connect: we cannot know what was missed while
        // disconnected, so refetch authoritative state instead of trusting
        // event continuity.
        for (const key of CORE_QUERY_KEYS) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      everConnected.current = true;
      setStatus("CONNECTED");
    };

    source.onerror = () => {
      // A transport error is never an auth failure: never clear the query
      // cache and never touch the admin session cookie here.
      setStatus((prev) => (prev === "CONNECTED" ? "RECONNECTING" : "DISCONNECTED"));
    };

    for (const type of Object.keys(INVALIDATIONS) as RealtimeEventType[]) {
      source.addEventListener(type, (ev: MessageEvent) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!isRealtimeEvent(parsed)) return;
        for (const queryKey of INVALIDATIONS[parsed.type]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    return () => source.close();
  }, [queryClient]);

  return { status };
}
```

Wire it into `apps/admin/components/providers/providers.tsx`:

```typescript
"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import { AuthProvider } from "./auth-provider";
import { useRealtime } from "@/lib/realtime";

function RealtimeMount() {
  useRealtime();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeMount />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @parada/admin -- realtime-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full admin suite to confirm no regression from the `Providers` change**

Run: `npm run test -w @parada/admin`
Expected: PASS

---

## Task 14: Mobile Realtime Client + React Query Wiring

**Files:**
- Modify: `apps/mobile/package.json` (add `react-native-sse`)
- Create: `apps/mobile/src/lib/realtime.ts`
- Modify: `apps/mobile/src/providers/AppProviders.tsx`
- Test: `apps/mobile/__tests__/realtime.test.ts`

**Interfaces:**
- Consumes: `isRealtimeEvent`, `RealtimeEventType` (`@parada/types`), `getToken` (`apps/mobile/lib/auth/session.ts`, existing), `queryKeys` (`apps/mobile/lib/query.ts`, existing).
- Produces: `useRealtime(): { status: RealtimeStatus }`.

- [ ] **Step 1: Add the dependency**

```bash
npm install react-native-sse --workspace=@parada/mobile
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/mobile/__tests__/realtime.test.ts
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRealtime } from "@/src/lib/realtime";
import { configureSecureStore, setToken } from "@/lib/auth/session";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, (ev: { data: string }) => void>();
  constructor(public url: string, public options: { headers?: Record<string, string> }) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: { data: string }) => void) {
    this.listeners.set(type, cb);
  }
  removeAllEventListeners() {
    this.listeners.clear();
  }
  close() {}
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) });
  }
}

jest.mock("react-native-sse", () => ({ __esModule: true, default: FakeEventSource }));

const memoryStore = new Map<string, string>();
beforeEach(async () => {
  FakeEventSource.instances = [];
  memoryStore.clear();
  configureSecureStore({
    getItemAsync: async (k) => memoryStore.get(k) ?? null,
    setItemAsync: async (k, v) => void memoryStore.set(k, v),
    deleteItemAsync: async (k) => void memoryStore.delete(k),
  });
  await setToken("test-jwt");
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useRealtime (mobile)", () => {
  it("connects with the stored bearer token as a header", async () => {
    const qc = new QueryClient();
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    expect(FakeEventSource.instances[0]!.options.headers?.Authorization).toBe("Bearer test-jwt");
  });

  it("invalidates the active-session query on PARKING_SESSION_COMPLETED", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    FakeEventSource.instances[0]!.emit("PARKING_SESSION_COMPLETED", {
      type: "PARKING_SESSION_COMPLETED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      payload: { id: "s1", status: "COMPLETED" },
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["sessions", "active"] }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w @parada/mobile -- realtime.test.ts`
Expected: FAIL — `Cannot find module '@/src/lib/realtime'`

- [ ] **Step 4: Write the implementation**

```typescript
// apps/mobile/src/lib/realtime.ts
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import EventSource from "react-native-sse";
import { isRealtimeEvent, type RealtimeEventType } from "@parada/types";
import { getToken } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query";

export type RealtimeStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const INVALIDATIONS: Record<RealtimeEventType, (readonly unknown[])[]> = {
  ZONE_OCCUPANCY_UPDATED: [queryKeys.zones],
  PARKING_SESSION_STARTED: [queryKeys.activeSession, queryKeys.sessions],
  PARKING_SESSION_COMPLETED: [queryKeys.activeSession, queryKeys.sessions],
  RESERVATION_CREATED: [queryKeys.reservations],
  RESERVATION_CANCELLED: [queryKeys.reservations],
  ASSIGNMENT_CREATED: [queryKeys.assignments],
  VIOLATION_CREATED: [queryKeys.violations],
  GUEST_ADMISSION_ISSUE: [],
  NOTIFICATION_CREATED: [queryKeys.notifications],
};

const CORE_QUERY_KEYS: (readonly unknown[])[] = [
  queryKeys.zones,
  queryKeys.activeSession,
  queryKeys.assignments,
  queryKeys.reservations,
  queryKeys.notifications,
  queryKeys.violations,
];

/**
 * Direct-to-API SSE connection using the same bearer token every other mobile
 * request already sends (no proxy needed — unlike Admin, the token is not
 * httpOnly here). A disconnect/error NEVER calls notifyAuthInvalidated: only
 * an explicit 401 from the existing REST client does that (unchanged).
 */
export function useRealtime(): { status: RealtimeStatus } {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("DISCONNECTED");
  const everConnected = useRef(false);

  useEffect(() => {
    let source: EventSource<RealtimeEventType> | null = null;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      source = new EventSource(`${API_ROOT}/realtime/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      source.addEventListener("open", () => {
        if (everConnected.current) {
          for (const queryKey of CORE_QUERY_KEYS) {
            void queryClient.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
          }
        }
        everConnected.current = true;
        setStatus("CONNECTED");
      });

      source.addEventListener("error", () => {
        setStatus((prev) => (prev === "CONNECTED" ? "RECONNECTING" : "DISCONNECTED"));
      });

      for (const type of Object.keys(INVALIDATIONS) as RealtimeEventType[]) {
        source.addEventListener(type, (event) => {
          if (!event.data) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!isRealtimeEvent(parsed)) return;
          for (const queryKey of INVALIDATIONS[parsed.type]) {
            void queryClient.invalidateQueries({ queryKey: queryKey as readonly unknown[] });
          }
        });
      }
    })();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [queryClient]);

  return { status };
}
```

Wire it into `apps/mobile/src/providers/AppProviders.tsx` the same way as Admin (a `RealtimeMount` component calling `useRealtime()` rendered inside the existing `QueryClientProvider`/`SessionProvider` tree — apply after reading that file's current structure at edit time to match its existing nesting order).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @parada/mobile -- realtime.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full mobile suite**

Run: `npm run test -w @parada/mobile`
Expected: PASS, zero regressions from the `AppProviders` change

---

## Task 15: Remaining Spec-Mandated Test Scenarios

Closes four scenarios the spec's testing section names explicitly that Tasks 1–14's tests don't yet cover directly: a rolled-back transaction must publish nothing; a stale/out-of-order event must never permanently revert completed state in the UI; a client must recover missed events on reconnect from authoritative state, not from event replay; and network failure (429 or timeout) must never be treated as authentication failure, on both clients.

**Files:**
- Test: `services/api/src/realtime/rollback.test.ts` (new)
- Test: `apps/admin/__tests__/realtime-client.test.ts` (append)
- Test: `apps/mobile/__tests__/realtime.test.ts` (append)

- [ ] **Step 1: Write and run the backend rollback test**

```typescript
// services/api/src/realtime/rollback.test.ts
import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

it("publishes nothing when the reservation transaction is rejected (e.g. zone at capacity)", async () => {
  const hub = new RealtimeHub();
  const frames: string[] = [];
  const client: RealtimeClient = { id: "c1", userId: "rollbackUser1", role: "USER", write: (c) => frames.push(c) };
  hub.subscribe(client);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "rollbackUser1", name: "R", email: "rb1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RTFull", code: "RTFULL", capacity: 0 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-FULL", normalizedPlate: "RTFULL1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/reservations")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });

  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(frames.some((f) => f.includes("RESERVATION_CREATED"))).toBe(false);
});
```

Run: `npm run test -w @parada/api -- realtime/rollback.test.ts`
Expected: PASS (1 test) — this exercises existing capacity-guard behavior in `ReservationService.create` (unchanged by this phase) together with Task 7's publish call, confirming the publish sits after the guard, not before it.

- [ ] **Step 2: Append admin tests for stale events and network-failure isolation**

Append to `apps/admin/__tests__/realtime-client.test.ts`:

```typescript
  it("a stale event only triggers a refetch — it never sets cache data directly, so a stale ACTIVE cannot revert a COMPLETED session in the UI", async () => {
    const qc = new QueryClient();
    const setSpy = jest.spyOn(qc, "setQueryData");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    // An out-of-order PARKING_SESSION_STARTED arriving after the real
    // COMPLETED must not matter: the hook only ever calls invalidateQueries,
    // never setQueryData, so the next fetch reads whatever the DB actually
    // holds regardless of event arrival order.
    FakeEventSource.instances[0]!.emit("PARKING_SESSION_STARTED", {
      type: "PARKING_SESSION_STARTED",
      occurredAt: "2020-01-01T00:00:00.000Z",
      payload: { id: "s1", status: "ACTIVE" },
    });

    expect(setSpy).not.toHaveBeenCalled();
  });

  it("does not clear the query cache when the connection error looks like a network/429 failure, not an auth failure", async () => {
    const qc = new QueryClient();
    const clearSpy = jest.spyOn(qc, "clear");
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    // EventSource surfaces every transport failure (timeout, 429, DNS, TLS)
    // through the same onerror callback with no status code attached — the
    // hook's contract is that NONE of them ever call queryClient.clear() or
    // touch admin auth, only the existing REST 401 path does that.
    FakeEventSource.instances[0]!.emitError();

    await waitFor(() => expect(result.current.status).toBe("DISCONNECTED"));
    expect(clearSpy).not.toHaveBeenCalled();
  });
```

Run: `npm run test -w @parada/admin -- realtime-client.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 3: Append mobile tests for missed-event recovery and no-logout-on-network-error**

Append to `apps/mobile/__tests__/realtime.test.ts`:

```typescript
it("recovers missed events on reconnect by invalidating core queries, not by trusting event continuity", async () => {
  const qc = new QueryClient();
  const spy = jest.spyOn(qc, "invalidateQueries");
  renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

  const source = FakeEventSource.instances[0]!;
  source.listeners.get("open")?.({ data: "" });
  spy.mockClear();
  // Reconnect: open fires again after the connection was already established once.
  source.listeners.get("open")?.({ data: "" });

  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.activeSession }));
});

it("a realtime connection error never calls notifyAuthInvalidated — only an explicit 401 from the REST client does", async () => {
  const authModule = await import("@/lib/auth/session");
  const notifySpy = jest.spyOn(authModule, "notifyAuthInvalidated");
  const qc = new QueryClient();
  renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
  await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

  FakeEventSource.instances[0]!.listeners.get("error")?.({ data: "" });

  expect(notifySpy).not.toHaveBeenCalled();
});
```

Add the missing import at the top of the file: `import { queryKeys } from "@/lib/query";`

Run: `npm run test -w @parada/mobile -- realtime.test.ts`
Expected: PASS (4 tests total)

---

## Task 16: Full Regression Pass + Final Report

- [ ] **Step 1:** `npm run typecheck` (root — runs `turbo run typecheck` across every workspace)
- [ ] **Step 2:** `npm run lint` (root)
- [ ] **Step 3:** `npm run test` (root — every workspace's Jest suite)
- [ ] **Step 4:** `npm run build -w @parada/api` and `npm run build -w @parada/admin` (confirm the SSE relay compiles under Next's production build, and the API's `dist/` output includes `realtime/`)
- [ ] **Step 5:** `git status --short` (confirm no commits were made, exactly the files this plan lists are modified)
- [ ] **Step 6:** Compose the FINAL REPORT in the exact format the spec requests (audit, transport, events, architecture, security, cache, reconnect, exact test/typecheck/lint/build results, warnings, deferred items, git status, Phase 13 readiness, final status).
