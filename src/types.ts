import type { TSchema } from "@sinclair/typebox";
import type {
    WebSocketImplementation,
    WebsocketDataType,
} from "./websocket.ts";

export type MaybePromise<T> = T | Promise<T>;

export type OnOpenHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
> = (ws: WebSocketImplementation<WebsocketData, Topics>) => MaybePromise<void>;

export type MessageHandler<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
> = (data: {
    ws: WebSocketImplementation<WebsocketData, Topics>;
    message: Message;
}) => MaybePromise<void>;
export interface MessageHandlerSchema<
    WebsocketData extends WebsocketDataType,
    Topics extends string,
    Message,
> {
    handler: MessageHandler<WebsocketData, Topics, Message>;
    validation?: TSchema;
}
