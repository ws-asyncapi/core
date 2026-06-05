import { Type } from "@sinclair/typebox";
import type {
    AsyncAPIObject,
    ChannelBindingsObject,
    ChannelObject,
    ChannelsObject,
    MessageObject,
    OperationsObject,
    ParameterObject,
} from "asyncapi-types";
import { contractHash } from "../contract.ts";
import type { AnyChannel } from "../index.ts";
import {
    getPathParams,
    toChannelExpression,
    toLibrarySpec,
    toPascalCase,
} from "../utils.ts";

export * from "./ui.ts";

export function getAsyncApiDocument(
    channelsRaw: AnyChannel[],
    schema: Partial<AsyncAPIObject> = {},
): AsyncAPIObject {
    const channels: ChannelsObject = {};
    const operations: OperationsObject = {};

    for (const channel of channelsRaw) {
        const wsBinding: ChannelBindingsObject["ws"] = {
            bindingVersion: "0.1.0",
        };

        const parameters: Record<string, ParameterObject> = {};
        const messages: Record<string, MessageObject> = {};

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
            title: channel.name,
            bindings: {
                ws: wsBinding,
            },
            messages,
            parameters,
            // contract hash for handshake version negotiation; the generated
            // client embeds this so it can detect drift against the server.
            "x-ws-asyncapi-contract-hash": contractHash(channel),
        } as ChannelsObject[string];

        // Operation keys are `${channel}_${name}`, so a name reused across
        // server/client/rpc would silently overwrite another operation in the
        // doc. Reject collisions up front.
        const allNames = [
            ...channel["~"].server.keys(),
            ...channel["~"].client.keys(),
            ...channel["~"].rpc.keys(),
            ...channel["~"].serverRpc.keys(),
            ...channel["~"].stream.keys(),
        ];
        const duplicates = [
            ...new Set(allNames.filter((n, i) => allNames.indexOf(n) !== i)),
        ];
        if (duplicates.length > 0) {
            throw new Error(
                `Channel "${channel.name}" has duplicate message names across serverMessage/clientMessage/rpc/stream: ${duplicates.join(", ")}`,
            );
        }

        if (channel["~"].server.size > 0) {
            for (const [name, validation] of channel["~"].server) {
                operations[toPascalCase(`${channel.name}_${name}`)] = {
                    action: "send",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: [
                        {
                            $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_send`)}`,
                        },
                    ],
                    "x-ws-asyncapi-operation": 1,
                };

                messages[toPascalCase(`${name}_send`)] = {
                    // server→client event: wire carries the parsed/output shape
                    payload: toLibrarySpec(
                        name,
                        validation ?? Type.Never(),
                        "output",
                    ),
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
                    // TODO: fix types too
                    messages: [
                        {
                            $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_receive`)}`,
                        },
                    ],
                    "x-ws-asyncapi-operation": 1,
                };

                messages[toPascalCase(`${name}_receive`)] = {
                    // client→server command: wire carries the input shape
                    payload: toLibrarySpec(
                        name,
                        validation ?? Type.Never(),
                        "input",
                    ),
                };
            }
        }

        if (channel["~"].rpc.size > 0) {
            for (const [name, { input, output, errors }] of channel["~"].rpc) {
                const operation: OperationsObject[string] = {
                    action: "receive",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: [
                        {
                            $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_request`)}`,
                        },
                    ],
                    reply: {
                        channel: {
                            $ref: `#/channels/${channel.name}`,
                        },
                        messages: [
                            {
                                $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_reply`)}`,
                            },
                        ],
                    },
                    "x-ws-asyncapi-operation": 1,
                    "x-ws-asyncapi-rpc": 1,
                };

                messages[toPascalCase(`${name}_request`)] = {
                    // client→server request: wire carries the input shape
                    payload: toLibrarySpec(name, input, "input"),
                };
                messages[toPascalCase(`${name}_reply`)] = {
                    // server→client reply: wire carries the output shape
                    payload: toLibrarySpec(name, output, "output"),
                };

                // Declared, recoverable errors → one message per code plus an
                // `x-ws-asyncapi-errors` index the CLI reads to emit the typed
                // error union on the generated client.
                if (errors && Object.keys(errors).length > 0) {
                    const errorIndex: Record<string, { $ref: string }> = {};
                    for (const [code, schema] of Object.entries(errors)) {
                        const msgName = toPascalCase(`${name}_error_${code}`);
                        messages[msgName] = {
                            // server→client error: wire carries the output shape
                            payload: toLibrarySpec(code, schema, "output"),
                        };
                        errorIndex[code] = {
                            $ref: `#/channels/${channel.name}/messages/${msgName}`,
                        };
                    }
                    operation["x-ws-asyncapi-errors"] = errorIndex;
                }

                operations[toPascalCase(`${channel.name}_${name}`)] = operation;
            }
        }

        if (channel["~"].serverRpc.size > 0) {
            for (const [name, { input, output }] of channel["~"].serverRpc) {
                operations[toPascalCase(`${channel.name}_${name}`)] = {
                    // server→client RPC: the server sends the request…
                    action: "send",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: [
                        {
                            $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_request`)}`,
                        },
                    ],
                    // …and the client replies
                    reply: {
                        channel: {
                            $ref: `#/channels/${channel.name}`,
                        },
                        messages: [
                            {
                                $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_reply`)}`,
                            },
                        ],
                    },
                    "x-ws-asyncapi-operation": 1,
                    "x-ws-asyncapi-server-rpc": 1,
                };

                messages[toPascalCase(`${name}_request`)] = {
                    // server→client request: wire carries the input shape
                    payload: toLibrarySpec(name, input, "input"),
                };
                messages[toPascalCase(`${name}_reply`)] = {
                    // client→server reply: wire carries the output shape
                    payload: toLibrarySpec(name, output, "output"),
                };
            }
        }

        // Streams: the client opens with an input (request) and the server
        // streams items of the output shape (reply). Same request/reply message
        // shape as an RPC, distinguished by `x-ws-asyncapi-stream` so the CLI
        // bins it into `StreamMap` instead of `RpcMap`.
        if (channel["~"].stream.size > 0) {
            for (const [name, { input, output }] of channel["~"].stream) {
                operations[toPascalCase(`${channel.name}_${name}`)] = {
                    action: "receive",
                    channel: {
                        $ref: `#/channels/${channel.name}`,
                    },
                    messages: [
                        {
                            $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_request`)}`,
                        },
                    ],
                    reply: {
                        channel: {
                            $ref: `#/channels/${channel.name}`,
                        },
                        messages: [
                            {
                                $ref: `#/channels/${channel.name}/messages/${toPascalCase(`${name}_reply`)}`,
                            },
                        ],
                    },
                    "x-ws-asyncapi-operation": 1,
                    "x-ws-asyncapi-stream": 1,
                };

                messages[toPascalCase(`${name}_request`)] = {
                    // client→server open: wire carries the input shape
                    payload: toLibrarySpec(name, input, "input"),
                };
                messages[toPascalCase(`${name}_reply`)] = {
                    // server→client item: wire carries the output shape
                    payload: toLibrarySpec(name, output, "output"),
                };
            }
        }

        // Auth (`.onAuth`) and presence (`.presence`) are channel-wide, not
        // per-name operations — record their schemas as a message + a
        // channel-level `$ref` extension the CLI reads to emit `authCredentials`
        // / `presenceState` on the generated client.
        const channelObject = channels[channel.name] as ChannelObject;

        if (channel["~"].auth) {
            const msgName = toPascalCase("auth_credentials");
            messages[msgName] = {
                // client→server credentials: wire carries the input shape
                payload: toLibrarySpec(
                    "auth",
                    channel["~"].auth.credentials,
                    "input",
                ),
            };
            channelObject["x-ws-asyncapi-auth"] = {
                $ref: `#/channels/${channel.name}/messages/${msgName}`,
            };
        }

        if (channel["~"].presence) {
            const msgName = toPascalCase("presence_state");
            messages[msgName] = {
                // per-member state: wire carries the parsed/output shape
                payload: toLibrarySpec(
                    "presence",
                    channel["~"].presence.state,
                    "output",
                ),
            };
            channelObject["x-ws-asyncapi-presence"] = {
                $ref: `#/channels/${channel.name}/messages/${msgName}`,
            };
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
