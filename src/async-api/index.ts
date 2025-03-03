import type {
    AsyncAPIObject,
    ChannelBindingsObject,
    ChannelsObject,
} from "asyncapi-types";
import type { AnyChannel } from "../index.ts";
import { getPathParams } from "../utils.ts";
export function getAsyncApiDocument(
    channelsRaw: AnyChannel[],
    schema: Partial<AsyncAPIObject>,
): AsyncAPIObject {
    const channels: ChannelsObject = {};

    for (const channel of channelsRaw) {
        const wsBinding: ChannelBindingsObject["ws"] = {
            bindingVersion: "latest",
        };

        if (channel["~"].query) {
            wsBinding.query = channel["~"].query;
        }

        if (channel["~"].headers) {
            wsBinding.headers = channel["~"].headers;
        }

        const pathParams = getPathParams(channel.address);

        if (pathParams.length > 0) {
            wsBinding["x-parameters"] = pathParams.map((param) => ({
                name: param,
                in: "path",
                required: true,
            }));
        }

        channels[channel.address] = {
            address: channel.address,
            bindings: {
                ws: wsBinding,
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
