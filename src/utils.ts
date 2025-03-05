import type { TSchema } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

export function getPathParams(path: string) {
    return path
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => part.slice(1));
}

export function toChannelExpression(path: string) {
    return path.replace(/:(\w+)/g, "{$1}");
}

export function toLibrarySpec(name: string, data: TSchema) {
    return Type.Tuple([Type.Literal(name), data]);
}

export function toPascalCase(str: string) {
    return str.replace(/(?:^|_|-)(\w)/g, (_, char) => char.toUpperCase());
}

// !CUSTOM Type support for AsyncAPI
// !Based on https://github.com/asyncapi/bindings/blob/master/websockets/README.md#channel
declare module "asyncapi-types" {
    // interface ParameterObject {
    //     name: string;
    //     in: "path";
    //     required: true;
    // }

    // interface WSBindingObject {
    //     "x-parameters"?: ParameterObject[];
    // }
    interface OperationObject {
        "x-ws-asyncapi-operation": 1;
    }
}

// ~1 is /
export type MaybePromise<T> = T | Promise<T>;
