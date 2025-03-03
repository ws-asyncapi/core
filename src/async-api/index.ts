import type { AsyncAPIObject, ChannelsObject } from "asyncapi-types";
import type { Channel } from "../index.ts";

export function getAsyncApiDocument(
    channelsRaw: Channel[],
    schema: Partial<AsyncAPIObject>,
): AsyncAPIObject {
    const channels: ChannelsObject = {};

    for (const channel of channelsRaw) {
        channels[channel.address] = {
            address: channel.address,
            bindings: {
                ws: {
                    query: channel["~"].query,
                    headers: channel["~"].headers,
                },
            },
        };
    }

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
            ...channels,
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
