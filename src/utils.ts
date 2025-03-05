export function getPathParams(path: string) {
    return path
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => part.slice(1));
}

// !CUSTOM Type support for AsyncAPI
// !Based on https://github.com/asyncapi/bindings/blob/master/websockets/README.md#channel
declare module "asyncapi-types" {
    interface ParameterObject {
        name: string;
        in: "path";
        required: true;
    }

    interface WSBindingObject {
        "x-parameters"?: ParameterObject[];
    }
}

// ~1 is /
