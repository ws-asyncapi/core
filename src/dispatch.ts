/**
 * Transport-agnostic connection lifecycle + frame dispatch.
 *
 * Every adapter (Elysia, Node/ws, …) handles only the transport specifics —
 * accepting sockets, decoding bytes into frames, and providing a
 * {@link WebSocketImplementation}. The protocol itself (the frame switch,
 * validation, middleware, the recovery handshake, RPC replies + typed errors)
 * lives here so it is implemented once and shared.
 */
import type { Backplane } from "./backplane.ts";
import type { AnyChannel } from "./index.ts";
import type { OutboundRpc } from "./outbound.ts";
import { validate } from "./schema.ts";
import type { RequestData } from "./types.ts";
import type { WebSocketImplementation } from "./websocket.ts";
import { type AnyFrame, type ErrorCode, Frame, RpcError } from "./wire.ts";

/** Mutable per-connection state shared across a socket's lifetime. */
export interface Connection {
    /** the adapter's WebSocket implementation for this socket */
    // biome-ignore lint/suspicious/noExplicitAny: transport-erased ws
    readonly ws: WebSocketImplementation<any, any>;
    /** connection request data (query / headers / params) */
    // biome-ignore lint/suspicious/noExplicitAny: per-channel shapes
    readonly request: RequestData<any, any, any>;
    /** derived context bag (filled by {@link openConnection}) */
    // biome-ignore lint/suspicious/noExplicitAny: accumulated data
    data: any;
    /** recovery session id, assigned on the Hello handshake */
    sessionId?: string;
    /** pending server→client (outbound) RPCs for this connection */
    outbound?: OutboundRpc;
}

/** Reserved per-socket room so a socket can be addressed directly by id
 *  (`channel.toSocket(id, …)`), cluster-wide, through the normal publish path. */
export function perSocketRoom(socketId: string): string {
    return `#sid:${socketId}`;
}

/** Run the channel's `.derive`/`.resolve` chain, then `onOpen`. */
export async function openConnection(
    channel: AnyChannel,
    conn: Connection,
): Promise<void> {
    // auto-join the per-socket room so targeted sends reach this socket
    conn.ws.subscribe(perSocketRoom(conn.ws.id) as never);
    // register in the channel's socket map (for server-side admin ops)
    // biome-ignore lint/suspicious/noExplicitAny: ~ is type-erased
    (channel as any)["~"].sockets.set(conn.ws.id, conn);
    let data = conn.data ?? {};
    for (const derive of channel["~"].derives) {
        const result = await derive({ request: conn.request, data });
        if (result && typeof result === "object")
            data = Object.assign(data, result);
    }
    conn.data = data;
    await channel["~"].onOpen?.({
        ws: conn.ws,
        request: conn.request,
        data,
    });
}

/** Run `onClose`, persist the recovery session, and drop the socket from rooms. */
export async function closeConnection(
    channel: AnyChannel,
    backplane: Backplane,
    conn: Connection,
): Promise<void> {
    await channel["~"].onClose?.({
        ws: conn.ws,
        request: conn.request,
        data: conn.data,
    });
    // deregister from the channel's socket map
    // biome-ignore lint/suspicious/noExplicitAny: ~ is type-erased
    (channel as any)["~"].sockets.delete(conn.ws.id);
    // fail any in-flight server→client requests
    conn.outbound?.rejectAll(new RpcError("INTERNAL", "connection closed"));
    // persist recoverable state (rooms) before dropping the socket — but not
    // the per-socket room (it's keyed by the old id, which won't recur)
    if (conn.sessionId && backplane.saveSession) {
        const rooms = (await backplane.rooms(conn.ws.id)).filter(
            (r) => !r.startsWith("#sid:"),
        );
        if (rooms.length > 0)
            await backplane.saveSession(conn.sessionId, { rooms });
    }
    await backplane.removeSocket(conn.ws.id);
}

/**
 * Handle one decoded inbound frame. The adapter is responsible for decoding the
 * transport bytes into an {@link AnyFrame} before calling this.
 */
