import { describe, expect, it } from "bun:test";
import { Type } from "@sinclair/typebox";
import { getAsyncApiDocument } from "../src/async-api/index.ts";
import { Channel } from "../src/index.ts";

describe("AsyncAPI", () => {
    it("should be a valid AsyncAPI document", () => {
        const document = getAsyncApiDocument([], {
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
            "operations": {},
            "servers": {
              "production": {
                "host": "api.example.com",
                "pathname": "/v1",
                "protocol": "wss",
              },
            },
            "x-ws-asyncapi": true,
          }
        `);
    });

    it("Simple channel", () => {
        const channel = new Channel("/test/:id").query(
            Type.Object({
                id: Type.String(),
            }),
        );

        const document = getAsyncApiDocument([channel], {});

        console.log(JSON.stringify(document, null, 2));

        expect(document).toMatchInlineSnapshot(`
          {
            "asyncapi": "3.0.0",
            "channels": {
              "/test/:id": {
                "address": "/test/:id",
                "bindings": {
                  "ws": {
                    "bindingVersion": "latest",
                    "query": {
                      [Symbol(TypeBox.Kind)]: "Object",
                      "properties": {
                        "id": {
                          [Symbol(TypeBox.Kind)]: "String",
                          "type": "string",
                        },
                      },
                      "required": [
                        "id",
                      ],
                      "type": "object",
                    },
                    "x-parameters": [
                      {
                        "in": "path",
                        "name": "id",
                        "required": true,
                      },
                    ],
                  },
                },
              },
            },
            "components": {},
            "info": {
              "description": "AsyncAPI",
              "title": "AsyncAPI",
              "version": "1.0.0",
            },
            "operations": {},
            "servers": {},
            "x-ws-asyncapi": true,
          }
        `);
    });
});
