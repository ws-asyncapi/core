import { Channel } from "../src/index.ts";

import { describe, expect, it } from "bun:test";

describe("Channel", () => {
    it("should create a channel", () => {
        const channel = new Channel("/test/:id");

        console.log(channel);

        expect(channel).toBeDefined();
        expect(channel.address).toBe("/test/:id");
    });
});
