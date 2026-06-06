/**
 * Server-level plugins — cross-channel infrastructure (metrics, tracing, audit
 * logging) that taps the connection/message lifecycle of every channel on a
 * server. Unlike channel plugins ({@link Channel.use}), these don't shape the
 * contract or its types; they observe.
 *
 * Pass them to the adapter:
 * ```ts
 * createNodeWsServer([chat, board], { plugins: [metrics(), tracing()] });
 * ```
 *
 * Hooks are fire-and-forget and isolated — a throwing hook never breaks the
 * connection or the message.
 */
import type { AnyChannel } from "./index.ts";

/** Context shared by every server-plugin hook. */
export interface ServerPluginContext {
    /** the channel the event occurred on */
    channel: AnyChannel;
    /** the socket id involved */
    socketId: string;
}

export interface ServerPlugin {
    /** optional name (diagnostics) */
    name?: string;
    /** a connection opened (after derives/onOpen ran) */
    onConnection?(
        ctx: ServerPluginContext & { request: unknown },
    ): void | Promise<void>;
    /** a connection closed */
    onDisconnect?(ctx: ServerPluginContext): void | Promise<void>;
    /** an inbound frame was received (`kind` is the numeric `Frame`; `name` is the
     *  event/command/rpc/stream name when the frame carries one) */
    onMessage?(
        ctx: ServerPluginContext & { kind: number; name?: string },
    ): void | Promise<void>;
    /** a command/middleware/handler error surfaced */
    onError?(ctx: ServerPluginContext & { error: unknown }): void | Promise<void>;
}

/**
 * Run a hook across all server plugins, fire-and-forget. Errors (sync or async)
 * are swallowed so observability never breaks the connection.
 */
export function emitServerPlugin(
    plugins: ServerPlugin[] | undefined,
    run: (plugin: ServerPlugin) => unknown,
): void {
    if (!plugins || plugins.length === 0) return;
    for (const plugin of plugins) {
        try {
            const result = run(plugin);
            if (result instanceof Promise) result.catch(() => {});
        } catch {
            // observability hooks must not break the connection
        }
    }
}
