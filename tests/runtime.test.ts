import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyFetchError,
  classifyHttpError,
  classifyRefreshFailure,
  describeFetchError,
  extractVerificationUrl,
  isSessionAccumulationOverflow,
} from '../src/runtime/classify.ts'
import {
  computeSoftQuotaCacheTtlMs,
  decideRotation,
  isCoolingDown,
  isFamilyRateLimited,
  pickNextAccountIndex,
  recordRateLimit,
  SOFT_QUOTA_THRESHOLD,
  VERIFICATION_COOLDOWN_MS,
} from '../src/runtime/rotation.ts'
import {
  generateFingerprint,
  getRandomizedHeaders,
  getStableHeaders,
  MAX_FINGERPRINT_HISTORY,
  recordFingerprintVersion,
  updateFingerprintVersion,
} from '../src/runtime/fingerprint.ts'
import {
  _clearSessionGenerationsForTest,
  bumpSessionGeneration,
  currentSessionGeneration,
  deriveAntigravitySessionId,
  generateAntigravityRequestId,
} from '../src/runtime/identity.ts'
import { resolveAntigravityVersion } from '../src/runtime/version.ts'
import {
  FAMILY_UNKNOWN,
  familyKeyOf,
  ingestFamilyQuotas,
  isFamilyDrained,
  isQuotaStale,
  modelFamilyOf,
  rankPoolCandidates,
  requiredDrainFor,
} from '../src/runtime/quota.ts'
import { fingerprintMode, isAgyDisabled } from '../src/runtime/risk.ts'
import type { ManagedAccount } from '../src/types.ts'

function account(): ManagedAccount {
  return { email: 'a@b.c', refresh: 'rt|p', addedAt: 0, lastUsed: 0 }
}

