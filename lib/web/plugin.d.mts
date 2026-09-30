import { IncomingMessage, ServerResponse } from "node:http";
import { Context } from "@deepseek-ai/cordis";
//#region src/web/plugin.d.ts
export declare const name = "dsh-agy-web";
/** The one service every composition provides; the rest are resolved lazily. */
export declare const inject: string[];
/** The slice of the host's web-server service this entry uses. */
interface WebServerLike {
  register(route: {
    kind: 'exact';
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void;
  }): () => void;
  host?: string;
  /** The port actually listened on: the OS-assigned one when `--port 0`. */
  readonly port?: number;
}
/**
 * The loopback base URL the OAuth redirect and the callback page point at.
 *
 * The port is the one the server BOUND, not the one it was asked for.
 * `webStartup.port` is the `--port` flag verbatim, and `--port 0` — which asks
 * the OS for any free port — would send Google's redirect to
 * `http://127.0.0.1:0/agy/oauth-callback`, which nothing answers.
 * The requested port and DSH's own 3080 default only stand in while the
 * server has not reported one.
 * @param host - loopback host the URL names.
 * @param webServer - the host web server (source of the bound port).
 * @param requestedPort - `webStartup.port`, the `--port` flag if one was given.
 * @returns `http://<host>:<port>`, no trailing slash.
 */
export declare function webBaseUrl(host: string, webServer: Pick<WebServerLike, 'port'>, requestedPort?: number): string;
export declare function apply(ctx: Context): void;
//#endregion
//# sourceMappingURL=plugin.d.mts.map