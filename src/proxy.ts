/**
 * Proxy-aware fetch: per-account proxy (http/https/socks5) + env fallback.
 * - account.proxy present => per-account dispatcher (fail-closed, not affected by NO_PROXY)
 * - otherwise => EnvHttpProxyAgent (honours HTTP_PROXY/HTTPS_PROXY/NO_PROXY)
 * Applied per-request via dispatcher option so the host's global dispatcher stays untouched.
 */

import { EnvHttpProxyAgent, ProxyAgent } from 'undici'
import { createConnection } from 'node:net'
import { createRequire } from 'node:module'

const envAgent = new EnvHttpProxyAgent()

/** The env proxy agent (exported for tests). */
export const proxyAgent = envAgent

// ── Dispatcher cache (bounded by MAX_ACCOUNTS=10, no leak concern) ──
const dispatcherCache = new Map<string, any>()

// ── Proxy URL normalization ──
const SUPPORTED = new Set(['http:', 'https:', 'socks5:', 'socks5h:'])

function defaultPort(protocol: string): string {
  if (protocol === 'https:') return '443'
  if (protocol === 'socks5:' || protocol === 'socks5h:') return '1080'
  return '8080'
}

export function normalizeProxyUrl(proxyUrl: string): string {
  let raw = proxyUrl.trim()
  if (!raw) throw new Error('[proxy] empty proxy URL')
  // alias socks:// -> socks5://
  if (raw.toLowerCase().startsWith('socks://')) raw = 'socks5://' + raw.slice('socks://'.length)
  // strip family marker before parse, re-append after
  const familyMatch = raw.match(/\?family=(ipv4|ipv6)$/)
  const familySuffix = familyMatch ? familyMatch[0] : ''
  const baseRaw = familySuffix ? raw.slice(0, -familySuffix.length) : raw

  let parsed: URL
  try {
    parsed = new URL(baseRaw)
  } catch {
    throw new Error(`[proxy] invalid proxy URL: ${proxyUrlForLogs(proxyUrl)}`)
  }
  // normalize socks5h -> socks5 (remote DNS, same agent)
  let protocol = parsed.protocol.toLowerCase()
  if (protocol === 'socks5h:') protocol = 'socks5:'
  if (!SUPPORTED.has(protocol) && protocol !== 'socks5:') {
    // allow socks5h already normalized
    if (!SUPPORTED.has(parsed.protocol.toLowerCase())) {
      throw new Error(`[proxy] unsupported protocol: ${parsed.protocol}`)
    }
  }
  // ensure protocol is one of http/https/socks5
  if (!['http:', 'https:', 'socks5:'].includes(protocol)) {
    throw new Error(`[proxy] unsupported protocol: ${parsed.protocol}`)
  }
  if (!parsed.hostname) throw new Error('[proxy] missing host')

  let port = parsed.port
  if (!port) port = defaultPort(protocol)
  const portNum = Number(port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error('[proxy] invalid port')
  }
  // Build auth with proper encoding (parsed.username/password are decoded)
  const auth = parsed.username
    ? `${encodeURIComponent(parsed.username)}${parsed.password ? `:${encodeURIComponent(parsed.password)}` : ''}@`
    : ''
  const normalizedBase = `${protocol}//${auth}${parsed.hostname}:${port}`
  return familySuffix ? `${normalizedBase}${familySuffix}` : normalizedBase
}

export function proxyUrlForLogs(proxyUrl: string): string {
  try {
    // handle family suffix
    const fam = proxyUrl.match(/\?family=(ipv4|ipv6)$/)
    const base = fam ? proxyUrl.slice(0, -fam[0].length) : proxyUrl
    const u = new URL(base)
    const port = u.port || defaultPort(u.protocol)
    return `${u.protocol}//${u.hostname}:${port}`
  } catch {
    return proxyUrl
  }
}

// ── Proxy unreachable detection (mirrors OmniRoute proxyFetch.ts:30) ──
const PROXY_UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

function isLoopbackUrl(url: string | URL): boolean {
  try {
    const u = typeof url === 'string' ? new URL(url as string) : (url as URL)
    const h = u.hostname.toLowerCase()
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '::ffff:127.0.0.1'
  } catch {
    return false
  }
}

