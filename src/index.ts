import type { ChannelObject } from "asyncapi-types";
import type { NodeCommand } from "./command.ts";
import { type Connection, perSocketRoom } from "./dispatch.ts";
import type { AnySchema, InferIn, InferOut } from "./schema.ts";
import type {
    AuthHandler,
    BeforeUpgradeHandler,
    ExtractRouteParams,
    MessageHandler,
    MessageHandlerSchema,
    OnCloseHandler,
    OnOpenHandler,
    RequestData,
    RpcHandler,
    StreamHandler,
} from "./types.ts";
import type { WebsocketDataType } from "./websocket.ts";
import type { AnyFrame } from "./wire.ts";

export * from "./async-api/index.ts";
export * from "./websocket.ts";
export * from "./types.ts";
export * from "./wire.ts";
export * from "./backplane.ts";
export * from "./schema.ts";
export * from "./dispatch.ts";
export * from "./outbound.ts";
export * from "./emit.ts";
export * from "./command.ts";
export * from "./idempotency.ts";
export * from "./contract.ts";
export * from "./stream.ts";

// biome-ignore lint/suspicious/noExplicitAny: AnyChannel type
export type AnyChannel = Channel<
    // biome-ignore format: 13 positional anys
    any, any, any, any, any, any, any, any, any, any, any, any, any
>;

/**
 * Turn a channel address into the literal pattern a client connects to:
 * `"/chat/:room"` → `` `/chat/${string}` ``.
 */
export type AddressPattern<P extends string> =
    P extends `${infer Head}:${string}/${infer Rest}`
        ? `${Head}${string}/${AddressPattern<Rest>}`
        : P extends `${infer Head}:${string}`
          ? `${Head}${string}`
          : P;

/**
 * Derive the typed client shape directly from a server {@link Channel} type —
 * no codegen. Use with `typeof channel`:
 *
 * ```ts
 * import { createClient } from "@ws-asyncapi/client";
 * const client = createClient<typeof chat>("ws://localhost:3000", "/chat/1");
 * ```
 *
 * Yields `{ commandMap, eventMap, rpcMap, query, headers, address }` — the same
 * contract the CLI-generated `WebsocketAsyncAPIMap` provides, inferred instead.
 */
export type InferClient<C extends AnyChannel> = C extends Channel<
    infer Query,
    infer Headers,
    infer ClientData,
    infer ServerData,
    // biome-ignore lint/correctness/noUnusedVariables: positional infer
    infer _Topics,
    infer Path,
    // biome-ignore lint/correctness/noUnusedVariables: positional infer
    infer _Params,
    // biome-ignore lint/correctness/noUnusedVariables: positional infer
    infer _Data,
    infer RpcMap,
    infer ServerRpcMap,
    infer StreamMap,
    infer AuthCredentials,
    infer PresenceState
>
    ? {
          query: Query;
          headers: Headers;
          /** commands the client sends (client→server, fire-and-forget) */
          commandMap: ClientData;
          /** events the client receives (server→client) */
          eventMap: ServerData;
          /** request/response RPCs the client calls: `{ input; output; errors }` */
          rpcMap: RpcMap;
          /** server→client RPCs the client answers: `{ input; output }` per name */
          serverRpcMap: ServerRpcMap;
          /** server→client streams the client consumes: `{ input; output }` per name */
          streamMap: StreamMap;
          /** credentials accepted by `client.authenticate(...)` (`.onAuth` input) */
          authCredentials: AuthCredentials;
          /** per-member presence state shape (`.presence` schema), or `never` */
          presenceState: PresenceState;
          /** the literal address pattern, e.g. `` `/chat/${string}` `` */
          address: Path extends string ? AddressPattern<Path> : string;
      }
    : never;

/** A socket as seen by server-side listing (`channel.fetchSockets`). */
export interface RemoteSocketInfo {
    id: string;
    /** rooms (topics) the socket is in, excluding its reserved per-socket room */
    rooms: string[];
}

/** Stored RPC definition (input/output schemas + handler) on a channel. */
export interface RpcDefinition {
    input: AnySchema;
    output: AnySchema;
    /**
     * Declared, recoverable error codes for this RPC, each with the schema of
     * its `data` payload. Surfaced in the contract + generated client so the
     * caller gets a typed, discriminated error union (see {@link Channel.rpc}).
     */
    errors?: Record<string, AnySchema>;
    // biome-ignore lint/suspicious/noExplicitAny: stored handler is type-erased
    handler: RpcHandler<any, any, any, any, any, any, any, any>;
}

