import type { TSchema } from "@sinclair/typebox";
import type { AnyChannel, Channel } from "./index.ts";
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
    validation?: TSchema;
}

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
        infer Data
    >
        ? WebSocketImplementation<
              {
                  client: WebsocketClientData;
                  server: WebsocketServerData;
              },
              Topics
          >
        : never;
