import type { ChannelObject } from "asyncapi-types";

// TODO: maybe use `defineOperation`
export class Channel {
    constructor(
        public address: `/${string}`,
        public schema: ChannelObject = {},
    ) {}
}
