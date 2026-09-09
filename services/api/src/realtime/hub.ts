import type { RealtimeEvent, RealtimeEventInput } from "@parada/types";
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
  /** How many recently published events are retained for replay to a
   *  reconnecting client. Bounded so a long-running process cannot grow
   *  without limit. */
  replayBufferSize?: number;
}

const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;
const DEFAULT_REPLAY_BUFFER_SIZE = 500;

interface BufferedEvent {
  event: RealtimeEvent;
  scope: PublishScope;
}

/**
 * In-process SSE broadcast hub. Pure transport: it has no knowledge of zones,
 * sessions, or violations beyond the RealtimeEvent shape handed to it, and it
 * never queries the database. Route handlers publish to it only after their
 * own domain-service call has resolved (i.e., after the transaction committed)
 * — the hub itself has no opinion on when that is.
 *
 * The hub owns the event sequence. Every published event gets the next `seq`,
 * which is written to the SSE `id:` line; that is what a reconnecting client
 * echoes back as `Last-Event-ID` and what clients compare to drop stale or
 * duplicated frames. Ordering is the hub's, never a producer's or a client's.
 */
export class RealtimeHub {
  private readonly clients = new Map<string, RealtimeClient>();
  private readonly byUser = new Map<string, Set<string>>();
  private readonly maxConnectionsPerUser: number;
  private readonly replayBufferSize: number;
  /** Ascending by seq; trimmed from the front once it exceeds the cap. */
  private readonly buffer: BufferedEvent[] = [];
  private seq = 0;

  constructor(options: RealtimeHubOptions = {}) {
    this.maxConnectionsPerUser = options.maxConnectionsPerUser ?? DEFAULT_MAX_CONNECTIONS_PER_USER;
    this.replayBufferSize = options.replayBufferSize ?? DEFAULT_REPLAY_BUFFER_SIZE;
  }

  connectionCount(userId?: string): number {
    if (userId === undefined) return this.clients.size;
    return this.byUser.get(userId)?.size ?? 0;
  }

  /** The highest seq published so far. 0 means nothing has been published. */
  headSeq(): number {
    return this.seq;
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
   * Stamps `input` with the next sequence number, retains it for replay, and
   * delivers it to every client the scope authorizes. An ADMIN client always
   * receives every event (the operations dashboard). A USER client only
   * receives PUBLIC events and USER events addressed to their own id — never
   * another user's data.
   *
   * Returns the stamped event so callers and tests can see the assigned seq.
   */
  publish(input: RealtimeEventInput, scope: PublishScope): RealtimeEvent {
    this.seq += 1;
    const event = { ...input, seq: this.seq } as RealtimeEvent;

    this.buffer.push({ event, scope });
    if (this.buffer.length > this.replayBufferSize) {
      this.buffer.splice(0, this.buffer.length - this.replayBufferSize);
    }

    const frame = this.frame(event);
    for (const client of this.clients.values()) {
      if (this.authorized(client, scope)) {
        client.write(frame);
      }
    }
    return event;
  }

  /**
   * Events `client` missed after `afterSeq`, re-authorized against that
   * client's own identity — a buffered USER event is never handed to a
   * different user just because it sits in the buffer.
   *
   * Returns null when the gap cannot be honoured (the cursor predates what is
   * still buffered), which is the caller's signal to tell the client to
   * refetch from REST instead of pretending continuity.
   */
  replay(client: RealtimeClient, afterSeq: number): RealtimeEvent[] | null {
    if (afterSeq >= this.seq) return [];
    // A cursor from a previous process lifetime (or one the buffer has already
    // dropped) cannot be served: seq restarts at 0 on restart, so a client
    // presenting a high cursor against a low head has missed everything.
    if (afterSeq < 0) return null;
    const oldest = this.buffer[0];
    if (!oldest || oldest.event.seq > afterSeq + 1) return null;

    return this.buffer
      .filter((entry) => entry.event.seq > afterSeq && this.authorized(client, entry.scope))
      .map((entry) => entry.event);
  }

  /** Serializes one event as an SSE frame, `id:` first so a client that stops
   *  reading mid-frame never advances its cursor past an event it did not
   *  fully receive. */
  frame(event: RealtimeEvent): string {
    return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
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