describe('classifyHttpError', () => {
  it('classifies 429 with Retry-After and resetTime', () => {
    const headers = new Headers({ 'retry-after': '120' })
    const result = classifyHttpError(429, headers, JSON.stringify({ resetTime: '2099-01-01T00:00:00Z' }))
    expect(result.kind).toBe('rate-limit')
    expect(result.retryAfterMs).toBe(120_000)
    expect(result.resetTime).toBe('2099-01-01T00:00:00Z')
  })

  it('sub-classifies 429 bodies into quota/soft/rate categories', () => {
    const quota = classifyHttpError(429, new Headers(), JSON.stringify({ error: { message: 'Individual quota reached. Contact your administrator to enable overages.' } }))
    expect(quota.rateLimitCategory).toBe('quota_exhausted')
    const soft = classifyHttpError(429, new Headers({ 'retry-after': '1' }), '{}')
    expect(soft.rateLimitCategory).toBe('soft_rate_limit')
    const rate = classifyHttpError(429, new Headers({ 'retry-after': '120' }), '{}')
    expect(rate.rateLimitCategory).toBe('rate_limited')
    const unknown = classifyHttpError(429, new Headers(), '{}')
    expect(unknown.rateLimitCategory).toBe('unknown')
    const resource = classifyHttpError(429, new Headers(), JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }))
    expect(resource.rateLimitCategory).toBe('quota_exhausted')
  })

  it('classifies 401 and plain 403 as auth-failure', () => {
    expect(classifyHttpError(401, new Headers()).kind).toBe('auth-failure')
    expect(classifyHttpError(403, new Headers()).kind).toBe('auth-failure')
  })

  it('classifies 403 quota walls (RESOURCE_EXHAUSTED) as rate-limit', () => {
    const quota = classifyHttpError(
      403,
      new Headers(),
      JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Individual quota reached.' } }),
    )
    expect(quota.kind).toBe('rate-limit')
    expect(quota.rateLimitCategory).toBe('quota_exhausted')
    const plain = classifyHttpError(403, new Headers(), '{"error":"access_denied"}')
    expect(plain.kind).toBe('auth-failure')
  })

  it('separates a verification challenge from dead credentials', () => {
    // The upstream asking the owner to verify is RECOVERABLE. Classifying it as
    // auth-failure permanently disabled a healthy account on a signal that meant
    // "come back after verifying".
    const challenge = classifyHttpError(403, new Headers(), JSON.stringify({
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        message: 'VALIDATION_REQUIRED',
        details: [{ metadata: { validation_url: 'https://accounts.google.com/verify?token=abc' } }],
      },
    }))
    expect(challenge.kind).toBe('verification-required')
    expect(challenge.verificationUrl).toBe('https://accounts.google.com/verify?token=abc')

    // A genuine ban is still terminal.
    const banned = classifyHttpError(
      403,
      new Headers(),
      '{"error":{"code":403,"message":"Your account has been suspended due to a violation of the Terms of Service"}}',
    )
    expect(banned.kind).toBe('auth-failure')
  })

  it('extracts the appeal link from either RPC metadata field, or textually', () => {
    expect(extractVerificationUrl(JSON.stringify({
      error: { details: [{ metadata: { appeal_url: 'https://appeal.example/x' } }] },
    }))).toBe('https://appeal.example/x')
    // Google escapes & as \u0026 inside the JSON string form.
    expect(extractVerificationUrl('please verify your account at https://x.example/v?a=1\\u0026b=2 now'))
      .toBe('https://x.example/v?a=1&b=2')
    expect(extractVerificationUrl('{"error":"no url here"}')).toBeUndefined()
    expect(extractVerificationUrl(undefined)).toBeUndefined()
  })

  it('classifies 5xx as transient with backoff retry', () => {
    expect(classifyHttpError(503, new Headers()).kind).toBe('transient')
  })

  it('classifies generic 400 as request-error (permanent) and capacity 400 as transient', () => {
    expect(classifyHttpError(400, new Headers(), '{"error":{"message":"invalid JSON payload"}}').kind).toBe('request-error')
    const overflow = classifyHttpError(400, new Headers(), 'context length exceeded maximum')
    expect(overflow.kind).toBe('transient')
    const modelGone = classifyHttpError(400, new Headers(), 'model not found')
    expect(modelGone.kind).toBe('transient')
  })

  it('classifies fetch failures as network-error', () => {
    expect(classifyFetchError(new TypeError('fetch failed')).kind).toBe('network-error')
    expect(classifyFetchError(new DOMException('aborted', 'AbortError')).kind).toBe('network-error')
  })

  // Issue #29 (1): bare socket codes mean "proxy unreachable" ONLY while an
  // explicit per-account proxy is in effect. Without one the same code is a
  // plain network error, and misreading it skipped a healthy account.
  it('reads socket failures as proxy-unreachable only when an account proxy is active', () => {
    const reset = () => {
      const error = new TypeError('fetch failed')
      ;(error as { cause?: unknown }).cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
      return error
    }

    expect(classifyFetchError(reset()).kind).toBe('network-error')
    expect(classifyFetchError(reset(), { proxyUrl: 'http://127.0.0.1:9' }).kind).toBe('proxy-unreachable')
  })

  it('keeps a tagged proxy-unreachable error fail-closed in either context', () => {
    const tagged = Object.assign(new Error('[Proxy Fast-Fail] Proxy unreachable: http://127.0.0.1:1'), {
      code: 'PROXY_UNREACHABLE',
      errorCode: 'proxy_unreachable',
    })
    expect(classifyFetchError(tagged).kind).toBe('proxy-unreachable')
    expect(classifyFetchError(tagged, { proxyUrl: 'http://127.0.0.1:9' }).kind).toBe('proxy-unreachable')
  })

  // Issue #29 (3): `fetch failed` alone hides DNS/TLS/reset/timeout/proxy causes.
  it('surfaces the sanitized cause code and message of a transport failure', () => {
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })

    const described = describeFetchError(error)
    expect(described).toContain('fetch failed')
    expect(described).toContain('UND_ERR_SOCKET')
    expect(described).toContain('other side closed')
  })

  // A refresh error repeats the wrapper text; an earlier version returned
  // "fetch failed (fetch failed)" and lost the code the user needs.
  it('reaches the transport code through a wrapper that repeats the message', () => {
    const inner = new TypeError('fetch failed')
    ;(inner as { cause?: unknown }).cause = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
    const wrapper = Object.assign(new TypeError('fetch failed'), { cause: inner })

    const described = describeFetchError(wrapper)
    expect(described).toContain('UND_ERR_SOCKET')
    expect(described).not.toContain('(fetch failed)')
  })

  it('keeps the syscall detail (hostname) rather than replacing it with the code', () => {
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND daily-cloudcode-pa.googleapis.com'),
      { code: 'ENOTFOUND' },
    )
    // The hostname is the actionable part; a bare "ENOTFOUND" would not be.
    expect(describeFetchError(error)).toContain('daily-cloudcode-pa.googleapis.com')
  })

  it('redacts a password containing @ whole, not truncated at the first @', () => {
    // RFC 3986: the userinfo delimiter is the LAST @ in the authority, so
    // `user:p@ss@host` is one credential. A character-class regex stops at the
    // first @ and leaks the tail ("ss@host").
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = Object.assign(
      new Error('connect ECONNREFUSED via http://user:p@ss@127.0.0.1:9'),
      { code: 'ECONNREFUSED' },
    )
    const described = describeFetchError(error)
    expect(described).not.toContain('p@ss')
    expect(described).not.toContain('ss@')
    expect(described).toContain('127.0.0.1:9')
  })

  it('redacts every credential in a message carrying several URLs', () => {
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = Object.assign(
      new Error('http://a:b@h1:1 then https://c:d@h2:2'),
      { code: 'ECONNREFUSED' },
    )
    const described = describeFetchError(error)
    expect(described).not.toContain('a:b')
    expect(described).not.toContain('c:d')
  })

  it('never leaks proxy credentials into the described transport failure', () => {
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = Object.assign(
      new Error('connect ECONNREFUSED via http://user:sup3rs3cret@127.0.0.1:9'),
      { code: 'ECONNREFUSED' },
    )

    const described = describeFetchError(error)
    expect(described).not.toContain('sup3rs3cret')
    expect(described).toContain('ECONNREFUSED')
  })

  it('classifies refresh failures', () => {
    expect(classifyRefreshFailure(400, 'invalid_grant').kind).toBe('auth-failure')
    expect(classifyRefreshFailure(429).kind).toBe('rate-limit')
  })
})

