/**
 * Horizontal-scaling seam. A {@link Backplane} fans wire frames out to every
 * server node and tracks room membership cluster-wide, so `publish`, rooms, and
 * presence work across a fleet of processes. The default {@link LocalBackplane}
 * is single-process and preserves the original in-memory behavior; Redis (Pub/Sub
 * or Streams) implementations slot in without touching channel/handler code.
 */

/** A message delivered to a node for local fan-out. */
export interface BackplaneMessage {
    topic: string;
    /** already codec-encoded frame, ready to hand to the server's publish */
    payload: string | Uint8Array;
    /** node id that originated the message (skip when it equals our nodeId) */
    origin: string;
    /** monotonic, cluster-wide offset, when the backplane supports replay */
    offset?: number | string;
    /** socket ids to skip on local delivery (e.g. exclude the sender) */
    except?: string[];
}

import type { MaybePromise } from "./types.ts";

/**
 * A connection's recoverable state, persisted while it is briefly disconnected
 * so a reconnecting client can be restored (rooms re-joined + missed events
 * replayed). Held for a short TTL by the backplane.
 */
export interface SessionState {
    /** rooms (topics) the socket was subscribed to at disconnect */
    rooms: string[];
}

export interface Backplane {
    /** unique id of this server node */
    readonly nodeId: string;

    /**
     * Fan a message out to all nodes; each delivers locally to subscribers.
     * When `offset` is supplied (recovery-capable backplanes) the message is
     * also appended to the replay log under that offset.
     */
    publish(
        topic: string,
        payload: string | Uint8Array,
        offset?: number | string,
        except?: string[],
    ): Promise<void>;

    /** Register the local delivery callback (called once by the adapter). */
    onMessage(handler: (message: BackplaneMessage) => void): void;

    /** Record that a local socket joined a room (topic). */
    addToRoom(topic: string, socketId: string): Promise<void>;
    /** Record that a local socket left a room (topic). */
    removeFromRoom(topic: string, socketId: string): Promise<void>;
    /** Remove a socket from all rooms (on disconnect). */
    removeSocket(socketId: string): Promise<void>;

    /** Cluster-wide socket ids in a room (presence / fetchSockets). */
    roomMembers(topic: string): Promise<string[]>;
    /** Rooms a socket currently belongs to. */
    rooms(socketId: string): Promise<string[]>;

    // --- connection-state-recovery (optional capability) ---------------------
    // A backplane that implements these enables clients to recover missed
    // events after a brief disconnect. Backplanes without them simply degrade
    // to a clean resubscribe (recovered = 0).

    /** Vend the next monotonic, cluster-wide offset for an outgoing event. */
    assignOffset?(): MaybePromise<number | string>;

    /**
     * Replay buffered events for the given `topics` whose offset is strictly
     * greater than `offset`, in global publish order.
     */
    replaySince?(
        offset: number | string,
        topics: string[],
    ): Promise<BackplaneMessage[]>;

    // --- presence (optional capability) --------------------------------------
    // A backplane that implements these stores per-room member state cluster-wide
    // so a (re)connecting client can fetch the current roster. Live join/leave/
    // update changes ride the normal publish fan-out as PresenceDiff frames, so
    // they already work cross-node; these methods back the snapshot only. Without
    // them, `.presence` snapshots are empty (diffs still flow).

    /** Store (or replace) a member's presence state in a room. */
    setPresence?(room: string, socketId: string, state: unknown): Promise<void>;
    /** Remove a member from a room's presence roster. */
    clearPresence?(room: string, socketId: string): Promise<void>;
    /** Current roster of a presence room: socket id → state. */
    getPresence?(room: string): Promise<Record<string, unknown>>;

    // --- per-room history / rewind (optional capability) ---------------------
    // A backplane that implements these retains recent events per room so a
    // client can fetch a backlog on demand. Recording happens once on the
    // publishing node (in `publishEvent`); only event names registered via
    // `configureHistory` are kept.

