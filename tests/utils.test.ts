import { describe, expect, it } from "bun:test";
import { getPathParams } from "../src/utils.ts";

describe("getPathParams", () => {
    it.each([
        ["/test/:test", ["test"]],
        ["/user/:id/posts/:postId", ["id", "postId"]],
        ["/no/params/here", []],
        ["", []],
        ["/:rootParam", ["rootParam"]],
        ["/a/:b/c", ["b"]],
        ["/test/:test/", ["test"]],
        ["/complex/:param1/:param_2", ["param1", "param_2"]],
        ["/multiple//slashes/:name", ["name"]],
        ["/:123invalid", ["123invalid"]],
    ])("correctly extracts params from %s", (input, expected) => {
        expect(getPathParams(input)).toEqual(expected);
    });

    it("handles mixed parameter types", () => {
        expect(getPathParams("/:lang/:version/docs/:page")).toEqual([
            "lang",
            "version",
            "page",
        ]);
    });
});