describe('rotation state machine', () => {
  it('rotates on rate-limit with backoff', () => {
    const acc = account()
    const decision = decideRotation('rate-limit', acc, 0, undefined, 'rate_limited')
    expect(decision.action).toBe('rotate')
    expect(acc.coolingDownUntil).toBeUndefined()
    expect(decision.backoffMs).toBeGreaterThan(0)
  })

  it('retries immediately on soft rate limits without touching the account', () => {
    const acc = account()
    const decision = decideRotation('rate-limit', acc, 0, 1500, 'soft_rate_limit')
    expect(decision.action).toBe('retry')
    expect(acc.coolingDownUntil).toBeUndefined()
  })

  it('applies a 24h cooldown on daily quota exhaustion', () => {
    const acc = account()
    const decision = decideRotation('rate-limit', acc, 0, undefined, 'quota_exhausted')
    expect(decision.action).toBe('cool')
    expect(acc.coolingDownUntil! - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000)
  })

  it('revokes on auth-failure and disables the account', () => {
    const acc = account()
    const decision = decideRotation('auth-failure', acc, 2)
    expect(decision.action).toBe('revoke')
    expect(acc.enabled).toBe(false)
    expect(acc.verificationRequired).toBe(true)
  })

  it('parks a verification challenge instead of disabling the account', () => {
    const acc = account()
    const before = Date.now()
    const decision = decideRotation('verification-required', acc, 0)

    // Recoverable: the credential is intact, so the account must stay ENABLED and
    // come back on its own. `revoke` here was the defect — it permanently
    // disabled healthy accounts on an upstream request to verify.
    expect(decision.action).toBe('cool')
    expect(acc.enabled).not.toBe(false)
    expect(acc.coolingDownUntil).toBeGreaterThanOrEqual(before + VERIFICATION_COOLDOWN_MS)
    expect(acc.cooldownReason).toBe('validation-required')
    // The challenge state is still recorded, so the UI can explain the pause.
    expect(acc.verificationRequired).toBe(true)
    expect(acc.verificationRequiredReason).toBe('validation-required')
  })

  it('retries transient failures without mutating state', () => {
    const acc = account()
    const decision = decideRotation('transient', acc, 0)
    expect(decision.action).toBe('retry')
    expect(acc.coolingDownUntil).toBeUndefined()
  })

  it('no-ops on request-error: no cooldown, no rotation, no revoke', () => {
    const acc = account()
    const decision = decideRotation('request-error', acc, 0)
    expect(decision.action).toBe('noop')
    expect(acc.coolingDownUntil).toBeUndefined()
    expect(acc.enabled).not.toBe(false)
    expect(acc.verificationRequired).toBeUndefined()
  })

  it('backs off exponentially across tiers', () => {
    const acc = account()
    const d0 = decideRotation('network-error', acc, 0)
    const acc5 = account()
    const d5 = decideRotation('network-error', acc5, 5)
    expect(d5.backoffMs).toBeGreaterThan(d0.backoffMs)
  })

  it('cools daily quota until the real reset time (capped at 24h)', () => {
    const before = Date.now()
    const acc = account()
    const decision = decideRotation('rate-limit', acc, 0, undefined, 'quota_exhausted', new Date(before + 2 * 60 * 60 * 1000).toISOString())
    expect(decision.action).toBe('cool')
    expect(acc.coolingDownUntil!).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000 - 1000)
    expect(acc.coolingDownUntil!).toBeLessThan(before + 2 * 60 * 60 * 1000 + 5000)

    const far = account()
    decideRotation('rate-limit', far, 0, undefined, 'quota_exhausted', new Date(before + 48 * 60 * 60 * 1000).toISOString())
    expect(far.coolingDownUntil! - before).toBeLessThan(24 * 60 * 60 * 1000 + 5000)
  })

  it('cools per-minute limits until the real reset (capped at 30min), ignoring past resets', () => {
    const before = Date.now()
    const acc = account()
    const decision = decideRotation('rate-limit', acc, 0, undefined, 'rate_limited', new Date(before + 10 * 60 * 1000).toISOString())
    expect(decision.action).toBe('rotate')
    expect(decision.backoffMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000)
    expect(decision.backoffMs).toBeLessThan(10 * 60 * 1000 + 5000)

    const far = account()
    const farDecision = decideRotation('rate-limit', far, 0, undefined, 'rate_limited', new Date(before + 48 * 60 * 1000).toISOString())
    expect(farDecision.backoffMs).toBeLessThan(30 * 60 * 1000 + 5000)

    const past = account()
    const pastDecision = decideRotation('rate-limit', past, 0, undefined, 'rate_limited', new Date(before - 60 * 1000).toISOString())
    expect(pastDecision.backoffMs).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000)
    expect(pastDecision.backoffMs).toBeLessThan(5 * 60 * 1000 + 5000)
  })

  it('picks the next eligible account round-robin', () => {
    const a = { ...account(), email: 'a' }
    const b = { ...account(), email: 'b' }
    const c = { ...account(), email: 'c' }
    const accounts = [a, b, c]
    expect(pickNextAccountIndex(accounts, 0)).toBe(1)
    expect(pickNextAccountIndex(accounts, 2)).toBe(0)
    // cooling accounts are skipped
    const cooling = { ...account(), email: 'd', coolingDownUntil: Date.now() + 60_000 }
    expect(pickNextAccountIndex([a, cooling, c], 0)).toBe(2)
    // single account stays put
    expect(pickNextAccountIndex([a], 0)).toBe(0)
  })

  it('tracks rate limits and cooldowns', () => {
    const acc = account()
    recordRateLimit(acc, 'gemini-x', Date.now() + 5000)
    // The live reader is family-scoped; `isFamilyDrained`/ranking consume the
    // same map, which is what actually keeps a limited account out of rotation.
    expect(isFamilyRateLimited(acc, 'gemini-x')).toBe(true)
    expect(isFamilyRateLimited(acc, 'claude-x')).toBe(false)
    expect(isCoolingDown(acc)).toBe(false)
    const cooled = { ...account(), coolingDownUntil: Date.now() + 5000 }
    expect(isCoolingDown(cooled)).toBe(true)
  })

  it('soft quota pre-check avoids burning requests', () => {
    // The live pre-check is `isFamilyDrained` (quota.ts), exercised in the family
    // quota helpers below; this asserts the shared threshold it reads.
    expect(SOFT_QUOTA_THRESHOLD).toBeGreaterThan(0)
    expect(SOFT_QUOTA_THRESHOLD).toBeLessThan(1)
  })

  it('computes quota cache TTLs by health', () => {
    expect(computeSoftQuotaCacheTtlMs(0.05)).toBe(60_000)
    expect(computeSoftQuotaCacheTtlMs(0.3)).toBe(5 * 60 * 1000)
    expect(computeSoftQuotaCacheTtlMs(0.9)).toBe(15 * 60 * 1000)
    expect(computeSoftQuotaCacheTtlMs(undefined)).toBe(10 * 60 * 1000)
  })
})

