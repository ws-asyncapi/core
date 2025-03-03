export function getPathParams(path: string) {
    return path
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => part.slice(1));
}
