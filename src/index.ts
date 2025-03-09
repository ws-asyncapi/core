import type { Static, TObject, TSchema } from "@sinclair/typebox";
import type { ChannelObject } from "asyncapi-types";
import type {
    BeforeUpgradeHandler,
    ExtractRouteParams,
    MessageHandler,
    MessageHandlerSchema,
    OnOpenHandler,
    RequestData,
} from "./types.ts";
import type {
    WebSocketImplementation,
    WebsocketDataType,
} from "./websocket.ts";

export * from "./async-api/index.ts";
export * from "./websocket.ts";
export * from "./types.ts";

// biome-ignore lint/suspicious/noExplicitAny: AnyChannel type
export type AnyChannel = Channel<any, any, any, any, any, any, any, any>;

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
        server: new Map<string, TSchema>(),
        query: undefined as TObject | undefined,
        headers: undefined as TObject | undefined,
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
        globalPublish: undefined as
            | ((topic: any, type: any, message: any) => void)
            | undefined,
        beforeUpgrade: undefined as
            | BeforeUpgradeHandler<Query, Headers, Params, Data>
            | undefined,
    };
    constructor(
        public address: Path,
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
        Topics,
        Path,
        Params
    > {
        this["~"].query = query;

        return this as any;
    }

    headers<HeadersObject extends TObject>(
        headers: HeadersObject,
    ): Channel<
        Query,
        Static<HeadersObject>,
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params
    > {
        this["~"].headers = headers;

        return this as any;
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
        Topics,
        Path,
        Params
    > {
        this["~"].server.set(name, validation);

        return this as any;
    }

    clientMessage<Validation extends TSchema, Message = Static<Validation>>(
        name: string,
        handler: MessageHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
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
        WebsocketClientData,
        WebsocketServerData,
        Topics,
        Path,
        Params
    > {
        this["~"].client.set(name, { handler, validation });

        return this as any;
    }

    onOpen(
        handler: OnOpenHandler<
            {
                client: WebsocketClientData;
                server: WebsocketServerData;
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
        T,
        Path,
        Params
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
        Data & DataThis
    > {
        // @ts-expect-error
        this["~"].beforeUpgrade = handler;

        return this as any;
    }
}