describe('fingerprint', () => {
  it('generates valid fingerprints from the external data', () => {
    const fp = generateFingerprint()
    expect(fp.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(fp.sessionToken).toMatch(/^[0-9a-f]{32}$/)
    expect(fp.userAgent).toMatch(/^antigravity\/\d+\.\d+\.\d+ (windows|darwin)\/\S+$/)
    expect(fp.clientMetadata.ideType).toBe('ANTIGRAVITY')
    // Client-Metadata must only transmit ideType (backend rejects extras)
    expect(Object.keys(fp.clientMetadata)).toEqual(['ideType'])
  })

  it('randomizes per-request headers across the pools', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const headers = getRandomizedHeaders()
      expect(headers['Client-Metadata']).toContain('"ideType":"ANTIGRAVITY"')
      seen.add(headers['X-Goog-Api-Client'])
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('updates the version inside a fingerprint UA', () => {
    const fp = generateFingerprint()
    const before = fp.userAgent
    expect(updateFingerprintVersion(fp, '9.9.9')).toBe(true)
    expect(fp.userAgent).toContain('antigravity/9.9.9')
    expect(updateFingerprintVersion(fp, '9.9.9')).toBe(false)
    expect(fp.userAgent).toBe(before.replace(/antigravity\/[\d.]+/, 'antigravity/9.9.9'))
  })

  it('bounds the fingerprint history to the most recent entries', () => {
    let history: ReturnType<typeof recordFingerprintVersion> | undefined
    history = recordFingerprintVersion(history, generateFingerprint(), 'initial')
    for (let i = 0; i < 3; i++) {
      history = recordFingerprintVersion(history, generateFingerprint(), 'regenerated')
    }
    expect(history!.length).toBe(4)

    // Eviction keeps only the newest MAX_FINGERPRINT_HISTORY entries. The history
    // is an audit trail of identities this account has presented; it is
    // deliberately not restorable (see the non-goals in the review doc).
    let evicted = history
    for (let i = 0; i < 8; i++) {
      evicted = recordFingerprintVersion(evicted, generateFingerprint(), 'regenerated')
    }
    expect(evicted!.length).toBe(MAX_FINGERPRINT_HISTORY)
    expect(evicted!.at(-1)!.reason).toBe('regenerated')
  })

  it('pins deterministic fallback headers for the stable mode', () => {
    const first = getStableHeaders()
    const second = getStableHeaders()
    expect(first).toEqual(second)
    expect(first['Client-Metadata']).toContain('"ideType"')
    expect(Object.keys(first).sort()).toEqual(['Client-Metadata', 'User-Agent', 'X-Goog-Api-Client'])
  })
})

describe('risk controls', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads the kill switch and fingerprint mode from env', () => {
    vi.stubEnv('DSH_AGY_DISABLE', '1')
    expect(isAgyDisabled()).toBe(true)
    vi.stubEnv('DSH_AGY_DISABLE', '')
    expect(isAgyDisabled()).toBe(false)

    vi.stubEnv('DSH_AGY_FINGERPRINT_MODE', 'stable')
    expect(fingerprintMode()).toBe('stable')
    vi.stubEnv('DSH_AGY_FINGERPRINT_MODE', 'dynamic')
    expect(fingerprintMode()).toBe('dynamic')
    vi.unstubAllEnvs()
    expect(fingerprintMode()).toBe('dynamic')
  })
})