    /** Register which event names to retain and how many (event name → keep). */
    configureHistory?(events: Record<string, number>): void;
    /** Append an event to a room's history (no-op if the event isn't retained). */
    appendHistory?(topic: string, event: string, data: unknown): Promise<void>;
    /** Fetch a room's retained events (most-recent `limit`, or all), in order. */
    getHistory?(
        topic: string,
        limit?: number,
    ): Promise<Array<{ event: string; data: unknown }>>;

    /** Persist a disconnecting connection's recoverable state for `ttlMs`. */
    saveSession?(sessionId: string, state: SessionState): Promise<void>;
    /** Load a reconnecting connection's state, or null if expired/unknown. */
    loadSession?(sessionId: string): Promise<SessionState | null>;
    /** Drop a session once it has been recovered (or on hard close). */
    dropSession?(sessionId: string): Promise<void>;

    close(): Promise<void>;
}

/**
 * In-process backplane: delivers published messages straight back to the local
 * node and tracks membership in memory. Behaviorally identical to the original
 * single-process pub/sub, but also powers presence/`roomMembers` on one node.
 */
export interface LocalBackplaneOptions {
    /**
     * Connection-state-recovery tuning. Pass `false` to disable the replay log
     * (smaller memory footprint, no recovery). Default: enabled.
     */
    recovery?:
        | false
        | {
              /** max events retained in the replay log (default: 10_000) */
              bufferSize?: number;
              /** how long a disconnected session is recoverable (default: 120_000ms) */
              sessionTTL?: number;
          };
}

export class LocalBackplane implements Backplane {
    readonly nodeId = crypto.randomUUID();

    #handler?: (message: BackplaneMessage) => void;
    #rooms = new Map<string, Set<string>>();
    #socketRooms = new Map<string, Set<string>>();
    // presence: room -> (socketId -> state)
    #presence = new Map<string, Map<string, unknown>>();
    // history: retained event names (name -> keep), max keep, and room -> entries
    #historyEvents = new Map<string, number>();
    #historyCap = 0;
    #history = new Map<string, Array<{ event: string; data: unknown }>>();

    // recovery state
    #recovery: boolean;
    #bufferSize: number;
    #sessionTTL: number;
    #seq = 0;
    #log: BackplaneMessage[] = [];
    #sessions = new Map<
        string,
        { state: SessionState; timer: ReturnType<typeof setTimeout> }
    >();

    constructor(options: LocalBackplaneOptions = {}) {
        this.#recovery = options.recovery !== false;
        const rec = options.recovery === false ? undefined : options.recovery;
        this.#bufferSize = rec?.bufferSize ?? 10_000;
        this.#sessionTTL = rec?.sessionTTL ?? 120_000;
    }

    onMessage(handler: (message: BackplaneMessage) => void): void {
        this.#handler = handler;
    }

