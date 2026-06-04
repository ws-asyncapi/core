/**
 * Contract versioning.
 *
 * A deployed client and server can silently drift apart: rename an event, change
 * a payload's shape, and an old client keeps connecting but mis-parses frames —
 * the worst class of realtime bug, because it surfaces as cryptic corruption far
 * from the cause. Being contract-first lets us do better: derive a stable hash of
 * a channel's message shapes and exchange it in the Hello/Welcome handshake, so
 * an incompatible client is rejected up front with a clear, actionable error.
 *
 * The hash is computed identically on both ends from the same source: the server
 * hashes its {@link import("./index.ts").Channel}; the generated client embeds the
 * hash carried in the AsyncAPI document (which is produced from the same channel),
 * so they agree by construction. The codegen-free client shares the type at build
 * time and can opt in by passing `contractVersion` explicitly.
 */
import { type AnySchema, toJsonSchema } from "./schema.ts";

/** Recursively sort object keys so equal contracts serialize identically. */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as object).sort())
            out[key] = canonical((value as Record<string, unknown>)[key]);
        return out;
    }
    return value;
}

/** FNV-1a (32-bit) over a string → 8-char hex. Fast, dependency-free, and more
 *  than enough to detect a changed contract (this is drift detection, not
 *  cryptographic integrity). */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

const schemaOrNull = (s: AnySchema | undefined, io: "input" | "output") =>
    s ? toJsonSchema(s, io) : null;

/** Channel internals consumed by {@link contractHash} (structurally typed so
 *  this module doesn't import the heavily-generic `Channel`). */
interface ContractShape {
    "~": {
        client: Map<string, { validation?: AnySchema }>;
        server: Map<string, AnySchema | undefined>;
        rpc: Map<
            string,
            { input: AnySchema; output: AnySchema; errors?: Record<string, AnySchema> }
        >;
        serverRpc: Map<string, { input: AnySchema; output: AnySchema }>;
        query?: AnySchema;
        headers?: AnySchema;
    };
}

const cache = new WeakMap<object, string>();

/**
 * Deterministic hash of a channel's wire contract (commands, events, RPCs,
 * server→client RPCs, and the connection query/headers schemas). Stable across
 * runs and processes for the same contract; changes whenever any message name or
 * schema changes. Memoized per channel.
 */
export function contractHash(channel: unknown): string {
    const cached = cache.get(channel as object);
    if (cached) return cached;
    const c = (channel as ContractShape)["~"];

    const sortedEntries = <V>(map: Map<string, V>) =>
        [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const shape = {
        v: 1, // hash-format version: bump if this serialization changes
        commands: Object.fromEntries(
            sortedEntries(c.client).map(([name, e]) => [
                name,
                schemaOrNull(e.validation, "input"),
            ]),
        ),
        events: Object.fromEntries(
            sortedEntries(c.server).map(([name, s]) => [
                name,
                schemaOrNull(s, "output"),
            ]),
        ),
        rpc: Object.fromEntries(
            sortedEntries(c.rpc).map(([name, d]) => [
                name,
                {
                    in: schemaOrNull(d.input, "input"),
                    out: schemaOrNull(d.output, "output"),
                    errors: d.errors
                        ? Object.fromEntries(
                              Object.keys(d.errors)
                                  .sort()
                                  .map((k) => [
                                      k,
                                      schemaOrNull(d.errors?.[k], "output"),
                                  ]),
                          )
                        : null,
                },
            ]),
        ),
        serverRpc: Object.fromEntries(
            sortedEntries(c.serverRpc).map(([name, d]) => [
                name,
                {
                    in: schemaOrNull(d.input, "input"),
                    out: schemaOrNull(d.output, "output"),
                },
            ]),
        ),
        query: schemaOrNull(c.query, "input"),
        headers: schemaOrNull(c.headers, "input"),
    };

    const hash = fnv1a(JSON.stringify(canonical(shape)));
    cache.set(channel as object, hash);
    return hash;
}
