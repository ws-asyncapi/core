export interface WebsocketDataType {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    client: Record<string, any>;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    server: Record<string, any>;
}

export abstract class WebSocketImplementation<
    WebsocketData extends WebsocketDataType,
    Topics,
> {
    abstract send<T extends keyof WebsocketData["server"]>(
        type: T,
        ...data: WebsocketData["server"][T] extends never
            ? []
            : [WebsocketData["server"][T]]
    ): void;

    abstract subscribe(topic: Topics): void;
    abstract unsubscribe(topic: Topics): void;
    abstract isSubscribed(topic: Topics): boolean;
    abstract publish<T extends keyof WebsocketData["server"]>(
        topic: Topics,
        type: T,
        ...data: WebsocketData["server"][T] extends never
            ? []
            : [WebsocketData["server"][T]]
    ): void;

    abstract close(code?: number, reason?: string): void;
}
