import { describe, expect, it } from "bun:test";
import { getAsyncApiDocument } from "../src/async-api/index.ts";

describe("AsyncAPI", () => {
    it("should be a valid AsyncAPI document", () => {
        const document = getAsyncApiDocument({} as never, {
            servers: {
                production: {
                    protocol: "wss",
                    host: "api.example.com",
                    pathname: "/v1",
                },
            },
        });
        

        expect(document).toBeDefined();
        expect(document.asyncapi).toBe("3.0.0");

        expect(document).toMatchInlineSnapshot(`
          {
            "asyncapi": "3.0.0",
            "channels": {},
            "components": {},
            "info": {
              "description": "AsyncAPI",
              "title": "AsyncAPI",
              "version": "1.0.0",
            },
            "servers": {
              "production": {
                "host": "api.example.com",
                "pathname": "/v1",
                "protocol": "wss",
              },
            },
          }
        `);
    });
});