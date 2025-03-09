import type { Static, TObject, TSchema } from "@sinclair/typebox";
import type { ChannelObject } from "asyncapi-types";
import type {
    MessageHandler,
    MessageHandlerSchema,
    OnOpenHandler,
} from "./types.ts";
import type {
    WebSocketImplementation,
    WebsocketDataType,
} from "./websocket.ts";

export * from "./async-api/index.ts";
export * from "./websocket.ts";
export * from "./types.ts";

// biome-ignore lint/suspicious/noExplicitAny: AnyChannel type
export type AnyChannel = Channel<any, any>;

// TODO: maybe use `defineOperation`
export class Channel<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    WebsocketClientData extends WebsocketDataType["client"] = {},
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    WebsocketServerData extends WebsocketDataType["server"] = {},
    Topics extends string = string,
> {
    public "~" = {
        client: new Map<
            string,
            MessageHandlerSchema<WebsocketDataType, Topics, any>
        >(),
        server: new Map<string, TSchema>(),
        query: undefined as TObject | undefined,
        headers: undefined as TObject | undefined,
        onOpen: undefined as
            | ((ws: WebSocketImplementation<WebsocketDataType, Topics>) => void)
            | undefined,
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
            Topics,
            Message
        >,
        validation?: Validation,
    ): this {
        this["~"].client.set(name, { handler, validation });

        return this;
    }

    onOpen(handler: OnOpenHandler<WebsocketDataType, Topics>): this {
        this["~"].onOpen = handler;

        return this;
    }
}
