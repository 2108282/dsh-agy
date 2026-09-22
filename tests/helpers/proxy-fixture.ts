/**
 * Shared test fixture: a REAL loopback TCP listener standing in for a reachable
 * per-account proxy.
 *
 * Why a real listener rather than a stub: `proxiedFetch` runs a 2s TCP fast-fail
 * pre-check before it ever reaches `fetch`, so a closed port throws
 * PROXY_UNREACHABLE and the request never exercises routing at all. A real
 * listener lets the pre-check pass so the routing decision under test actually
 * happens. Nothing here leaves 127.0.0.1 — `fetch` itself stays stubbed by the
 * caller, so the "Zero Network in Tests" invariant (AGENTS.md) still holds.
 */
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { _clearDispatcherCacheForTest } from '../../src/proxy.ts'

export interface ProxyFixture {
  /** `http://127.0.0.1:<port>` — a reachable address for `account.proxy`. */
  proxyUrl: string
  port: number
  close(): Promise<void>
}

/** Open a reachable loopback "proxy" and reset the dispatcher cache for it. */
export async function openProxyFixture(options: { credentials?: string } = {}): Promise<ProxyFixture> {
  const server: Server = createServer((socket) => socket.on('error', () => {}).end())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  // Each fixture uses a fresh port; clear so no earlier dispatcher is reused.
  _clearDispatcherCacheForTest()
  const auth = options.credentials ? `${options.credentials}@` : ''
  return {
    proxyUrl: `http://${auth}127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        _clearDispatcherCacheForTest()
        server.close(() => resolve())
      }),
  }
}

/**
 * Run `fn` with a reachable proxy URL, always closing the listener afterwards.
 * The try/finally is the point: 5 call sites previously spelled it out by hand.
 */
export async function withProxyFixture<T>(
  fn: (proxyUrl: string) => Promise<T>,
  options: { credentials?: string } = {},
): Promise<T> {
  const fixture = await openProxyFixture(options)
  try {
    return await fn(fixture.proxyUrl)
  } finally {
    await fixture.close()
  }
}
