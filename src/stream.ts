/**
 * Server-side bookkeeping for active streams on one connection.
 *
 * Each `client.stream(name, input)` opens a stream identified by a client-minted
 * id. The server runs the channel's async-generator handler and pushes each
 * yielded value as a {@link import("./wire.ts").Frame.StreamData} frame. This
 * tracks the in-flight streams so a client cancel (StreamStop) or a disconnect
 * can abort them — the handler's `signal` fires and its generator is
 * `return()`-ed, so a `try/finally` cleans up. One instance per connection.
 */
export class StreamRegistry {
    #active = new Map<number, AbortController>();

    /** Register a new stream and return the signal handed to its handler. */
    add(streamId: number): AbortSignal {
        const ac = new AbortController();
        this.#active.set(streamId, ac);
        return ac.signal;
    }

    /** Cancel one stream (client StreamStop). */
    stop(streamId: number): void {
        const ac = this.#active.get(streamId);
        if (ac) {
            ac.abort();
            this.#active.delete(streamId);
        }
    }

    /** Mark a stream finished (handler completed/failed) — no abort. */
    done(streamId: number): void {
        this.#active.delete(streamId);
    }

    /** Cancel every active stream (on disconnect). */
    abortAll(): void {
        for (const ac of this.#active.values()) ac.abort();
        this.#active.clear();
    }
}