/** Stored server→client RPC definition (input/output schemas only; the handler
 *  lives on the client). Used by the doc generator to emit the contract. */
export interface ServerRpcDefinition {
    input: AnySchema;
    output: AnySchema;
}

/** Stored stream definition (input/output schemas + async-generator handler). */
export interface StreamDefinition {
    input: AnySchema;
    output: AnySchema;
    // biome-ignore lint/suspicious/noExplicitAny: stored handler is type-erased
    handler: StreamHandler<any, any, any, any, any, any, any, any>;
}

// TODO: maybe use `defineOperation`
export class Channel<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    WebsocketClientData extends WebsocketDataType["client"] = {},
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    WebsocketServerData extends WebsocketDataType["server"] = {},
    Topics extends string = string,
    Path extends `/${string}` = `/${string}`,
    Params extends unknown | undefined = ExtractRouteParams<Path>,
    Data extends unknown | undefined = {},
    // 9th generic: accumulated RPC map (name -> { input; output; errors }).
    RpcMap extends Record<
        string,
        { input: unknown; output: unknown; errors: Record<string, unknown> }
        // biome-ignore lint/complexity/noBannedTypes: <explanation>
    > = {},
    // 10th generic: accumulated server->client RPC map (name -> { input; output }).
    ServerRpcMap extends Record<
        string,
        { input: unknown; output: unknown }
        // biome-ignore lint/complexity/noBannedTypes: <explanation>
    > = {},
    // 11th generic: accumulated stream map (name -> { input; output }).
    StreamMap extends Record<
        string,
        { input: unknown; output: unknown }
        // biome-ignore lint/complexity/noBannedTypes: <explanation>
    > = {},
    // 12th generic: credentials accepted by `.onAuth` / `client.authenticate`.
    // `undefined` until `.onAuth` is declared (the channel rejects refresh).
    AuthCredentials = undefined,
    // 13th generic: per-member presence state (`.presence` schema). `undefined`
    // until `.presence` is declared (the channel has no presence subsystem).
    PresenceState = undefined,
