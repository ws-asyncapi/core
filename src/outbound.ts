/**
 * Outbound (server-initiated) RPC bookkeeping for a single connection.
 *
 * The wire protocol is symmetric: the server can send a {@link Frame.Request} to
 * a client and await its {@link Frame.Reply}/{@link Frame.Error}, exactly like a
 * client does in the other direction. This holds the per-connection correlation
 * counter + pending table for those server→client requests. One instance lives
 * per connection (so a reply in a later message resolves the original promise).
 */
import { type AnyFrame, Frame, RpcError } from "./wire.ts";

interface Pending {
    resolve: (value: unknown) => void;
    reject: (error: RpcError) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class OutboundRpc {
    #seq = 0;
    #pending = new Map<number, Pending>();

    /** Send a request to the peer and resolve when its reply arrives. */
    request(
        send: (frame: AnyFrame) => void,
        name: string,
        input: unknown,
        timeout: number,
    ): Promise<unknown> {
        const corrId = ++this.#seq;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(corrId);
                reject(
                    new RpcError(
                        "TIMEOUT",
                        `server RPC "${name}" timed out after ${timeout}ms`,
                    ),
                );
            }, timeout);
            this.#pending.set(corrId, { resolve, reject, timer });
            send([Frame.Request, name, corrId, input]);
        });
    }

    /** Resolve the pending request for `corrId` (on an inbound Reply). */
    resolve(corrId: number, value: unknown): void {
        const p = this.#pending.get(corrId);
        if (!p) return;
        clearTimeout(p.timer);
        this.#pending.delete(corrId);
        p.resolve(value);
    }

    /** Reject the pending request for `corrId` (on an inbound Error). */
    reject(corrId: number, error: RpcError): void {
        const p = this.#pending.get(corrId);
        if (!p) return;
        clearTimeout(p.timer);
        this.#pending.delete(corrId);
        p.reject(error);
    }

    /** Reject everything in flight (on disconnect). */
    rejectAll(error: RpcError): void {
        for (const [, p] of this.#pending) {
            clearTimeout(p.timer);
            p.reject(error);
        }
        this.#pending.clear();
    }
}
