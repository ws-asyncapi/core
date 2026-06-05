import type { AnyChannel, Channel } from "./index.ts";
import type { AnySchema } from "./schema.ts";
import type {
    WebSocketImplementation,
    WebsocketDataType,
} from "./websocket.ts";

export type MaybePromise<T> = T | Promise<T>;

export interface WebsocketClientData<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data extends unknown | undefined,
> {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    request: RequestData<Query, Headers, Params>;
    data: Data;
}

export type OnOpenHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data extends unknown | undefined,
> = (
    data: WebsocketClientData<
        WebsocketData,
        Topics,
        Query,
        Headers,
        Params,
        Data
    >,
) => MaybePromise<void>;

// equal to OnOpenHandler
export type OnCloseHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data extends unknown | undefined,
> = (
    data: WebsocketClientData<
        WebsocketData,
        Topics,
        Query,
        Headers,
        Params,
        Data
    >,
) => MaybePromise<void>;

export interface RequestData<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
> {
    query: Query;
    headers: Headers;
    params: Params;
}

export type MessageHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> = (data: {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    message: Message;
    request: RequestData<Query, Headers, Params>;
    data: Data;
}) => MaybePromise<void>;
export interface MessageHandlerSchema<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> {
    handler: MessageHandler<
        WebsocketData,
        Topics,
        Message,
        Query,
        Headers,
        Params,
        Data
    >;
    validation?: AnySchema;
}

/**
 * Handler for an RPC (`.rpc()`) message. Identical context to
 * {@link MessageHandler}, but it returns a value that is sent back to the
 * caller as the typed reply.
 */
export type RpcHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
    Output,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> = (data: {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    message: Message;
    request: RequestData<Query, Headers, Params>;
    data: Data;
}) => MaybePromise<Output>;

/**
 * Handler for a stream (`.stream()`). Same context as {@link RpcHandler}, but it
 * returns an async iterable (typically an `async function*`) whose yielded values
 * are each validated against `output` and pushed to the client as they arrive.
 * The client consumes them with `for await`. If the consumer stops iterating, the
 * iterator is `return()`-ed so a `try/finally` in the generator can clean up.
 */
export type StreamHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
    Output,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> = (data: {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    message: Message;
    request: RequestData<Query, Headers, Params>;
    data: Data;
    /** aborts when the client cancels or disconnects — wire long tasks to it */
    signal: AbortSignal;
}) => AsyncIterable<Output>;

/**
 * Handler for credential refresh (`.onAuth()`). Runs when a client sends fresh
 * credentials on a live connection (an {@link import("./wire.ts").Frame.Auth}
 * frame). It receives the validated `credentials` plus the current context and
 * returns the fields to merge into that context (e.g. the re-decoded user), or
 * throws an {@link import("./wire.ts").RpcError} to reject the refresh.
 */
export type AuthHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Credentials,
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> = (data: {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    credentials: Credentials;
    request: RequestData<Query, Headers, Params>;
    data: Data;
    // biome-ignore lint/suspicious/noConfusingVoidType: void = leave context as-is
}) => MaybePromise<Partial<Data> | Record<string, unknown> | void>;

export type ExtractRouteParams<T> =
    T extends `${string}:${infer Param}/${infer Rest}`
        ? { [K in Param]: string } & ExtractRouteParams<Rest>
        : T extends `${string}:${infer Param}`
          ? { [K in Param]: string }
          : T extends `${string}*`
            ? {}
            : {};

export type BeforeUpgradeHandler<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    Params extends unknown | undefined,
    Data,
> = (
    request: RequestData<Query, Headers, Params>,
    // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
) => MaybePromise<void | Response | Data>;

export type GetWebSocketType<ChannelThis extends AnyChannel> =
    ChannelThis extends Channel<
        infer Query,
        infer Headers,
        infer WebsocketClientData,
        infer WebsocketServerData,
        infer Topics,
        infer Path,
        infer Params,
        infer Data,
        // biome-ignore lint/correctness/noUnusedVariables: 9th slot (RpcMap), unused here
        infer _RpcMap,
        infer ServerRpcMap,
        // biome-ignore lint/correctness/noUnusedVariables: 11th slot (StreamMap), unused here
        infer _StreamMap,
        // biome-ignore lint/correctness/noUnusedVariables: 12th slot (AuthCredentials), unused here
        infer _AuthCredentials,
        // biome-ignore lint/correctness/noUnusedVariables: 13th slot (PresenceState), unused here
        infer _PresenceState
    >
        ? WebSocketImplementation<
              {
                  client: WebsocketClientData;
                  server: WebsocketServerData;
                  serverRpc: ServerRpcMap;
              },
              Topics
          >
        : never;
