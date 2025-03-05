import { Type } from "@sinclair/typebox";
import type {
    AsyncAPIObject,
    ChannelBindingsObject,
    ChannelsObject,
    OperationsObject,
    ParameterObject,
} from "asyncapi-types";
import type { AnyChannel } from "../index.ts";
import {
    getPathParams,
    toChannelExpression,
    toLibrarySpec,
    toPascalCase,
} from "../utils.ts";

export function getAsyncApiDocument(
    channelsRaw: AnyChannel[],
    schema: Partial<AsyncAPIObject>,
): AsyncAPIObject {
    const channels: ChannelsObject = {};
    const operations: OperationsObject = {};

    for (const channel of channelsRaw) {
        const wsBinding: ChannelBindingsObject["ws"] = {
            bindingVersion: "latest",
        };

        const parameters: Record<string, ParameterObject> = {};

        if (channel["~"].query) {
            wsBinding.query = channel["~"].query;
        }

        if (channel["~"].headers) {
            wsBinding.headers = channel["~"].headers;
        }

        const pathParams = getPathParams(channel.address);

        // if (pathParams.length > 0) {
        //     wsBinding["x-parameters"] = pathParams.map((param) => ({
        //         name: param,
        //         in: "path",
        //         required: true,
        //     }));
        // }

        for (const param of pathParams) {
            parameters[param] = {};
        }

        channels[channel.name] = {
            address: toChannelExpression(channel.address),
            bindings: {
                ws: wsBinding,
            },
            parameters,
        };

        if (channel["~"].server.size > 0) {
            for (const [name, validation] of channel["~"].server) {
                operations[toPascalCase(`${channel.name}_${name}`)] = {
                    action: "send",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: validation
                        ? [{ payload: toLibrarySpec(name, validation) }]
                        : [],
                    "x-ws-asyncapi-operation": 1,
                };
            }
        }

        if (channel["~"].client.size > 0) {
            for (const [name, { validation }] of channel["~"].client) {
                operations[toPascalCase(`${channel.name}_${name}`)] = {
                    action: "receive",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: [
                        {
                            payload: toLibrarySpec(
                                name,
                                validation ?? Type.Any(),
                            ),
                        },
                    ],
                    "x-ws-asyncapi-operation": 1,
                };
            }
        }
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
            ...operations,
            ...schema.operations,
        },
        ...schema,
    };
}
