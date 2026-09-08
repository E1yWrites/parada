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
