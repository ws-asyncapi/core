/**
 * RPC idempotency / dedup.
 *
 * ws-asyncapi delivers RPCs at-least-once: a reply can be lost if the socket
 * drops after the handler ran (the client's pending request rejects, the caller
 * retries) — so a naive "charge card" handler can execute twice. When a client
 * tags a {@link import("./wire.ts").Frame.Request} with a stable idempotency key,
 * the server runs the handler **once** per key and returns the cached outcome to
 * any duplicate (a retransmit, a retry after reconnect, or a concurrent in-flight
 * duplicate). This turns at-least-once delivery into at-least-once with an
 * idempotent *effect* — the property apps actually need.
 *
 * Scope is per-channel and in-process. That covers a single node and the common
 * "reconnect to the same node" case; cluster-wide dedup across nodes would need
 * the result cached on the backplane (a documented limitation, not handled here).
 */
import type { ErrorCode } from "./wire.ts";

/** The settled outcome of an RPC, replayable to duplicate requests. */
export interface CachedRpc {
    ok: boolean;
    /** present when `ok` — the reply payload */
    payload?: unknown;
    /** present when `!ok` */
    code?: ErrorCode;
    message?: string;
    data?: unknown;
}

interface Entry {
    /** resolves once the first execution settles; awaited by concurrent dupes */
    promise: Promise<CachedRpc>;
    /** set once settled, so completed dupes resolve synchronously */
    value?: CachedRpc;
    timer?: ReturnType<typeof setTimeout>;
}

export interface IdempotencyOptions {
    /** how long a key's result is retained (default: 120_000ms, matching NATS) */
    ttlMs?: number;
    /** max distinct keys retained; oldest evicted past this (default: 10_000) */
    maxKeys?: number;
}

/**
 * Bounded, TTL'd store mapping idempotency key → settled RPC outcome. The first
 * call for a key runs `exec`; subsequent calls (in-flight or completed) get the
 * same outcome without re-running it.
 */
export class IdempotencyCache {
    #ttl: number;
    #max: number;
    #entries = new Map<string, Entry>();

    constructor(options: IdempotencyOptions = {}) {
        this.#ttl = options.ttlMs ?? 120_000;
        this.#max = options.maxKeys ?? 10_000;
    }

    /**
     * Run `exec` exactly once for `key`; duplicates resolve to the same outcome.
     * `exec` must not throw — it returns a {@link CachedRpc} for both success and
     * failure so failures are cached identically (a retry sees the same error).
     */
    async run(key: string, exec: () => Promise<CachedRpc>): Promise<CachedRpc> {
        const existing = this.#entries.get(key);
        if (existing) return existing.value ?? existing.promise;

        let settle!: (value: CachedRpc) => void;
        const promise = new Promise<CachedRpc>((resolve) => {
            settle = resolve;
        });
        const entry: Entry = { promise };
        this.#entries.set(key, entry);
        this.#evictIfNeeded();

        const value = await exec();
        entry.value = value;
        settle(value);
        const timer = setTimeout(() => this.#entries.delete(key), this.#ttl);
        (timer as { unref?: () => void }).unref?.();
        entry.timer = timer;
        return value;
    }

    #evictIfNeeded(): void {
        while (this.#entries.size > this.#max) {
            // Map preserves insertion order → first key is the oldest.
            const oldest = this.#entries.keys().next().value;
            if (oldest === undefined) break;
            const e = this.#entries.get(oldest);
            if (e?.timer) clearTimeout(e.timer);
            this.#entries.delete(oldest);
        }
    }

    /** Drop everything (e.g. on shutdown). */
    clear(): void {
        for (const e of this.#entries.values())
            if (e.timer) clearTimeout(e.timer);
        this.#entries.clear();
    }
}