export async function dispatchFrame(
    channel: AnyChannel,
    backplane: Backplane,
    conn: Connection,
    frame: AnyFrame,
): Promise<void> {
    if (!Array.isArray(frame)) return;
    const wsi = conn.ws;
    const request = conn.request;
    const data = conn.data ?? {};

    // run per-message middleware into a per-message context copy; throw rejects
    const applyMiddleware = async (type: string, message: unknown) => {
        if (channel["~"].middlewares.length === 0) return data;
        const ctxData = { ...data };
        for (const mw of channel["~"].middlewares) {
            const result = await mw({
                ws: wsi,
                type,
                message,
                request,
                data: ctxData,
            });
            if (result && typeof result === "object")
                Object.assign(ctxData, result);
        }
        return ctxData;
    };

    switch (frame[0]) {
        case Frame.Ping: {
            wsi.sendFrame([Frame.Pong, frame[1]]);
            return;
        }
        case Frame.Pong:
            return;
        case Frame.Reply: {
            // response to a server→client request we initiated
            const [, corrId, payload] = frame;
            conn.outbound?.resolve(corrId, payload);
            return;
        }
        case Frame.Error: {
            const [, corrId, code, message, errData] = frame;
            conn.outbound?.reject(corrId, new RpcError(code, message, errData));
            return;
        }
        case Frame.Hello: {
            // Connection-state-recovery handshake: re-join the session's rooms
            // and replay missed events, else a clean Welcome.
            const requestedSid = frame[1];
            const clientOffset = frame[2] ?? 0;
            const sid = requestedSid ?? crypto.randomUUID();
            let recovered: 0 | 1 = 0;

            if (requestedSid && backplane.loadSession) {
                const session = await backplane.loadSession(requestedSid);
                if (session) {
                    for (const room of session.rooms)
                        wsi.subscribe(room as never);
                    if (backplane.replaySince) {
                        const missed = await backplane.replaySince(
                            clientOffset,
                            session.rooms,
                        );
                        for (const m of missed) wsi.sendRaw(m.payload);
                    }
                    await backplane.dropSession?.(requestedSid);
                    recovered = 1;
                }
            }

            conn.sessionId = sid;
            const serverOffset = backplane.assignOffset
                ? await backplane.assignOffset()
                : 0;
            wsi.sendFrame([Frame.Welcome, sid, recovered, serverOffset]);
            return;
        }
        case Frame.Command: {
            const [, name, payload] = frame;
            const entry = channel["~"].client.get(name);
            if (!entry) {
                console.warn(`No handler found for ${name}`);
                return;
            }

            let message = payload;
            if (entry.validation) {
                const result = await validate(entry.validation, payload);
                if (!result.ok) {
                    console.warn(
                        `Invalid payload for command "${name}"`,
                        result.issues,
                    );
                    return;
                }
                message = result.value;
            }

            try {
                const ctxData = await applyMiddleware(name, message);
                await entry.handler({
                    ws: wsi,
                    message,
                    request,
                    data: ctxData,
                });
            } catch (error) {
                if (channel["~"].onError)
                    channel["~"].onError({
                        ws: wsi,
                        error,
                        type: name,
                        data,
                    });
                else console.error(`Error in command "${name}":`, error);
            }
            return;
        }
        case Frame.Request: {
            const [, name, corrId, payload] = frame;
            const entry = channel["~"].rpc.get(name);
            if (!entry) {
                wsi.sendFrame([
                    Frame.Error,
                    corrId,
                    "NOT_FOUND",
                    `No RPC handler for "${name}"`,
                ]);
                return;
            }

            const inputResult = await validate(entry.input, payload);
            if (!inputResult.ok) {
                wsi.sendFrame([
                    Frame.Error,
                    corrId,
                    "VALIDATION",
                    `Invalid input for RPC "${name}"`,
                    inputResult.issues.slice(0, 5),
                ]);
                return;
            }
            const message = inputResult.value;

            try {
                const ctxData = await applyMiddleware(name, message);
                const reply = await entry.handler({
                    ws: wsi,
                    message,
                    request,
                    data: ctxData,
                });
                wsi.sendFrame([Frame.Reply, corrId, reply]);
            } catch (error) {
                const code: ErrorCode =
                    error instanceof RpcError ? error.code : "INTERNAL";
                const msg =
                    error instanceof Error ? error.message : String(error);
                const errData =
                    error instanceof RpcError ? error.data : undefined;
                wsi.sendFrame([Frame.Error, corrId, code, msg, errData]);
            }
            return;
        }
        default:
            return;
    }
}
