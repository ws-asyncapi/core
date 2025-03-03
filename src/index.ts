import type { Static, TObject, TSchema, Type } from "@sinclair/typebox";
import type { ChannelObject, SchemaObject } from "asyncapi-types";

type MessageHandler = (message: any) => void;
interface MessageHandlerSchema {
    handler: MessageHandler;
    validation?: TSchema;
}

// TODO: maybe use `defineOperation`
export class Channel<
    Query extends any | undefined,
    Headers extends any | undefined,
> {
    public "~" = {
        client: new Map<string, MessageHandlerSchema>(),
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

    clientMessage(
        name: string,
        handler: MessageHandler,
        validation?: TSchema,
    ): this {
        this["~"].client.set(name, { handler, validation });

        return this;
    }
}
