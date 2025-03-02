import type { AsyncAPIObject } from "asyncapi-types";

export function getAsyncApiDocument(
    instance: never,
    schema: Partial<AsyncAPIObject>,
): AsyncAPIObject {
    return {
        "x-ws-asyncapi": true,
        asyncapi: "3.0.0",
        info: {
            title: "AsyncAPI",
            version: "1.0.0",
            description: "AsyncAPI",
            ...schema.info,
        },
        servers: {
            ...schema.servers,
        },
        channels: {
            ...schema.channels,
        },
        components: {
            ...schema.components,
        },
        operations: {
            ...schema.operations,
        },
        ...schema,
    };
}
