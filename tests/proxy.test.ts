import { describe, it, expect, vi, afterEach } from 'vitest'
import { EnvHttpProxyAgent } from 'undici'
import { proxiedFetch, proxyAgent, proxyStreamingAgent, dispatcherForAsync, dispatcherOptsFor, normalizeProxyUrl, _clearDispatcherCacheForTest } from '../src/proxy.ts'

describe('proxy env support', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds an EnvHttpProxyAgent that reads HTTP_PROXY/HTTPS_PROXY/NO_PROXY', () => {
    expect(proxyAgent).toBeInstanceOf(EnvHttpProxyAgent)
  })

  it('forwards the proxy dispatcher to the underlying fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await proxiedFetch('https://example.com', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com', {
      method: 'POST',
      dispatcher: proxyAgent,
    })
  })

  it('keeps the caller signal and other init options intact', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await proxiedFetch('https://example.com', { signal: controller.signal })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com', {
      signal: controller.signal,
      dispatcher: proxyAgent,
    })
  })
})

describe('streaming dispatcher (issue #29 5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    _clearDispatcherCacheForTest()
  })

  // A generation stream can legitimately stay silent for minutes mid-turn
  // (reasoning). undici's bodyTimeout is a per-gap inactivity timer, not a total
  // transfer budget — measured against a real tunnel: a 150ms drip for 1.5s
  // survives bodyTimeout:400, while one 1.5s stall trips it, and bodyTimeout:0
  // survives a 35s stall. So the control-plane 30s value would kill a slow turn
  // the moment proxy routing works, which is why streaming disables it.
  it('disables the per-gap body inactivity timer for streams only', () => {
    expect(dispatcherOptsFor(true).bodyTimeout).toBe(0)
    expect(dispatcherOptsFor(false).bodyTimeout).toBe(30_000)
    // Every other bound is unchanged: streaming relaxes silence tolerance only.
    expect(dispatcherOptsFor(true).headersTimeout).toBe(dispatcherOptsFor(false).headersTimeout)
    expect(dispatcherOptsFor(true).connectTimeout).toBe(dispatcherOptsFor(false).connectTimeout)
  })

  it('resolves distinct dispatchers per call class and caches each', async () => {
    const proxyUrl = 'http://user:sup3rs3cret@127.0.0.1:9'
    const streaming = await dispatcherForAsync(proxyUrl, { streaming: true })
    const control = await dispatcherForAsync(proxyUrl, { streaming: false })

    expect(streaming).not.toBe(control)
    // Cached per class: a stream must not reuse the control dispatcher.
    expect(await dispatcherForAsync(proxyUrl, { streaming: true })).toBe(streaming)
    expect(await dispatcherForAsync(proxyUrl, { streaming: false })).toBe(control)
  })

  it('routes a proxyless stream through the streaming env agent', async () => {
    expect(await dispatcherForAsync(undefined, { streaming: true })).toBe(proxyStreamingAgent)
    expect(proxyStreamingAgent).not.toBe(proxyAgent)
    expect(proxyStreamingAgent).toBeInstanceOf(EnvHttpProxyAgent)
  })
})
describe('proxy credential encoding (special characters)', () => {
  it('encodes a password containing @ so the proxy receives it intact', () => {
    // Spec #8 user story 22. `URL.password` returns the encoded substring, so
    // re-encoding it produced `p%2540ss`, which the proxy decodes to the literal
    // `p%40ss` and rejects (authentication failure).
    expect(normalizeProxyUrl('http://user:p@ss@127.0.0.1:9')).toBe('http://user:p%40ss@127.0.0.1:9')
    expect(normalizeProxyUrl('http://user:pa:ss@127.0.0.1:9')).toBe('http://user:pa%3Ass@127.0.0.1:9')
    expect(normalizeProxyUrl('socks5://u:p@ss@127.0.0.1:1080')).toBe('socks5://u:p%40ss@127.0.0.1:1080')
  })

  it('is idempotent, because a stored proxy URL is normalized again per request', () => {
    for (const raw of [
      'http://user:p@ss@127.0.0.1:9',
      'http://user:p%40ss@127.0.0.1:9',
      'http://user:pa:ss@h:9',
      'http://user:plain@h:9',
      'socks5://u:p@ss@h:1080',
      'http://h:8080',
    ]) {
      const once = normalizeProxyUrl(raw)
      expect(normalizeProxyUrl(once), `not idempotent for ${raw}`).toBe(once)
    }
  })

  it('leaves an already-correctly-encoded password untouched', () => {
    expect(normalizeProxyUrl('http://u:p%2Fw@h:1')).toBe('http://u:p%2Fw@h:1')
    expect(normalizeProxyUrl('http://user:plain@127.0.0.1:9')).toBe('http://user:plain@127.0.0.1:9')
  })
})