    async publish(
        topic: string,
        payload: string | Uint8Array,
        offset?: number | string,
        except?: string[],
    ): Promise<void> {
        const message: BackplaneMessage = {
            topic,
            payload,
            origin: this.nodeId,
            offset,
            except,
        };
        if (this.#recovery && offset !== undefined) {
            this.#log.push(message);
            if (this.#log.length > this.#bufferSize)
                this.#log.splice(0, this.#log.length - this.#bufferSize);
        }
        this.#handler?.(message);
    }

    assignOffset(): number {
        return ++this.#seq;
    }

    async replaySince(
        offset: number | string,
        topics: string[],
    ): Promise<BackplaneMessage[]> {
        if (!this.#recovery) return [];
        const since = Number(offset);
        const wanted = new Set(topics);
        return this.#log.filter(
            (m) =>
                m.offset !== undefined &&
                Number(m.offset) > since &&
                wanted.has(m.topic),
        );
    }

    async saveSession(sessionId: string, state: SessionState): Promise<void> {
        if (!this.#recovery) return;
        this.#clearSessionTimer(sessionId);
        const timer = setTimeout(() => {
            this.#sessions.delete(sessionId);
        }, this.#sessionTTL);
        // don't keep the process alive just for a recovery window
        (timer as { unref?: () => void }).unref?.();
        this.#sessions.set(sessionId, { state, timer });
    }

    async loadSession(sessionId: string): Promise<SessionState | null> {
        return this.#sessions.get(sessionId)?.state ?? null;
    }

    async dropSession(sessionId: string): Promise<void> {
        this.#clearSessionTimer(sessionId);
        this.#sessions.delete(sessionId);
    }

    #clearSessionTimer(sessionId: string): void {
        const existing = this.#sessions.get(sessionId);
        if (existing) clearTimeout(existing.timer);
    }

    async addToRoom(topic: string, socketId: string): Promise<void> {
        let members = this.#rooms.get(topic);
        if (!members) {
            members = new Set();
            this.#rooms.set(topic, members);
        }
        members.add(socketId);

        let rooms = this.#socketRooms.get(socketId);
        if (!rooms) {
            rooms = new Set();
            this.#socketRooms.set(socketId, rooms);
        }
        rooms.add(topic);
    }

    async removeFromRoom(topic: string, socketId: string): Promise<void> {
        const members = this.#rooms.get(topic);
        if (members) {
            members.delete(socketId);
            if (members.size === 0) this.#rooms.delete(topic);
        }
        const rooms = this.#socketRooms.get(socketId);
        if (rooms) {
            rooms.delete(topic);
            if (rooms.size === 0) this.#socketRooms.delete(socketId);
        }
    }

    async removeSocket(socketId: string): Promise<void> {
        const rooms = this.#socketRooms.get(socketId);
        if (!rooms) return;
        for (const topic of rooms) {
            const members = this.#rooms.get(topic);
            if (members) {
                members.delete(socketId);
                if (members.size === 0) this.#rooms.delete(topic);
            }
        }
        this.#socketRooms.delete(socketId);
    }

    async setPresence(
        room: string,
        socketId: string,
        state: unknown,
    ): Promise<void> {
        let members = this.#presence.get(room);
        if (!members) {
            members = new Map();
            this.#presence.set(room, members);
        }
        members.set(socketId, state);
    }

    async clearPresence(room: string, socketId: string): Promise<void> {
        const members = this.#presence.get(room);
        if (members) {
            members.delete(socketId);
            if (members.size === 0) this.#presence.delete(room);
        }
    }

    async getPresence(room: string): Promise<Record<string, unknown>> {
        return Object.fromEntries(this.#presence.get(room) ?? []);
    }

    configureHistory(events: Record<string, number>): void {
        for (const [event, keep] of Object.entries(events)) {
            this.#historyEvents.set(event, keep);
            if (keep > this.#historyCap) this.#historyCap = keep;
        }
    }

    async appendHistory(
        topic: string,
        event: string,
        data: unknown,
    ): Promise<void> {
        if (!this.#historyEvents.has(event)) return;
        let entries = this.#history.get(topic);
        if (!entries) {
            entries = [];
            this.#history.set(topic, entries);
        }
        entries.push({ event, data });
        // cap the per-room buffer at the largest configured keep
        if (entries.length > this.#historyCap)
            entries.splice(0, entries.length - this.#historyCap);
    }

    async getHistory(
        topic: string,
        limit?: number,
    ): Promise<Array<{ event: string; data: unknown }>> {
        const entries = this.#history.get(topic) ?? [];
        return limit != null ? entries.slice(-limit) : entries.slice();
    }

    async roomMembers(topic: string): Promise<string[]> {
        return [...(this.#rooms.get(topic) ?? [])];
    }

    async rooms(socketId: string): Promise<string[]> {
        return [...(this.#socketRooms.get(socketId) ?? [])];
    }

    async close(): Promise<void> {}
}