export function isProxyUnreachableError(err: unknown): boolean {
  const seen = new Set<unknown>()
  let cur: unknown = err
  for (let depth = 0; cur && depth < 5 && !seen.has(cur); depth++) {
    seen.add(cur)
    if (cur && typeof cur === 'object') {
      const code = (cur as { code?: unknown }).code
      if (typeof code === 'string' && PROXY_UNREACHABLE_CODES.has(code)) return true
      const errorCode = (cur as { errorCode?: unknown }).errorCode
      if (errorCode === 'proxy_unreachable' || errorCode === 'PROXY_UNREACHABLE') return true
      const statusCode = (cur as { statusCode?: unknown }).statusCode
      if (statusCode === 503) {
        const m = (cur as { message?: unknown }).message
        if (typeof m === 'string' && m.includes('Proxy unreachable')) return true
      }
      const msg = (cur as { message?: unknown }).message
      if (typeof msg === 'string') {
        if (msg.includes('proxy_unreachable') || msg.includes('PROXY_UNREACHABLE')) return true
        for (const c of PROXY_UNREACHABLE_CODES) {
          if (msg.includes(c)) return true
        }
      }
    }
    cur = (cur as { cause?: unknown })?.cause
    // Also handle AggregateError.errors (undici Happy Eyeballs)
    if (!cur && (err as { errors?: unknown })?.errors && depth === 0) {
      const errs = (err as { errors?: unknown[] }).errors
      if (Array.isArray(errs)) {
        for (const e of errs) if (isProxyUnreachableError(e)) return true
      }
    }
  }
  return false
}

export function tagProxyUnreachable<T>(err: T): T {
  if (isProxyUnreachableError(err)) {
    const e = err as unknown as Error & { code?: string; errorCode?: string }
    e.code = 'PROXY_UNREACHABLE'
    e.errorCode = 'proxy_unreachable'
  }
  return err
}

// ── Fast-fail TCP reachability (2s, 30s healthy / 2s unhealthy cache) ──
const FAST_FAIL_TIMEOUT_MS = 2000
const HEALTHY_TTL_MS = 30_000
const UNHEALTHY_TTL_MS = 2000
type HealthEntry = { healthy: boolean; at: number; ttl: number }
const healthCache = new Map<string, HealthEntry>()
const healthInflight = new Map<string, Promise<boolean>>()

function tcpCheck(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.setTimeout(timeoutMs)
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

export async function isProxyReachable(proxyUrl: string, timeoutMs = FAST_FAIL_TIMEOUT_MS): Promise<boolean> {
  const key = normalizeProxyUrl(proxyUrl)
  const cached = healthCache.get(key)
  if (cached && Date.now() - cached.at < cached.ttl) return cached.healthy
  const existing = healthInflight.get(key)
  if (existing) return existing
  let url: URL
  try {
    const base = key.replace(/\?family=(ipv4|ipv6)$/, '')
    url = new URL(base)
  } catch {
    healthCache.set(key, { healthy: false, at: Date.now(), ttl: UNHEALTHY_TTL_MS })
    return false
  }
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '')
  const port = Number(url.port || defaultPort(url.protocol))
  const probe = tcpCheck(host, port, timeoutMs).then((healthy) => {
    healthCache.set(key, { healthy, at: Date.now(), ttl: healthy ? HEALTHY_TTL_MS : UNHEALTHY_TTL_MS })
    return healthy
  })
  healthInflight.set(key, probe)
  try {
    return await probe
  } finally {
    if (healthInflight.get(key) === probe) healthInflight.delete(key)
  }
}

export function _clearProxyHealthCacheForTest(): void {
  healthCache.clear()
  healthInflight.clear()
}

// ── Dispatcher creation (cached) ──
async function createSocksDispatcher(proxyUrl: string, dispatcherOpts: Record<string, unknown>): Promise<any> {
  // @ts-ignore — optional dep, only required for socks5
  const { SocksProxyAgent } = await import('socks-proxy-agent')
  // socks-proxy-agent is compatible with undici dispatcher interface via fetch
  return new (SocksProxyAgent as any)(proxyUrl) as any
}

function createHttpDispatcher(proxyUrl: string, dispatcherOpts: Record<string, unknown>): any {
  const clean = proxyUrl.replace(/\?family=(ipv4|ipv6)$/, '')
  return new ProxyAgent({
    uri: clean,
    // tunnel all (http+https) via CONNECT, same as OmniRoute
    proxyTunnel: true,
    ...dispatcherOpts,
  } as any)
}

const DISPATCHER_OPTS = {
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
  connectTimeout: 10_000,
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
  pipelining: 0,
} as const

