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
    /** monotonic per-topic offset, when the backplane supports replay */
    offset?: string;
}

export interface Backplane {
    /** unique id of this server node */
    readonly nodeId: string;

    /** Fan a message out to all nodes; each delivers locally to subscribers. */
    publish(topic: string, payload: string | Uint8Array): Promise<void>;

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

    /** Replay frames published to `topic` after `offset` (recovery backfill). */
    replaySince?(topic: string, offset: string): Promise<BackplaneMessage[]>;

    close(): Promise<void>;
}

/**
 * In-process backplane: delivers published messages straight back to the local
 * node and tracks membership in memory. Behaviorally identical to the original
 * single-process pub/sub, but also powers presence/`roomMembers` on one node.
 */
export class LocalBackplane implements Backplane {
    readonly nodeId = crypto.randomUUID();

    #handler?: (message: BackplaneMessage) => void;
    #rooms = new Map<string, Set<string>>();
    #socketRooms = new Map<string, Set<string>>();

    onMessage(handler: (message: BackplaneMessage) => void): void {
        this.#handler = handler;
    }

    async publish(topic: string, payload: string | Uint8Array): Promise<void> {
        this.#handler?.({ topic, payload, origin: this.nodeId });
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

    async roomMembers(topic: string): Promise<string[]> {
        return [...(this.#rooms.get(topic) ?? [])];
    }

    async rooms(socketId: string): Promise<string[]> {
        return [...(this.#socketRooms.get(socketId) ?? [])];
    }

    async close(): Promise<void> {}
}
