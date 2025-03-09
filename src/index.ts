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
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            MessageHandlerSchema<WebsocketDataType, Topics, any>
        >(),
        server: new Map<string, TSchema>(),
        query: undefined as TObject | undefined,
        headers: undefined as TObject | undefined,
        onOpen: undefined as
            | ((ws: WebSocketImplementation<WebsocketDataType, Topics>) => void)
            | undefined,
        globalPublish: undefined as
            | ((topic: any, type: any, message: any) => void)
            | undefined,
    };
    constructor(
        public address: `/${string}`,
        public name: string,
        public schema: ChannelObject = {},
    ) {}

    query<QueryObject extends TObject>(
        query: QueryObject,
    ): Channel<
        Static<QueryObject>,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics
    > {
        this["~"].query = query;

        return this;
    }

    headers<HeadersObject extends TObject>(
        headers: HeadersObject,
    ): Channel<
        Query,
        Static<HeadersObject>,
        WebsocketClientData,
        WebsocketServerData,
        Topics
    > {
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
        },
        Topics
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
    ): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        Topics
    > {
        this["~"].client.set(name, { handler, validation });

        return this;
    }

    onOpen(handler: OnOpenHandler<WebsocketDataType, Topics>): this {
        this["~"].onOpen = handler;

        return this;
    }

    /**
     * ! Be careful this `public` method does not see to what channel it belongs to.
     * This function can be changed in the near future.
     */
    publish<Name extends string>(
        topic: Topics,
        name: Name,
        message: WebsocketServerData[Name],
    ): void {
        if (!this["~"].globalPublish) {
            console.error(
                "Adapter does not support global publish or not initialized",
            );

            return;
        }

        this["~"].globalPublish(topic, name, message);
    }

    /**
     * This function can be changed in the near future.
     */
    $typeChannels<T extends string>(): Channel<
        Query,
        Headers,
        WebsocketClientData,
        WebsocketServerData,
        T
    > {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        return this as any;
    }
}
