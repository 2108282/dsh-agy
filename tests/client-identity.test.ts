import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  AGY_CLI_IDENTITY,
  assertCloudCodeIdentity,
  buildCloudCodeHeaders,
  officialCliUserAgent,
} from '../src/oauth/client.ts'
import {
  AGY_ENDPOINT_FALLBACKS,
  AGY_QUOTA_ENDPOINT_FALLBACKS,
  getAgyBootstrapUserAgent,
  setResolvedAgyVersion,
} from '../src/oauth/constants.ts'
import { loadCodeAssist } from '../src/oauth/exchange.ts'
import { AgyAdapter, buildRequestHeaders } from '../src/adapter/adapter.ts'
import { fetchAvailableModels } from '../src/adapter/models.ts'
import { fetchQuotaSummary } from '../src/adapter/quota-summary.ts'
import { proxiedFetch } from '../src/proxy.ts'
import { AgySessionManager } from '../src/session.ts'
import { InMemoryAccountStore } from '../src/store/accounts.ts'
import type { AgyAccountSession } from '../src/types.ts'

// An independent wire expectation: deriving this from the builder under test
// would let a wrong version, auth provider, or SDK identity pass every assertion.
const CANONICAL_UA = 'antigravity/cli/1.5.8 (aidev_client; os_type=linux; arch=arm64; cl=1020628950; auth_method=consumer)'
const ACCESS_TOKEN = 'offline-access-token'
const PROJECT = 'offline-project'
const CLOUD_CODE_URL = `${AGY_ENDPOINT_FALLBACKS[0]}/v1internal:fetchAvailableModels`

function session(): AgyAccountSession {
  return {
    auth: { access: ACCESS_TOKEN, expires: Date.now() + 3_600_000, refresh: 'offline-refresh' },
    account: {
      email: 'offline@example.test', refresh: 'offline-refresh', projectId: PROJECT,
      addedAt: 0, lastUsed: 0, enabled: true,
    },
    index: 0,
    // Persisted fingerprints and harness attribution must never choose wire identity.
    impersonation: {
      'User-Agent': 'antigravity/9.9.9 darwin/arm64',
      'X-Goog-Api-Client': 'google-cloud-sdk vscode/9.9.9',
      clientMetadata: { ideType: 'ANTIGRAVITY', ideVersion: '9.9.9' },
      'user-agent': 'deepseek-harness/offline',
      'Client-Metadata': '{"ideType":"ANTIGRAVITY"}',
      'x-goog-request-id': 'invented-id',
    } as AgyAccountSession['impersonation'],
  }
}

function expectWireIdentity(init: RequestInit | undefined, streaming = false): Headers {
  expect(init?.headers).toBeDefined()
  const headers = new Headers(init!.headers)
  expect(headers.get('user-agent')).toBe(CANONICAL_UA)
  expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
  expect(headers.get('content-type')).toBe('application/json')
  expect([...headers.keys()].sort()).toEqual([
    'authorization', 'content-type', 'user-agent',
    ...(headers.has('accept') ? ['accept'] : []),
  ].sort())
  if (streaming) expect(headers.get('accept')).toBe('text/event-stream')
  // The raw input must also be valid, before Headers folds case variants together.
  expect(() => assertCloudCodeIdentity(init!.headers)).not.toThrow()
  return headers
}

