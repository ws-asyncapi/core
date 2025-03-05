import type { Static, TObject, TSchema, Type } from "@sinclair/typebox";
import type { ChannelObject, SchemaObject } from "asyncapi-types";
import type { MaybePromise } from "./utils.ts";

export * from "./async-api/index.ts";

type MessageHandler<Message> = (data: {
    ws: any;
    message: Message;
}) => MaybePromise<void>;
interface MessageHandlerSchema<Message> {
    handler: MessageHandler<Message>;
    validation?: TSchema;
}

// biome-ignore lint/suspicious/noExplicitAny: AnyChannel type
export type AnyChannel = Channel<any, any>;

// TODO: maybe use `defineOperation`
export class Channel<
    Query extends unknown | undefined,
    Headers extends unknown | undefined,
> {
    public "~" = {
        client: new Map<string, MessageHandlerSchema<any>>(),
        server: new Map<string, TSchema>(),
        query: undefined as TObject | undefined,
        headers: undefined as TObject | undefined,
    };
    constructor(
        public address: `/${string}`,
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

    serverMessage(name: string, validation: TSchema): this {
        this["~"].server.set(name, validation);

        return this;
    }

    clientMessage<Validation extends TSchema, Message = Static<Validation>>(
        name: string,
        handler: MessageHandler<Message>,
        validation?: Validation,
    ): this {
        this["~"].client.set(name, { handler, validation });

        return this;
    }
}
