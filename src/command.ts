/**
 * Cross-node command channel.
 *
 * Server-side management ops (disconnect/join/leave sockets) and server↔server
 * messaging (`serverSideEmit`) are published as JSON commands on a reserved
 * backplane topic. Every node (including the origin) receives the command via
 * the backplane and applies it to its **local** sockets — so the operation is
 * cluster-wide without any single node enumerating remote sockets.
 */
import type { AnyChannel } from "./index.ts";

/** Reserved backplane topic carrying {@link NodeCommand} messages (JSON). */
export const COMMAND_TOPIC = "#wsaa:cmd";

export type NodeCommand =
    | { op: "join"; channel: string; room: string | null; rooms: string[] }
    | { op: "leave"; channel: string; room: string | null; rooms: string[] }
    | { op: "disconnect"; channel: string; room: string | null }
    | { op: "sse"; channel: string; event: string; data: unknown };

// biome-ignore lint/suspicious/noExplicitAny: registry holds type-erased conns
function inRoom(conn: { ws: any }, room: string | null): boolean {
    return room === null || conn.ws.isSubscribed(room);
}

/**
 * Apply a command to a channel's local sockets. Called by each node from its
 * backplane message handler. `isOrigin` is true on the node that issued the
 * command (used to avoid echoing `serverSideEmit` back to the sender).
 */
export function applyCommand(
    channel: AnyChannel | undefined,
    cmd: NodeCommand,
    isOrigin: boolean,
): void {
    if (!channel) return;
    // biome-ignore lint/suspicious/noExplicitAny: ~ is type-erased
    const sockets: Map<string, { ws: any }> = (channel as any)["~"].sockets;

    switch (cmd.op) {
        case "disconnect":
            for (const conn of sockets.values())
                if (inRoom(conn, cmd.room)) conn.ws.close();
            return;
        case "join":
            for (const conn of sockets.values())
                if (inRoom(conn, cmd.room))
                    for (const r of cmd.rooms) conn.ws.subscribe(r);
            return;
        case "leave":
            for (const conn of sockets.values())
                if (inRoom(conn, cmd.room))
                    for (const r of cmd.rooms) conn.ws.unsubscribe(r);
            return;
        case "sse": {
            // server→server: don't echo to the emitting node
            if (isOrigin) return;
            // biome-ignore lint/suspicious/noExplicitAny: ~ is type-erased
            const handlers: Map<string, (d: unknown) => void> = (channel as any)[
                "~"
            ].serverEvents;
            handlers.get(cmd.event)?.(cmd.data);
            return;
        }
    }
}
