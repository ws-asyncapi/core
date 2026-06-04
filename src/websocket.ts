export interface WebsocketDataType {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    client: Record<string, any>;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    server: Record<string, any>;
    /** server→client (acknowledged) RPCs: `{ input; output }` per name */
    // biome-ignore lint/suspicious/noExplicitAny: per-channel shapes
    serverRpc?: Record<string, { input: any; output: any }>;
}

export abstract class WebSocketImplementation<
    WebsocketData extends WebsocketDataType,
    Topics,
> {
    abstract send<T extends keyof WebsocketData["server"]>(
        type: T,
        ...data: WebsocketData["server"][T] extends never
            ? []
            : [WebsocketData["server"][T]]
    ): void;

    /** Low-level: encode and send any wire frame (used by the dispatcher). */
    // biome-ignore lint/suspicious/noExplicitAny: AnyFrame from ./wire.ts
    abstract sendFrame(frame: any): void;

    /** Low-level: send already-encoded bytes (used to replay buffered frames). */
    abstract sendRaw(data: string | Uint8Array): void;

    /**
     * Server→client RPC: ask this client and await its typed reply. Mirrors the
     * client's `request()` in the other direction. Rejects with an `RpcError`
     * on the client throwing, a timeout, or disconnect.
     */
    abstract request<
        Name extends keyof NonNullable<WebsocketData["serverRpc"]>,
    >(
        name: Name,
        input: NonNullable<WebsocketData["serverRpc"]>[Name]["input"],
        options?: { timeout?: number },
    ): Promise<NonNullable<WebsocketData["serverRpc"]>[Name]["output"]>;

    /** Connection-unique socket id (used for room membership / presence). */
    abstract readonly id: string;

    abstract subscribe(topic: Topics): void;
    abstract unsubscribe(topic: Topics): void;
    abstract isSubscribed(topic: Topics): boolean;
    abstract publish<T extends keyof WebsocketData["server"]>(
        topic: Topics,
        type: T,
        ...data: WebsocketData["server"][T] extends never
            ? []
            : [WebsocketData["server"][T]]
    ): void;

    /** Cluster-wide socket ids currently in `topic` (presence / fetchSockets). */
    abstract roomMembers(topic: Topics): Promise<string[]>;

    abstract close(code?: number, reason?: string): void;
}