> {
    public "~" = {
        client: new Map<
            string,
            MessageHandlerSchema<
                WebsocketDataType,
                Topics,
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                any,
                Query,
                Headers,
                Params,
                Data
            >
        >(),
        server: new Map<string, AnySchema | undefined>(),
        rpc: new Map<string, RpcDefinition>(),
        serverRpc: new Map<string, ServerRpcDefinition>(),
        stream: new Map<string, StreamDefinition>(),
        // per-room history retention: event name -> how many to keep (.history)
        history: new Map<string, number>(),
        // live local sockets on this channel (for server-side admin ops)
        sockets: new Map<string, Connection>(),
        // server↔server event handlers (serverSideEmit)
        serverEvents: new Map<string, (data: unknown) => void>(),
        // adapter-provided: publish a cross-node command on the command topic
        sendCommand: undefined as ((cmd: NodeCommand) => void) | undefined,
        query: undefined as AnySchema | undefined,
        headers: undefined as AnySchema | undefined,
        onOpen: undefined as
            | OnOpenHandler<
                  WebsocketDataType,
                  Topics,
                  Query,
                  Headers,
                  Params,
                  Data
              >
            | undefined,
        onClose: undefined as
            | OnCloseHandler<
                  WebsocketDataType,
                  Topics,
                  Query,
                  Headers,
                  Params,
                  Data
              >
            | undefined,
        // biome-ignore lint/suspicious/noExplicitAny: type-erased adapter seam
        globalPublish: undefined as
            | ((topic: any, type: any, message: any) => void)
            | undefined,
        // adapter-provided: cluster-wide socket listing (presence / fetchSockets)
        fetchSockets: undefined as
            | ((room?: string) => Promise<RemoteSocketInfo[]>)
            | undefined,
        beforeUpgrade: undefined as
            | BeforeUpgradeHandler<Query, Headers, Params, Data>
            | undefined,
        // connection-scoped context extenders (.derive / .resolve), run in order on open
        derives: [] as Array<
            (ctx: {
                request: RequestData<Query, Headers, Params>;
                // biome-ignore lint/suspicious/noExplicitAny: accumulated data
                data: any;
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            }) => any
        >,
        // per-message middleware (.beforeMessage); throwing rejects the message
        middlewares: [] as Array<
            (ctx: {
                // biome-ignore lint/suspicious/noExplicitAny: type-erased ws
                ws: any;
                type: string;
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                message: any;
                request: RequestData<Query, Headers, Params>;
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                data: any;
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            }) => any
        >,
        onError: undefined as
            | ((ctx: {
                  // biome-ignore lint/suspicious/noExplicitAny: type-erased ws
                  ws: any;
                  error: unknown;
                  type: string;
                  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                  data: any;
              }) => void)
            | undefined,
        // adapter-provided: publish a raw wire frame to a topic (presence diffs).
        // Like globalPublish but for non-Event frames, and never offset/logged.
        publishFrame: undefined as
            | ((topic: string, frame: AnyFrame, except?: string[]) => void)
            | undefined,
        // presence config (.presence): the member-state schema + a resolver that
        // derives this connection's presence room from its context (server-side,
        // so the client never names the room).
        presence: undefined as
            | {
                  state: AnySchema;
                  room: (ctx: {
                      request: RequestData<Query, Headers, Params>;
                      // biome-ignore lint/suspicious/noExplicitAny: accumulated data
                      data: any;
                  }) => string;
              }
            | undefined,
        // credential-refresh handler (.onAuth): validates fresh credentials and
        // returns context fields to merge on a live connection (token refresh)
        auth: undefined as
            | {
                  credentials: AnySchema;
                  handler: (ctx: {
                      // biome-ignore lint/suspicious/noExplicitAny: type-erased ws
                      ws: any;
                      // biome-ignore lint/suspicious/noExplicitAny: validated creds
                      credentials: any;
                      request: RequestData<Query, Headers, Params>;
                      // biome-ignore lint/suspicious/noExplicitAny: accumulated data
                      data: any;
                      // biome-ignore lint/suspicious/noExplicitAny: merged patch
                  }) => any;
              }
            | undefined,
    };
    constructor(
        public address: Path,
        public name: string,
        public schema: ChannelObject = {},
    ) {}

    query<QueryObject extends AnySchema>(
        query: QueryObject,
    ): Channel<
        InferOut<QueryObject>,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].query = query;

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    headers<HeadersObject extends AnySchema>(
        headers: HeadersObject,
    ): Channel<
        Query,
        InferOut<HeadersObject>,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].headers = headers;

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    serverMessage<
        Name extends string,
        Validation extends AnySchema | undefined = undefined,
    >(
        name: Name,
        validation?: Validation,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData & {
            [k in Name]: Validation extends AnySchema
                ? InferOut<Validation>
                : never;
        },
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].server.set(name, validation);

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    clientMessage<
        Name extends string,
        Validation extends AnySchema,
        Message = InferOut<Validation>,
    >(
        name: Name,
        handler: MessageHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            Message,
            Query,
            Headers,
            Params,
            Data
        >,
        validation?: Validation,
    ): Channel<
        Query,
        Headers,
        // accumulate the command's *input* type (what the client sends) so the
        // command map is inferable directly from the channel (codegen-free)
        WebsocketClientData & { [k in Name]: InferIn<Validation> },
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].client.set(name, { handler, validation });

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Declares a request/response message (acknowledged RPC). Unlike
     * {@link clientMessage} (fire-and-forget), the handler returns a value that
     * is validated against `output` and sent back to the caller as a typed
     * reply. The client awaits it via `client.request(name, input)`.
     *
     * Pass an optional `errors` map (code → `data` schema) to declare expected
     * failures in the contract. The handler throws
     * `new RpcError(code, message, data)`; the generated client surfaces them
     * as a typed, discriminated union via `client.safeRequest(name, input)`.
     */
    rpc<
        Name extends string,
        Input extends AnySchema,
        Output extends AnySchema,
        // biome-ignore lint/complexity/noBannedTypes: empty default for no errors
        Errors extends Record<string, AnySchema> = {},
    >(
        name: Name,
        input: Input,
        output: Output,
        handler: RpcHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            InferOut<Input>,
            InferOut<Output>,
            Query,
            Headers,
            Params,
            Data
        >,
        errors?: Errors,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap & {
            [k in Name]: {
                // `input` is what the caller sends (pre-parse); `output` is what
                // the caller receives (post-parse).
                input: InferIn<Input>;
                output: InferOut<Output>;
                errors: { [C in keyof Errors]: InferOut<Errors[C]> };
            };
        },
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].rpc.set(name, {
            input,
            output,
            errors,
            // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
            handler: handler as any,
        });

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Declares a **server→client** request/response (acknowledged RPC). The
     * server calls it on a connection via `ws.request(name, input)` and awaits
     * the client's typed reply; the client answers it with
     * `client.onRequest(name, (input) => output)`. The reverse direction of
     * {@link rpc}.
     */
    serverRpc<
        Name extends string,
        Input extends AnySchema,
        Output extends AnySchema,
    >(
        name: Name,
        input: Input,
        output: Output,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap & {
            [k in Name]: { input: InferIn<Input>; output: InferOut<Output> };
        },
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        this["~"].serverRpc.set(name, { input, output });

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Declares a **stream**: the client opens it with `client.stream(name, input)`
     * and consumes a sequence of typed values with `for await`. The handler is an
     * async generator — each `yield` is validated against `output` and pushed to
     * the client as it arrives; returning ends the stream, throwing fails it with
     * a typed error. If the consumer stops iterating (or disconnects), the handler
     * is cancelled (its `signal` aborts and the generator is `return()`-ed, so a
     * `try/finally` can clean up).
     *
     * ```ts
     * .stream("ticks", z.object({}), z.object({ n: z.number() }),
     *   async function* ({ signal }) {
     *     for (let n = 0; !signal.aborted; n++) { yield { n }; await sleep(1000); }
     *   })
     * ```
     */
    stream<Name extends string, Input extends AnySchema, Output extends AnySchema>(
        name: Name,
        input: Input,
        output: Output,
        handler: StreamHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            InferOut<Input>,
            InferOut<Output>,
            Query,
            Headers,
            Params,
            Data
        >,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap & {
            [k in Name]: { input: InferIn<Input>; output: InferOut<Output> };
        },
        AuthCredentials,
        PresenceState
    > {
        this["~"].stream.set(name, {
            input,
            output,
            // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
            handler: handler as any,
        });

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    onOpen(
        handler: OnOpenHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            Query,
            Headers,
            Params,
            Data
        >,
    ): this {
        this["~"].onOpen = handler;

        return this;
    }

    onClose(
        handler: OnCloseHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            Query,
            Headers,
            Params,
            Data
        >,
    ): this {
        this["~"].onClose = handler;

        return this;
    }

    /**
     * ! Be careful this `public` method does not see to what channel it belongs to.
     * This function can be changed in the near future.
     */
    publish<Name extends string>(
        topic: Topics,
        name: Name,
        ...message: WebsocketServerData[Name] extends never
            ? []
            : [WebsocketServerData[Name]]
    ): void {
        if (!this["~"].globalPublish) {
            console.error(
                "Adapter does not support global publish or not initialized",
            );

            return;
        }

        // @ts-expect-error variadic spread into type-erased seam
        this["~"].globalPublish(topic, name, ...message);
    }

    /**
     * Send an event to a single socket by id, anywhere in the cluster (the
     * Socket.IO `io.to(socketId).emit(...)` equivalent). Routed through the
     * socket's reserved per-socket room.
     */
    toSocket<Name extends keyof WebsocketServerData & string>(
        socketId: string,
        name: Name,
        ...message: WebsocketServerData[Name] extends never
            ? []
            : [WebsocketServerData[Name]]
    ): void {
        if (!this["~"].globalPublish) {
            console.error(
                "Adapter does not support global publish or not initialized",
            );
            return;
        }
        this["~"].globalPublish(perSocketRoom(socketId), name, message[0]);
    }

    /**
     * List sockets cluster-wide (presence). With `room`, only sockets in that
     * room; otherwise every connected socket. Returns ids + their rooms.
     */
    fetchSockets(room?: Topics): Promise<RemoteSocketInfo[]> {
        if (!this["~"].fetchSockets) return Promise.resolve([]);
        return this["~"].fetchSockets(room as string | undefined);
    }

    /** Disconnect sockets cluster-wide — all, or only those in `room`. */
    disconnectSockets(room?: Topics): void {
        this["~"].sendCommand?.({
            op: "disconnect",
            channel: this.name,
            room: (room as string | undefined) ?? null,
        });
    }

    /** Make sockets (all, or those in `room`) join `rooms`, cluster-wide. */
    socketsJoin(rooms: Topics | Topics[], room?: Topics): void {
        this["~"].sendCommand?.({
            op: "join",
            channel: this.name,
            room: (room as string | undefined) ?? null,
            rooms: (Array.isArray(rooms) ? rooms : [rooms]) as string[],
        });
    }

    /** Make sockets (all, or those in `room`) leave `rooms`, cluster-wide. */
    socketsLeave(rooms: Topics | Topics[], room?: Topics): void {
        this["~"].sendCommand?.({
            op: "leave",
            channel: this.name,
            room: (room as string | undefined) ?? null,
            rooms: (Array.isArray(rooms) ? rooms : [rooms]) as string[],
        });
    }

    /**
     * Emit an event to the **other** server nodes in the cluster (not clients).
     * Handlers are registered with {@link onServerEvent}. The emitting node does
     * not receive its own event.
     */
    serverSideEmit(event: string, data?: unknown): void {
        this["~"].sendCommand?.({
            op: "sse",
            channel: this.name,
            event,
            data,
        });
    }

    /** Handle a {@link serverSideEmit} event from another node. */
    onServerEvent<T = unknown>(
        event: string,
        handler: (data: T) => void,
    ): this {
        this["~"].serverEvents.set(event, handler as (d: unknown) => void);
        return this;
    }

    /**
     * This function can be changed in the near future.
     */
    $typeChannels<T extends string>(): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        T,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        return this as any;
    }

    beforeUpgrade<DataThis>(
        handler: BeforeUpgradeHandler<Query, Headers, Params, DataThis>,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data & DataThis,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        // @ts-expect-error handler Data variance
        this["~"].beforeUpgrade = handler;

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Extend the connection context with typed fields (auth, db handles, the
     * decoded user, ...). Runs once on open; the returned object is merged into
     * `data` and visible to every handler. Chainable — each call widens `data`.
     */
    derive<Derived extends Record<string, unknown>>(
        fn: (ctx: {
            request: RequestData<Query, Headers, Params>;
            data: Data;
        }) => Derived,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data & Derived,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
        this["~"].derives.push(fn as any);

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /** Async variant of {@link derive} (e.g. fetch the user from a token). */
    resolve<Derived extends Record<string, unknown>>(
        fn: (ctx: {
            request: RequestData<Query, Headers, Params>;
            data: Data;
        }) => Promise<Derived>,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data & Derived,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        PresenceState
    > {
        // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
        this["~"].derives.push(fn as any);

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Declares **mid-connection credential refresh**. A WebSocket can outlive
     * its initial bearer token; `.onAuth` lets the client present fresh
     * credentials on the *live* connection (via `client.authenticate(creds)`)
     * without dropping and re-handshaking.
     *
     * `credentials` validates the incoming payload; the handler receives the
     * parsed credentials plus the current context, and returns the fields to
     * merge into that context (typically the re-decoded user) — visible to every
     * subsequent handler. Throw `new RpcError(code, message, data)` to reject the
     * refresh; the client's `authenticate` promise rejects with that typed error.
     *
     * The resilient client also re-sends the last credentials automatically
     * after a reconnect, so the refreshed identity survives transient drops.
     *
     * ```ts
     * .resolve(async ({ request }) => ({ user: await verify(request.headers.token) }))
     * .onAuth(z.object({ token: z.string() }), async ({ credentials }) => ({
     *   user: await verify(credentials.token), // replaces the stale user
     * }))
     * ```
     */
    onAuth<Creds extends AnySchema>(
        credentials: Creds,
        handler: AuthHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
                serverRpc: ServerRpcMap;
            },
            Topics,
            InferOut<Creds>,
            Query,
            Headers,
            Params,
            Data
        >,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        InferIn<Creds>,
        PresenceState
    > {
        this["~"].auth = {
            credentials,
            // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
            handler: handler as any,
        };

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Enables **typed presence** — a per-room roster of who's connected and their
     * live state (cursor, status, "typing…"). `state` is the per-member state
     * schema, typed end-to-end. Each connection belongs to one **presence room**,
     * derived server-side (so the client never names a room): by default the
     * connection's concrete address (`/doc/:id` → `#presence:/doc/42`); override
     * with `options.room` to key it however you like.
     *
     * The client drives it with `client.presence.set(state)` / `.subscribe(cb)` /
     * `.clear()`; join/leave/update diffs ride the normal room fan-out, so it
     * works across a cluster for free, and a (re)connecting client fetches the
     * current roster via a snapshot (backed by `backplane.getPresence`).
     *
     * ```ts
     * .presence(z.object({ name: z.string(), typing: z.boolean() }))
     * // client:
     * client.presence.set({ name: "Alice", typing: false });
     * client.presence.subscribe((members) => render(members)); // Map<id, state>
     * ```
     */
    presence<State extends AnySchema>(
        state: State,
        options?: {
            room?: (ctx: {
                request: RequestData<Query, Headers, Params>;
                data: Data;
            }) => string;
        },
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params,
        Data,
        RpcMap,
        ServerRpcMap,
        StreamMap,
        AuthCredentials,
        InferOut<State>
    > {
        const address = this.address;
        this["~"].presence = {
            state,
            room:
                // biome-ignore lint/suspicious/noExplicitAny: ctx is type-erased here
                (options?.room as ((ctx: any) => string) | undefined) ??
                // default: the connection's concrete address, e.g. `#presence:/doc/42`
                ((ctx: {
                    request: RequestData<Query, Headers, Params>;
                }) => {
                    const params = (ctx.request.params ?? {}) as Record<
                        string,
                        string
                    >;
                    const filled = address.replace(
                        /:([^/]+)/g,
                        (_m, p: string) => params[p] ?? "",
                    );
                    return `#presence:${filled}`;
                }),
        };

        // biome-ignore lint/suspicious/noExplicitAny: builder return cast
        return this as any;
    }

    /**
     * Retains recent events of `name` per room (**history / rewind**), so a
     * (re)connecting client can fetch a backlog with `client.history(room)` —
     * the chat-backlog / last-N-ticks pattern. Different from
     * connection-state-recovery (which replays only *your* gap during a brief
     * blip): history is room-scoped and any subscribed client can read it.
     *
     * Call once per event you want retained; `keep` bounds the per-room buffer
     * (default 100). Retention is in the backplane (in-memory for
     * `LocalBackplane`); a client can only read history for rooms it is in.
     *
     * ```ts
     * .serverMessage("message", z.object({ text: z.string() }))
     * .history("message", { keep: 50 })
     * // client: const recent = await client.history("room:42", { limit: 50 });
     * ```
     */
    history<Name extends keyof WebsocketServerData & string>(
        name: Name,
        options?: { keep?: number },
    ): this {
        this["~"].history.set(name, options?.keep ?? 100);
        return this;
    }

    /**
     * Per-message middleware (auth, rate-limit, logging). Runs before each
     * command/rpc handler. Throw to reject: on an rpc the caller receives a
     * typed Error frame; on a command it routes to {@link onError}.
     */
    beforeMessage(
        fn: (ctx: {
            ws: import("./websocket.ts").WebSocketImplementation<
                {
                    client: WebsocketClientData;
                    server: WebsocketServerData;
                    serverRpc: ServerRpcMap;
                },
                Topics
            >;
            type: string;
            message: unknown;
            request: RequestData<Query, Headers, Params>;
            data: Data;
        }) => unknown,
    ): this {
        // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
        this["~"].middlewares.push(fn as any);

        return this;
    }

    /** Handle errors thrown by command handlers or middleware. */
    onError(
        fn: (ctx: {
            ws: import("./websocket.ts").WebSocketImplementation<
                {
                    client: WebsocketClientData;
                    server: WebsocketServerData;
                    serverRpc: ServerRpcMap;
                },
                Topics
            >;
            error: unknown;
            type: string;
            data: Data;
        }) => void,
    ): this {
        // biome-ignore lint/suspicious/noExplicitAny: stored type-erased
        this["~"].onError = fn as any;

        return this;
    }
}