describe('identity', () => {
  it('generates request ids in backend shape', () => {
    expect(generateAntigravityRequestId()).toMatch(/^agent\/\d+\/[0-9a-f]{8}$/)
  })

  it('derives stable per-account session ids', () => {
    const a = deriveAntigravitySessionId('user@example.com')
    const b = deriveAntigravitySessionId('user@example.com')
    expect(a).toBe(b)
    expect(a).toMatch(/^-\d+$/)
    expect(deriveAntigravitySessionId('')).toBeNull()
    expect(deriveAntigravitySessionId(null)).toBeNull()
  })

  it('scopes the session id to one conversation, not one account', () => {
    const account = 'user@example.com'
    const conversation = 'session-1'
    const scoped = deriveAntigravitySessionId(account, conversation, 0)

    // Stable across a conversation's turns: the upstream accumulates input per
    // sessionId, so a drifting id would abandon the server-side session.
    expect(deriveAntigravitySessionId(account, conversation, 0)).toBe(scoped)
    expect(scoped).toMatch(/^-\d+$/)

    // A different conversation on the SAME account must not share an upstream
    // session. A single per-account constant made every conversation look like
    // one session — a structural anomaly no official client produces.
    expect(deriveAntigravitySessionId(account, 'session-2', 0)).not.toBe(scoped)

    // A generation bump must name a fresh upstream session (the 1M recovery).
    expect(deriveAntigravitySessionId(account, conversation, 1)).not.toBe(scoped)

    // Neither may another account.
    expect(deriveAntigravitySessionId('other@example.com', conversation, 0)).not.toBe(scoped)
  })

  it('degrades to the per-account id when no conversation is supplied', () => {
    // The standalone CLI has no session store; it must not invent a conversation
    // (a random id would look like a brand-new session on every single call).
    const perAccount = deriveAntigravitySessionId('user@example.com')
    expect(deriveAntigravitySessionId('user@example.com', undefined, 0)).toBe(perAccount)
    expect(deriveAntigravitySessionId('user@example.com', null, 0)).toBe(perAccount)
  })

  it('tracks one generation counter per (account, conversation)', () => {
    _clearSessionGenerationsForTest()
    const account = 'user@example.com'
    expect(currentSessionGeneration(account, 'a')).toBe(0)
    expect(currentSessionGeneration(account, 'b')).toBe(0)

    expect(bumpSessionGeneration(account, 'a')).toBe(1)
    // Bumping one conversation must not disturb another, nor another account.
    expect(currentSessionGeneration(account, 'b')).toBe(0)
    expect(currentSessionGeneration('other@example.com', 'a')).toBe(0)
    expect(bumpSessionGeneration(account, 'a')).toBe(2)
  })
})

