import { Type } from "@sinclair/typebox";
import { Channel } from "../src/index.ts";

import { describe, expect, it } from "bun:test";

describe("Channel", () => {
    it("should create a channel", () => {
        const channel = new Channel("/test/:id");

        console.log(channel);

        expect(channel).toBeDefined();
        expect(channel.address).toBe("/test/:id");
    });

    it("should serverMessage a message", () => {
        const channel = new Channel("/test/:id").serverMessage(
            "message",
            Type.Object({}),
        );

        expect(channel["~"].server.get("message")).toBeDefined();
    });

    it("should clientMessage a message", () => {
        const channel = new Channel("/test/:id").clientMessage(
            "message",
            (message) => {
                console.log(message);
            },
            Type.Object({}),
        );

        expect(channel["~"].client.get("message")).toBeDefined();
    });

    it("should allow query in a channel", () => {
        const channel = new Channel("/test/:id").query(Type.Object({}));

        expect(channel["~"].query).toBeDefined();
    });

    it("should allow headers in a channel", () => {
        const channel = new Channel("/test/:id").headers(
            Type.Object({
                test: Type.String(),
            }),
        );

        expect(channel["~"].headers).toBeDefined();
    });
});