function streamResponse(): Response {
  return new Response('data: {"candidates":[{"content":{"parts":[{"text":"OK"}]},"finishReason":"STOP"}]}\n\ndata: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  })
}

const invalidHeaders: Array<[string, HeadersInit | undefined]> = [
  ['undefined headers', undefined],
  ['missing User-Agent', { authorization: 'Bearer token' }],
  ['empty User-Agent', { 'User-Agent': '' }],
  ['old short User-Agent', { 'User-Agent': 'antigravity/2.0.0 darwin/arm64' }],
  ['hub User-Agent', { 'User-Agent': CANONICAL_UA.replace('/cli/', '/hub/') }],
  ['wrong changelist', { 'User-Agent': CANONICAL_UA.replace('1020628950', '1020628951') }],
  ['wrong auth method', { 'User-Agent': CANONICAL_UA.replace('consumer', 'oauth') }],
  ['comma-joined attribution', { 'User-Agent': `${CANONICAL_UA}, deepseek-harness/offline` }],
  ['case-duplicate record', { 'User-Agent': CANONICAL_UA, 'user-agent': CANONICAL_UA }],
  ['case-duplicate tuples', [['User-Agent', CANONICAL_UA], ['user-agent', CANONICAL_UA]]],
  ['same-case duplicate tuples', [['User-Agent', CANONICAL_UA], ['User-Agent', CANONICAL_UA]]],
  ['already-folded Headers', new Headers([['User-Agent', CANONICAL_UA], ['user-agent', CANONICAL_UA]])],
  ...[
    'X-Goog-Api-Client', 'x-GOOG-api-CLIENT', 'Client-Metadata', 'client-metadata',
    'x-goog-request-id', 'X-Client-Name', 'x-client-version', 'x-machine-id', 'x-vscode-sessionid',
  ].map((name): [string, HeadersInit] => [
    `forbidden ${name}`, { 'User-Agent': CANONICAL_UA, [name]: 'invented-identity' },
  ]),
]

beforeEach(() => {
  // Even pure tests fail closed if an import or future refactor introduces I/O.
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Unexpected fetch in offline identity test')
  }))
})

afterEach(() => {
  setResolvedAgyVersion(undefined)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('official CLI identity contract', () => {
  it('pins the measured consumer CLI identity and exact User-Agent bytes', () => {
    expect(AGY_CLI_IDENTITY).toEqual({
      version: '1.5.8', changelist: '1020628950', osType: 'linux', arch: 'arm64', authMethod: 'consumer',
    })
    expect(officialCliUserAgent()).toBe(CANONICAL_UA)
  })

  it.each([false, true])('builds only contract headers (streaming=%s)', (streaming) => {
    const built = buildCloudCodeHeaders(ACCESS_TOKEN, streaming)
    expect(typeof built).toBe('object')
    expect(built).not.toBeInstanceOf(Headers)
    expect(Object.values(built).every((value) => typeof value === 'string')).toBe(true)
    const headers = expectWireIdentity({ headers: built }, streaming)
    if (!streaming) expect(headers.get('accept')).not.toBe('text/event-stream')
  })

  it('keeps the default builder nonstreaming and returns fresh header records', () => {
    const first = buildCloudCodeHeaders(ACCESS_TOKEN)
    expectWireIdentity({ headers: first })
    first['User-Agent'] = 'changed by caller'
    expect(new Headers(buildCloudCodeHeaders(ACCESS_TOKEN)).get('user-agent')).toBe(CANONICAL_UA)
  })

  it.each(['2.0.0', '9.8.7', undefined])('bootstrap identity ignores runtime version %s', (version) => {
    setResolvedAgyVersion(version)
    expect(getAgyBootstrapUserAgent()).toBe(CANONICAL_UA)
    expect(officialCliUserAgent()).toBe(CANONICAL_UA)
  })

  it.each([
    ['record', { 'uSeR-aGeNt': CANONICAL_UA, authorization: 'Bearer token', accept: 'application/json' }],
    ['tuples', [['user-agent', CANONICAL_UA], ['content-type', 'application/json']]],
    ['Headers', new Headers({ 'User-Agent': CANONICAL_UA })],
  ] as Array<[string, HeadersInit]>)('accepts a single canonical identity in %s', (_label, headers) => {
    expect(() => assertCloudCodeIdentity(headers)).not.toThrow()
  })

  it.each(invalidHeaders)('rejects %s', (_label, headers) => {
    expect(() => assertCloudCodeIdentity(headers)).toThrow()
  })
})

describe('Cloud Code control-plane wire identity', () => {
  it('uses canonical headers on model discovery, including endpoint fallback', async () => {
    const payload = { models: { 'gemini-3.8-flash-tiered': { displayName: 'Gemini Flash' } } }
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', fetchSpy)
    setResolvedAgyVersion('9.8.7')

    expect(await fetchAvailableModels(ACCESS_TOKEN, PROJECT)).toEqual(payload)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mock.calls.forEach(([url, init], index) => {
      expect(String(url)).toBe(`${AGY_ENDPOINT_FALLBACKS[index]}/v1internal:fetchAvailableModels`)
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ project: PROJECT })
      expectWireIdentity(init)
    })
  })

  it('keeps the same identity while quota endpoints contribute different groups', async () => {
    const thirdParty = { displayName: 'Claude and GPT Models', buckets: [{ bucketId: '3p-5h', window: '5h', remainingFraction: 0.7 }] }
    const gemini = { displayName: 'Gemini Models', buckets: [{ bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.8 }] }
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}))
      .mockResolvedValueOnce(Response.json({ groups: [thirdParty] }))
      .mockResolvedValueOnce(Response.json({ groups: [gemini] }))
    vi.stubGlobal('fetch', fetchSpy)

    const groups = await fetchQuotaSummary(ACCESS_TOKEN, PROJECT)
    expect(groups.map((group) => group.name)).toEqual(['Claude and GPT Models', 'Gemini Models'])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mock.calls.forEach(([url, init], index) => {
      expect(String(url)).toBe(`${AGY_QUOTA_ENDPOINT_FALLBACKS[index]}/v1internal:retrieveUserQuotaSummary`)
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ project: PROJECT })
      expectWireIdentity(init)
    })
  })

  it('uses canonical project bootstrap headers after an endpoint rejects the request', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ cloudaicompanionProject: { id: PROJECT } }))
    vi.stubGlobal('fetch', fetchSpy)
    setResolvedAgyVersion('9.8.7')

    expect(await loadCodeAssist(ACCESS_TOKEN)).toMatchObject({ projectId: PROJECT })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mock.calls.forEach(([url, init], index) => {
      expect(String(url)).toBe(`${AGY_ENDPOINT_FALLBACKS[index]}/v1internal:loadCodeAssist`)
      expect(init?.method).toBe('POST')
      expectWireIdentity(init)
    })
  })
})

