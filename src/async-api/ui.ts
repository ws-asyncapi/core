import type { AsyncAPIObject } from "asyncapi-types";

interface AsyncApiUIResults {
    response: Response;
    string: string;
}

function getHTML(asyncApi: AsyncAPIObject) {
    return `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@latest/styles/default.min.css">
  </head>
  <body>
    
    <div id="asyncapi"></div>

    <script src="https://unpkg.com/@asyncapi/react-component@latest/browser/standalone/index.js"></script>
    <script>
      AsyncApiStandalone.render({
        schema: ${JSON.stringify(asyncApi)},
        config: {
          show: {
            sidebar: true,
          }
        },
      }, document.getElementById('asyncapi'));
    </script>

  </body>
</html>`;
}

export function getAsyncApiUI<As extends "response" | "string">(
    asyncApi: AsyncAPIObject,
    as: As,
): AsyncApiUIResults[As] {
    if (as === "response") {
        // @ts-expect-error
        return new Response(getHTML(asyncApi), {
            headers: {
                "Content-Type": "text/html",
            },
        });
    }

    // @ts-expect-error
    return getHTML(asyncApi);
}
