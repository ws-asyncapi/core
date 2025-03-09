export interface WebsocketDataType {
    client: Record<string, any>;
    server: Record<string, any>;
}

export abstract class WebSocketImplementation<
    WebsocketData extends WebsocketDataType,
> {
    abstract send<T extends keyof WebsocketData["server"]>(
        type: T,
        data: WebsocketData["server"][T],
    ): void;
}
