import { type AnySchema, type SchemaIO, toJsonSchema } from "./schema.ts";

export function getPathParams(path: string) {
    return path
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => part.slice(1));
}

export function toChannelExpression(path: string) {
    return path.replace(/:(\w+)/g, "{$1}");
}

/**
 * Wrap a message's schema in the discriminated tuple the wire + CLI expect:
 * `[ {const: name}, <payload schema> ]`. Built as a plain draft-07 JSON Schema
 * (array-form tuple) so any validator — Standard Schema or TypeBox — flows
 * through {@link toJsonSchema}. `io` picks the input (client-sent) vs output
 * (server-sent) shape for validators with transforms.
 */
export function toLibrarySpec(
    name: string,
    data: AnySchema,
    io: SchemaIO = "output",
) {
    return {
        type: "array",
        minItems: 2,
        maxItems: 2,
        additionalItems: false,
        items: [{ type: "string", const: name }, toJsonSchema(data, io)],
    };
}

export function toPascalCase(str: string) {
    return str.replace(/(?:^|_|-)(\w)/g, (_, char) => char.toUpperCase());
}

// !CUSTOM Type support for AsyncAPI
// !Based on https://github.com/asyncapi/bindings/blob/master/websockets/README.md#channel
declare module "asyncapi-types" {
    interface OperationObject {
        "x-ws-asyncapi-operation": 1;
        // marks an operation as a request/response RPC (carries a `reply`)
        "x-ws-asyncapi-rpc"?: 1;
        // marks a server→client RPC (action "send" with a `reply`)
        "x-ws-asyncapi-server-rpc"?: 1;
        // declared RPC error codes → message $ref for the error's `data` schema
        "x-ws-asyncapi-errors"?: Record<string, { $ref: string }>;
    }
}

// ~1 is /
