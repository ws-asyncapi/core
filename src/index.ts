import type { Static, TObject, TSchema, Type } from "@sinclair/typebox";
import type { ChannelObject, SchemaObject } from "asyncapi-types";
import type { MaybePromise } from "./utils.ts";
import type {
    WebSocketImplementation,
    WebsocketDataType,
} from "./websocket.ts";
export * from "./async-api/index.ts";
export * from "./websocket.ts";

type MessageHandler<WebsocketData extends WebsocketDataType, Message> = (data: {
    ws: WebSocketImplementation<WebsocketData>;
    message: Message;
}) => MaybePromise<void>;
interface MessageHandlerSchema<
    WebsocketData extends WebsocketDataType,
    Message,
> {
    handler: MessageHandler<WebsocketData, Message>;
    validation?: TSchema;
}

// biome-ignore lint/suspicious/noExplicitAny: AnyChannel type
export type AnyChannel = Channel<any, any>;

// TODO: maybe use `defineOperation`
export class Channel<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    WebsocketClientData extends WebsocketDataType["client"] = {},
    WebsocketServerData extends WebsocketDataType["server"] = {},
> {
    public "~" = {
        client: new Map<string, MessageHandlerSchema<WebsocketDataType, any>>(),
        server: new Map<string, TSchema>(),
        query: undefined as TObject | undefined,
        headers: undefined as TObject | undefined,
    };
    constructor(
        public address: `/${string}`,
        public name: string,
        public schema: ChannelObject = {},
    ) {}

    query<QueryObject extends TObject>(
        query: QueryObject,
    ): Channel<Static<QueryObject>, Headers> {
        this["~"].query = query;

        return this;
    }

    headers<HeadersObject extends TObject>(
        headers: HeadersObject,
    ): Channel<Query, Static<HeadersObject>> {
        this["~"].headers = headers;

        return this;
    }

    serverMessage<Name extends string, Validation extends TSchema>(
        name: Name,
        validation: Validation,
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData & {
            [k in Name]: Static<Validation>;
        }
    > {
        this["~"].server.set(name, validation);

        return this;
    }

    clientMessage<Validation extends TSchema, Message = Static<Validation>>(
        name: string,
        handler: MessageHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
            },
            Message
        >,
        validation?: Validation,
    ): this {
        this["~"].client.set(name, { handler, validation });

        return this;
    }
}