export function dispatcherFor(proxyUrl?: string): any | undefined {
  if (!proxyUrl) return envAgent as any
  const normalized = normalizeProxyUrl(proxyUrl)
  const cached = dispatcherCache.get(normalized)
  if (cached) return cached
  const famClean = normalized.replace(/\?family=(ipv4|ipv6)$/, '')
  let dispatcher: any
  if (famClean.startsWith('socks5:')) {
    // SOCKS needs SocksProxyAgent. Try sync require for cached case; otherwise prefer async path (proxiedFetch uses dispatcherForAsync).
    try {
      const rq = createRequire(import.meta.url)
      const mod = rq('socks-proxy-agent') as { SocksProxyAgent?: new (u: string) => unknown }
      const Cls = mod.SocksProxyAgent
      if (Cls) {
        dispatcher = new (Cls as unknown as new (u: string) => unknown)(normalized) as unknown
      } else {
        throw new Error('no SocksProxyAgent')
      }
    } catch {
      throw new Error('[proxy] socks dispatcher requires async creation — use dispatcherForAsync or proxiedFetch with proxyUrl')
    }
  } else {
    dispatcher = createHttpDispatcher(normalized, DISPATCHER_OPTS as any)
  }
  dispatcherCache.set(normalized, dispatcher)
  return dispatcher
}

export async function dispatcherForAsync(proxyUrl?: string): Promise<any | undefined> {
  if (!proxyUrl) return envAgent as any
  const normalized = normalizeProxyUrl(proxyUrl)
  const cached = dispatcherCache.get(normalized)
  if (cached) return cached
  const famClean = normalized.replace(/\?family=(ipv4|ipv6)$/, '')
  let dispatcher: any
  if (famClean.startsWith('socks5:')) {
    dispatcher = await createSocksDispatcher(normalized, DISPATCHER_OPTS as any)
  } else {
    dispatcher = createHttpDispatcher(normalized, DISPATCHER_OPTS as any)
  }
  dispatcherCache.set(normalized, dispatcher)
  return dispatcher
}

export function _clearDispatcherCacheForTest(): void {
  dispatcherCache.clear()
}

function getTargetUrlString(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  try {
    if (input instanceof URL) return input.toString()
    if (typeof (input as Request).url === 'string') return (input as Request).url
  } catch {
    // ignore
  }
  return ''
}

/** fetch() that respects per-account proxyUrl (when given) otherwise env. */
export const proxiedFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1] & { proxyUrl?: string },
  opts?: { proxyUrl?: string },
): Promise<Response> => {
  const proxyUrl = (opts as any)?.proxyUrl ?? (init as any)?.proxyUrl
  // Normalize init without proxyUrl leakage
  const cleanInit = { ...init } as any
  if (cleanInit.proxyUrl) delete cleanInit.proxyUrl
  if (!proxyUrl) {
    return fetch(input, { ...cleanInit, dispatcher: envAgent as any })
  }
  // Loopback bypass: per-account proxy must never intercept OAuth loopback callback (spec 1)
  const targetStr = getTargetUrlString(input)
  if (targetStr && isLoopbackUrl(targetStr)) {
    return fetch(input, cleanInit as RequestInit)
  }
  // Fast-fail pre-check (skip for env path)
  try {
    const reachable = await isProxyReachable(proxyUrl)
    if (!reachable) {
      const err = new Error(`[Proxy Fast-Fail] Proxy unreachable: ${proxyUrlForLogs(proxyUrl)}`) as Error & { code?: string; errorCode?: string; statusCode?: number }
      err.code = 'PROXY_UNREACHABLE'
      err.errorCode = 'proxy_unreachable'
      ;(err as any).statusCode = 503
      throw err
    }
  } catch (e) {
    if ((e as any)?.errorCode === 'proxy_unreachable') throw e
    // normalization failure -> throw
    if (e instanceof Error && e.message.startsWith('[proxy]')) throw e
  }

  let dispatcher: any
  try {
    dispatcher = await dispatcherForAsync(proxyUrl)
  } catch (e) {
    throw tagProxyUnreachable(e)
  }
  try {
    return await fetch(input, { ...cleanInit, dispatcher })
  } catch (err) {
    // Tag proxy unreachable so caller can classify
    throw tagProxyUnreachable(err)
  }
}

// Keep named export for tests that assert instanceof
export { envAgent as _envAgentForTest }
