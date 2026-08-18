/**
 * Proxy-aware fetch: respects the standard HTTP_PROXY / HTTPS_PROXY / NO_PROXY
 * environment variables (lowercase variants included) via undici's
 * EnvHttpProxyAgent. Applied per-request through the `dispatcher` option so the
 * plugin never mutates the host process's global dispatcher — DSH's own fetch
 * calls stay untouched.
 */

import { EnvHttpProxyAgent } from 'undici'

const agent = new EnvHttpProxyAgent()

/** The proxy agent built from the environment (exported for tests). */
export const proxyAgent = agent

/** fetch() that routes through the env-configured proxy when one is set. */
export const proxiedFetch: typeof fetch = (input, init) =>
  // The Dispatcher type in undici's own types drifts from the undici-types
  // bundled with @types/node; the runtime interface is stable across versions.
  fetch(input, { ...init, dispatcher: agent as any })