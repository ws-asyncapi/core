import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Channel, getAsyncApiDocument } from "../src/index.ts";

describe("rpc AsyncAPI generation", () => {
    test("emits a receive operation with a reply and request/reply messages", () => {
        const channel = new Channel("/chat/:room", "chat").rpc(
            "history",
            Type.Object({ limit: Type.Number() }),
            Type.Object({ items: Type.Array(Type.String()) }),
            async () => ({ items: [] }),
        );

        const doc = getAsyncApiDocument([channel], {});
        const op = doc.operations?.ChatHistory;

        expect(op).toBeDefined();
        // biome-ignore lint/suspicious/noExplicitAny: test assertions
        const anyOp = op as any;
        expect(anyOp.action).toBe("receive");
        expect(anyOp["x-ws-asyncapi-rpc"]).toBe(1);
        expect(anyOp.messages[0].$ref).toBe(
            "#/channels/chat/messages/HistoryRequest",
        );
        expect(anyOp.reply.messages[0].$ref).toBe(
            "#/channels/chat/messages/HistoryReply",
        );

        // biome-ignore lint/suspicious/noExplicitAny: channel union narrowing
        const messages = (doc.channels?.chat as any)?.messages ?? {};
        expect(messages).toHaveProperty("HistoryRequest");
        expect(messages).toHaveProperty("HistoryReply");
    });

    test("rejects duplicate message names across server/client/rpc", () => {
        const channel = new Channel("/dup", "dup")
            .serverMessage("ping", Type.Object({}))
            .rpc(
                "ping",
                Type.Object({}),
                Type.Object({}),
                async () => ({}),
            );

        expect(() => getAsyncApiDocument([channel], {})).toThrow(
            /duplicate message names/,
        );
    });

    test("does not affect channels without rpc", () => {
        const channel = new Channel("/plain", "plain").serverMessage(
            "tick",
            Type.Object({ n: Type.Number() }),
        );
        const doc = getAsyncApiDocument([channel], {});
        // biome-ignore lint/suspicious/noExplicitAny: test assertions
        const op = doc.operations?.PlainTick as any;
        expect(op.action).toBe("send");
        expect(op.reply).toBeUndefined();
    });
});
