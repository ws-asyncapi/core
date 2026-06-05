import { describe, expect, test } from "bun:test";
import { Frame, jsonCodec, RpcError } from "../src/index.ts";

describe("wire", () => {
    test("jsonCodec round-trips a frame", () => {
        const frame = [Frame.Request, "getUser", 1, { id: 5 }] as const;
        const encoded = jsonCodec.encode([...frame]);
        expect(typeof encoded).toBe("string");
        expect(jsonCodec.decode(encoded)).toEqual([...frame]);
    });

    test("jsonCodec decodes from ArrayBuffer", () => {
        const encoded = jsonCodec.encode([Frame.Pong, 123]);
        const buf = new TextEncoder().encode(encoded as string).buffer;
        expect(jsonCodec.decode(buf)).toEqual([Frame.Pong, 123]);
    });

    test("RpcError carries code and data", () => {
        const err = new RpcError("VALIDATION", "bad", { field: "x" });
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe("VALIDATION");
        expect(err.data).toEqual({ field: "x" });
    });
});