describe('session accumulation wall', () => {
  /** The measured upstream body for a session whose server-side input passed 1M. */
  const WALL =
    '{"error":{"code":400,"message":"The input token count exceeds the maximum number of tokens allowed for the model: 1048576"}}'

  it('detects the bumpable per-session wall', () => {
    expect(isSessionAccumulationOverflow(400, WALL)).toBe(true)
    expect(isSessionAccumulationOverflow(400, 'input token count exceeds the maximum')).toBe(true)
  })

  it('does not treat an ordinary 400 or another status as the wall', () => {
    // A generic 400 is a malformed request: resending it under a bumped session
    // id would send the same broken payload again.
    expect(isSessionAccumulationOverflow(400, '{"error":{"code":400,"message":"Request contains an invalid argument."}}')).toBe(false)
    expect(isSessionAccumulationOverflow(400, undefined)).toBe(false)
    expect(isSessionAccumulationOverflow(500, WALL)).toBe(false)
    expect(isSessionAccumulationOverflow(429, WALL)).toBe(false)
  })
})

describe('version resolver', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('picks the newest semver from sources', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('antigravity-auto-updater')) {
        return new Response(JSON.stringify([{ version: '1.15.0' }, { version: '1.20.1' }]), { status: 200 })
      }
      return new Response(JSON.stringify({ tag_name: 'v1.19.0' }), { status: 200 })
    }) as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

    const version = await resolveAntigravityVersion(fetchImpl)
    expect(version).toBe('1.20.1')
  })

  it('falls back to the pinned version when sources fail', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    const version = await resolveAntigravityVersion(fetchImpl)
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('quota family mapping', () => {
  it('maps model ids to backend counter families', () => {
    expect(modelFamilyOf('gemini-3.5-flash')).toBe('google')
    expect(modelFamilyOf('gemma-3-27b')).toBe('google')
    expect(modelFamilyOf('claude-sonnet-4-6')).toBe('anthropic')
    expect(modelFamilyOf('gpt-oss-120b-medium')).toBe('openai')
    expect(modelFamilyOf('openai/gpt-5.1')).toBe('openai')
    expect(modelFamilyOf('some-custom-model')).toBeUndefined()
    expect(modelFamilyOf(undefined)).toBeUndefined()
    expect(familyKeyOf('some-custom-model')).toBe(FAMILY_UNKNOWN)
  })
})

describe('family quota ingestion', () => {
  it('aggregates per-model quotaInfo into the most-pressured family record', () => {
    const ingested = ingestFamilyQuotas({
      models: {
        'gemini-a': { quotaInfo: { remainingFraction: 0.2, resetTime: '2099-01-01T00:00:00Z' } },
        'gemini-b': { quotaInfo: { remainingFraction: 0.05, resetTime: '2098-01-01T00:00:00Z' } },
        'claude-x': { quotaInfo: { remainingFraction: 0.5 } },
        'weird-1': { quotaInfo: { remainingFraction: 0.9 } },
        'no-quota-model': {},
      },
    })
    expect(ingested).toEqual({
      google: { remainingFraction: 0.05, resetTime: '2098-01-01T00:00:00Z', modelCount: 2 },
      anthropic: { remainingFraction: 0.5, modelCount: 1 },
      unknown: { remainingFraction: 0.9, modelCount: 1 },
    })
  })

  it('keeps family entries separate and drops models without quota info', () => {
    expect(ingestFamilyQuotas({ models: { 'claude-a': { quotaInfo: { remainingFraction: 0.1 } } } })).toEqual({
      anthropic: { remainingFraction: 0.1, modelCount: 1 },
    })
    expect(ingestFamilyQuotas({})).toEqual({})
    expect(ingestFamilyQuotas({ models: undefined })).toEqual({})
  })
})

describe('family quota helpers', () => {
  function withQuota(quota: Record<string, { remainingFraction?: number; resetTime?: string }>, updatedAt = Date.now()): ManagedAccount {
    const acc = account()
    acc.cachedQuota = quota
    acc.cachedQuotaUpdatedAt = updatedAt
    return acc
  }

  it('detects drained families below the soft threshold, ignoring past resets', () => {
    const acc = withQuota({ google: { remainingFraction: 0.05 } })
    expect(isFamilyDrained(acc, 'google')).toBe(true)
    expect(isFamilyDrained(acc, 'anthropic')).toBe(false)
    const resetting = withQuota({ google: { remainingFraction: 0.05, resetTime: '2000-01-01T00:00:00Z' } })
    expect(isFamilyDrained(resetting, 'google')).toBe(false)
    expect(isFamilyDrained(account())).toBe(false)
  })

  it('flags stale caches by health-based TTL', () => {
    expect(isQuotaStale(account())).toBe(true)
    expect(isQuotaStale(withQuota({ google: { remainingFraction: 0.9 } }))).toBe(false)
    const stale = withQuota({ google: { remainingFraction: 0.9 } }, Date.now() - 20 * 60 * 1000)
    expect(isQuotaStale(stale)).toBe(true)
    const drainedTtl = withQuota({ google: { remainingFraction: 0.05 } }, Date.now() - 2 * 60 * 1000)
    expect(isQuotaStale(drainedTtl)).toBe(true)
  })

  it('computes required-drain from headroom and reset proximity', () => {
    expect(requiredDrainFor(undefined)).toBe(0)
    expect(requiredDrainFor({ remainingFraction: 0 })).toBe(0)
    const day = requiredDrainFor({ remainingFraction: 0.5 })
    expect(day).toBeCloseTo(0.5 / 24, 4)
    const hour = requiredDrainFor({ remainingFraction: 0.5, resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    expect(hour).toBeCloseTo(0.5 / 1, 2)
  })
})

describe('pool candidate ranking', () => {
  function entry(index: number, quota?: { remainingFraction?: number; resetTime?: string }, extra: Partial<ManagedAccount> = {}) {
    const acc: ManagedAccount = { email: `a${index}@x`, refresh: `rt-${index}|p`, addedAt: 0, lastUsed: 0 }
    if (quota) {
      acc.cachedQuota = { google: quota }
      acc.cachedQuotaUpdatedAt = Date.now()
    }
    return { account: { ...acc, ...extra }, index }
  }

  it('orders unblocked before hot before unmeasured before blocked, by drain then usage', () => {
    const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const entries = [
      entry(0, { remainingFraction: 0.9, resetTime: twoHours }), // headroom 0.9 → drain 0.45
      entry(1, { remainingFraction: 0.5, resetTime: twoHours }), // headroom 0.5 → drain 0.25
      entry(2), // unmeasured
      entry(3, { remainingFraction: 0.1 }), // hot (used 0.9 ≥ 0.85)
      entry(4, undefined, { coolingDownUntil: Date.now() + 60_000 }), // blocked
    ]
    const ranked = rankPoolCandidates(entries, 'gemini-3.5-flash')
    expect(ranked.map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('blocks exhausted families until their reset and sorts blocked by unblock time', () => {
    const reset = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    const entries = [
      entry(0, { remainingFraction: 0, resetTime: reset }),
      entry(1, undefined, { coolingDownUntil: Date.now() + 60 * 60 * 1000 }),
      entry(2, undefined, { coolingDownUntil: Date.now() + 30 * 60 * 1000 }),
    ]
    const ranked = rankPoolCandidates(entries, 'gemini-3.5-flash')
    expect(ranked.map((c) => c.index)).toEqual([2, 1, 0])
    expect(ranked[2]!.blockedUntil).toBeGreaterThan(Date.now() + 2 * 60 * 60 * 1000)
  })

  it('keeps the rotation-order bias when nobody is measured', () => {
    const entries = [entry(0), entry(1), entry(2)]
    const ranked = rankPoolCandidates(entries, undefined, Date.now(), 1)
    expect(ranked.map((c) => c.index)).toEqual([1, 2, 0])
  })

  it('ranks per family, so a pressured anthropic family does not affect gemini picks', () => {
    const anthropic = entry(0)
    anthropic.account.cachedQuota = { anthropic: { remainingFraction: 0.02 }, google: { remainingFraction: 0.9 } }
    anthropic.account.cachedQuotaUpdatedAt = Date.now()
    const googleHeavy = entry(1)
    googleHeavy.account.cachedQuota = { google: { remainingFraction: 0.3 } }
    googleHeavy.account.cachedQuotaUpdatedAt = Date.now()
    const ranked = rankPoolCandidates([anthropic, googleHeavy], 'gemini-3.5-flash')
    // For gemini: entry 0 has more headroom (0.9) than entry 1 (0.3) → ranked first.
    expect(ranked.map((c) => c.index)).toEqual([0, 1])
  })
})
