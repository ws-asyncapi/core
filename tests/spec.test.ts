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
        const channel = new Channel("/test/:id", "test").query(
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
              "test": {
                "address": "/test/{id}",
                "bindings": {
                  "ws": {
                    "bindingVersion": "0.1.0",
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
                  },
                },
                "messages": {},
                "parameters": {
                  "id": {},
                },
                "title": "test",
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

    it("Channel with server and client message", () => {
        const channel = new Channel("/test/:id", "test")
            .query(
                Type.Object({
                    id: Type.String(),
                }),
            )
            .serverMessage(
                "test",
                Type.Object({
                    id: Type.String(),
                }),
            )
            .clientMessage("test-really", (message) => {
                console.log(message);
            });

        const document = getAsyncApiDocument([channel], {});

        console.log(JSON.stringify(document, null, 2));

        expect(document).toMatchInlineSnapshot(`
          {
            "asyncapi": "3.0.0",
            "channels": {
              "test": {
                "address": "/test/{id}",
                "bindings": {
                  "ws": {
                    "bindingVersion": "0.1.0",
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
                  },
                },
                "messages": {
                  "TestReallyReceive": {
                    "payload": {
                      [Symbol(TypeBox.Kind)]: "Tuple",
                      "additionalItems": false,
                      "items": [
                        {
                          [Symbol(TypeBox.Kind)]: "Literal",
                          "const": "test-really",
                          "type": "string",
                        },
                        {
                          [Symbol(TypeBox.Kind)]: "Never",
                          "not": {},
                        },
                      ],
                      "maxItems": 2,
                      "minItems": 2,
                      "type": "array",
                    },
                  },
                  "TestSend": {
                    "payload": {
                      [Symbol(TypeBox.Kind)]: "Tuple",
                      "additionalItems": false,
                      "items": [
                        {
                          [Symbol(TypeBox.Kind)]: "Literal",
                          "const": "test",
                          "type": "string",
                        },
                        {
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
                      ],
                      "maxItems": 2,
                      "minItems": 2,
                      "type": "array",
                    },
                  },
                },
                "parameters": {
                  "id": {},
                },
                "title": "test",
              },
            },
            "components": {},
            "info": {
              "description": "AsyncAPI",
              "title": "AsyncAPI",
              "version": "1.0.0",
            },
            "operations": {
              "TestTest": {
                "action": "send",
                "channel": {
                  "$ref": "#/channels/test",
                },
                "messages": [
                  {
                    "$ref": "#/channels/test/messages/TestSend",
                  },
                ],
                "x-ws-asyncapi-operation": 1,
              },
              "TestTestReally": {
                "action": "receive",
                "channel": {
                  "$ref": "#/channels/test",
                },
                "messages": [
                  {
                    "$ref": "#/channels/test/messages/TestReallyReceive",
                  },
                ],
                "x-ws-asyncapi-operation": 1,
              },
            },
            "servers": {},
            "x-ws-asyncapi": true,
          }
        `);
    });
});
