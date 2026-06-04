/**
 * ws-asyncapi wire protocol.
 *
 * Every frame is a plain array whose first element is a numeric {@link Frame}
 * discriminator, so a receiver can branch in O(1) before touching the payload.
 * Frames stay JSON-serializable so the default {@link jsonCodec} works without
 * any per-message schema and a binary codec (msgpack) is a drop-in replacement.
 */

/** Current wire protocol version, exchanged in the Hello/Welcome handshake. */
export const PROTOCOL_VERSION = 1;

/**
 * Frame kind discriminator (first element of every wire frame).
 *
 * Wire shapes (field names are documentation only — frames are positional):
 * ```
 * Event    [0, name, payload, offset?]
 * Command  [1, name, payload]
 * Request  [2, name, corrId, payload, idemKey?]
 * Reply    [3, corrId, payload]
 * Error    [4, corrId, code, message, data?]
 * Ping     [5, ts]
 * Pong     [6, ts]
 * Hello    [7, sessionId | null, lastOffset | 0, protocolVersion]
 * Welcome  [8, sessionId, recovered (0|1), serverOffset]
 * ```
 */
export enum Frame {
    /** server→client, fire-and-forget */
    Event = 0,
    /** client→server, fire-and-forget */
    Command = 1,
    /** client→server, expects a {@link Frame.Reply} or {@link Frame.Error} */
    Request = 2,
    /** server→client, success response to a {@link Frame.Request} */
    Reply = 3,
    /** typed error response to a {@link Frame.Request} */
    Error = 4,
    /** heartbeat probe */
    Ping = 5,
    /** heartbeat acknowledgement */
    Pong = 6,
    /** connection-state-recovery handshake (client→server on (re)connect) */
    Hello = 7,
    /** handshake reply (server→client): assigns/confirms session id + offset */
    Welcome = 8,
}

/** Stable error codes carried in an {@link Frame.Error} frame. */
export const ErrorCode = {
    /** input failed schema validation (raised before the handler runs) */
    VALIDATION: "VALIDATION",
    /** no RPC handler registered for the requested name */
    NOT_FOUND: "NOT_FOUND",
    /** handler threw / unexpected server failure */
    INTERNAL: "INTERNAL",
    /** synthesized client-side when no reply arrives in time (never sent on the wire) */
    TIMEOUT: "TIMEOUT",
    /** too many in-flight requests (client) or backpressure (server) */
    OVERLOADED: "OVERLOADED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode] | (string & {});

// --- Frame tuple types -------------------------------------------------------

/**
 * Server→client event. The optional 4th element is the recovery offset, present
 * only when the active backplane supports connection-state-recovery; the client
 * tracks the highest offset it has seen and replays missed events from it after
 * a reconnect (see {@link Frame.Hello}).
 */
export type EventFrame =
    | [Frame.Event, string, unknown]
    | [Frame.Event, string, unknown, number | string];
export type CommandFrame = [Frame.Command, string, unknown];
/**
 * Client→server RPC. The optional 5th element is an idempotency key: when
 * present, the server runs the handler once per key and replays the cached
 * outcome to duplicates (retransmits / retries after reconnect), making the
 * RPC's effect at-least-once-safe. See {@link import("./idempotency.ts").IdempotencyCache}.
 */
export type RequestFrame =
    | [Frame.Request, string, number, unknown]
    | [Frame.Request, string, number, unknown, string];
export type ReplyFrame = [Frame.Reply, number, unknown];
export type ErrorFrame = [Frame.Error, number, ErrorCode, string, unknown?];
export type PingFrame = [Frame.Ping, number];
export type PongFrame = [Frame.Pong, number];
export type HelloFrame = [Frame.Hello, string | null, number | string, number];
export type WelcomeFrame = [Frame.Welcome, string, 0 | 1, number | string];

export type AnyFrame =
    | EventFrame
    | CommandFrame
    | RequestFrame
    | ReplyFrame
    | ErrorFrame
    | PingFrame
    | PongFrame
    | HelloFrame
    | WelcomeFrame;

// --- Codec -------------------------------------------------------------------

/**
 * Serializes wire frames to/from the bytes put on the socket. The codec is the
 * only component that touches the encoding; everything else works with frame
 * arrays. The whole cluster (server nodes + clients) must agree on one codec.
 */
export interface Codec {
    /** codec id, surfaced for negotiation/debugging (e.g. "json", "msgpack") */
    readonly name: string;
    encode(frame: AnyFrame): string | Uint8Array;
    decode(raw: string | ArrayBuffer | Uint8Array): AnyFrame;
}

/** Default codec: compact JSON arrays. */
export const jsonCodec: Codec = {
    name: "json",
    encode: (frame) => JSON.stringify(frame),
    decode: (raw) => {
        const text =
            typeof raw === "string"
                ? raw
                : new TextDecoder().decode(
                      raw instanceof Uint8Array ? raw : new Uint8Array(raw),
                  );
        return JSON.parse(text) as AnyFrame;
    },
};

// --- Errors ------------------------------------------------------------------

/**
 * Error surfaced on the client when an RPC fails — either rejected by the
 * server with an {@link Frame.Error} frame or synthesized locally on timeout.
 */
export class RpcError extends Error {
    readonly code: ErrorCode;
    readonly data?: unknown;

    constructor(code: ErrorCode, message: string, data?: unknown) {
        super(message);
        this.name = "RpcError";
        this.code = code;
        this.data = data;
    }
}
