import { describe, expect, test } from "bun:test";
import { type BackplaneMessage, LocalBackplane } from "../src/index.ts";

describe("LocalBackplane", () => {
    test("delivers published messages to the local handler", async () => {
        const bp = new LocalBackplane();
        const received: BackplaneMessage[] = [];
        bp.onMessage((m) => received.push(m));

        await bp.publish("room:1", "payload");

        expect(received).toHaveLength(1);
        expect(received[0].topic).toBe("room:1");
        expect(received[0].payload).toBe("payload");
        expect(received[0].origin).toBe(bp.nodeId);
    });

    test("tracks room membership both ways", async () => {
        const bp = new LocalBackplane();
        await bp.addToRoom("room:1", "a");
        await bp.addToRoom("room:1", "b");
        await bp.addToRoom("room:2", "a");

        expect((await bp.roomMembers("room:1")).sort()).toEqual(["a", "b"]);
        expect((await bp.rooms("a")).sort()).toEqual(["room:1", "room:2"]);
    });

    test("removeFromRoom and removeSocket clean up", async () => {
        const bp = new LocalBackplane();
        await bp.addToRoom("room:1", "a");
        await bp.addToRoom("room:2", "a");

        await bp.removeFromRoom("room:1", "a");
        expect(await bp.roomMembers("room:1")).toEqual([]);
        expect(await bp.rooms("a")).toEqual(["room:2"]);

        await bp.removeSocket("a");
        expect(await bp.roomMembers("room:2")).toEqual([]);
        expect(await bp.rooms("a")).toEqual([]);
    });
});