describe('generation and transport wire identity', () => {
  it('rebuilds adapter headers independently of stale fingerprint and attribution fields', () => {
    expectWireIdentity({ headers: buildRequestHeaders(session()) }, true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends only canonical identity through the complete adapter stream path', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const adapter = new AgyAdapter({ getSession: async () => session(), reportFailure: vi.fn() })
    const chunks = []
    for await (const chunk of adapter.stream({
      provider: 'agy', model: 'gemini-3.6-flash-high',
      messages: [{ id: 'offline-message', role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as GenerateOptions)) chunks.push(chunk)

    expect(chunks).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'OK' }))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('/v1internal:streamGenerateContent?alt=sse')
    expectWireIdentity(init, true)
  })

  it('testCall sends the same generation headers as the adapter builder', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const sessions = new AgySessionManager({ store: new InMemoryAccountStore() })
    vi.spyOn(sessions, 'getSession').mockResolvedValue(session())

    expect(await sessions.testCall('gemini-3.6-flash-high')).toMatchObject({ ok: true, text: 'OK' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('/v1internal:streamGenerateContent?alt=sse')
    expectWireIdentity(init, true)
    expect([...new Headers(init?.headers)]).toEqual([...new Headers(buildRequestHeaders(session()))])
  })

  it('transport accepts a canonical Cloud Code request without changing its identity', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ models: {} }))
    vi.stubGlobal('fetch', fetchSpy)
    await proxiedFetch(CLOUD_CODE_URL, { method: 'POST', headers: buildCloudCodeHeaders(ACCESS_TOKEN), body: '{}' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expectWireIdentity(fetchSpy.mock.calls[0]![1])
  })

  it.each(invalidHeaders)('transport rejects %s before invoking fetch', async (_label, headers) => {
    await expect(proxiedFetch(CLOUD_CODE_URL, { method: 'POST', headers, body: '{}' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
