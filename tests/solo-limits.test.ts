import { describe, expect, it, vi } from 'vitest'
import { AgySessionManager } from '../src/session.ts'
import { InMemoryAccountStore } from '../src/store/accounts.ts'
import { isLimitsStale, LIMITS_CACHE_TTL_MS } from '../src/runtime/quota.ts'
import type { ManagedAccount } from '../src/types.ts'

function account(email = 'a@b.c'): ManagedAccount {
  return { email, refresh: `rt-${email}|proj-1`, projectId: 'proj-1', addedAt: 0, lastUsed: 0, enabled: true }
}
function storage(accounts: ManagedAccount[], activeIndex = 0) {
  return { version: 4 as const, accounts, activeIndex }
}

/** Stub the summary endpoint, and record whether it was called. */
function stubSummary(calls: string[], groups: unknown = [{
  displayName: 'Gemini Models',
  buckets: [{ bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.16, resetTime: '2026-09-23T19:29:55Z' }],
}]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 })
    }
    if (url.includes('retrieveUserQuotaSummary')) {
      return new Response(JSON.stringify({ groups }), { status: 200 })
    }
    if (url.includes('fetchAvailableModels')) {
      return new Response(JSON.stringify({ models: { 'gemini-3.5-flash': { quotaInfo: { remainingFraction: 0.4 } } } }), { status: 200 })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }))
}

describe('solo-account limits', () => {
  it('fills cachedLimits with ONE enabled account', async () => {
    // Regression: `refreshLimits` exists because the SCHEDULING quota refresh is
    // gated on `eligible.length > 1` — measuring a solo account's quota could
    // block the only account (verified: a measured zero-remaining family raises
    // AgyPoolBlockedError with no fallback). That gate left `cachedLimits` empty
    // forever for a single account, so the limits card read "not measured yet"
    // permanently. The display refresh must therefore work at any pool size.
    const calls: string[] = []
    stubSummary(calls)
    const store = new InMemoryAccountStore(storage([account('solo@x')]))
    const sessions = new AgySessionManager({ store })
    await sessions.refreshLimits(await store.load())

    const after = await store.load()
    expect(calls.some((url) => url.includes('retrieveUserQuotaSummary'))).toBe(true)
    expect(after.accounts[0]!.cachedLimits?.groups[0]?.windows[0]).toEqual({
      bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.16, resetTime: '2026-09-23T19:29:55Z',
    })
  })

  it('NEVER writes cachedQuota, which is what keeps a solo account unblockable', async () => {
    // The whole safety argument for ungating the display refresh: it must not
    // touch the cache that `rankPoolCandidates` turns into `blockedUntil`.
    const calls: string[] = []
    stubSummary(calls)
    const store = new InMemoryAccountStore(storage([account('solo@x')]))
    const sessions = new AgySessionManager({ store })
    await sessions.refreshLimits(await store.load())

    const after = await store.load()
    expect(after.accounts[0]!.cachedQuota).toBeUndefined()
    expect(after.accounts[0]!.cachedQuotaUpdatedAt).toBeUndefined()
    // And the request path still resolves rather than raising a pool error.
    const session = await sessions.getSession('gemini-3.5-flash')
    expect(session?.account.email).toBe('solo@x')
  })

  it('keeps selection working when the family is measured at zero', async () => {
    // The failure mode that motivated the gate, pinned so the display refresh can
    // never be "simplified" into writing cachedQuota.
    const calls: string[] = []
    stubSummary(calls)
    const solo = {
      ...account('solo@x'),
      cachedQuota: { google: { remainingFraction: 0, resetTime: '2099-01-01T00:00:00Z' } },
      cachedQuotaUpdatedAt: Date.now(),
    }
    const store = new InMemoryAccountStore(storage([solo]))
    const sessions = new AgySessionManager({ store })
    // Baseline: a measured-zero scheduling quota DOES block, which is exactly why
    // the display path must stay out of it.
    await expect(sessions.getSession('gemini-3.5-flash')).rejects.toThrow(/exhausted quota/)
  })

  it('does not re-probe while fresh, and refreshes once stale', async () => {
    const calls: string[] = []
    stubSummary(calls)
    const store = new InMemoryAccountStore(storage([account('solo@x')]))
    const sessions = new AgySessionManager({ store })
    await sessions.refreshLimits(await store.load())
    const first = calls.filter((url) => url.includes('retrieveUserQuotaSummary')).length
    expect(first).toBe(1)

    // A second call within the TTL must not hit the network again.
    await sessions.refreshLimits(await store.load())
    expect(calls.filter((url) => url.includes('retrieveUserQuotaSummary')).length).toBe(1)

    // Age the snapshot past the TTL: now it re-probes.
    await store.mutate((s) => {
      s.accounts[0]!.cachedLimits = { groups: s.accounts[0]!.cachedLimits!.groups, updatedAt: Date.now() - LIMITS_CACHE_TTL_MS - 1 }
    })
    await sessions.refreshLimits(await store.load())
    expect(calls.filter((url) => url.includes('retrieveUserQuotaSummary')).length).toBe(2)
  })

  it('leaves previous windows intact when the probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 })
      }
      if (url.includes('retrieveUserQuotaSummary')) throw new TypeError('fetch failed')
      throw new Error(`unexpected fetch: ${url}`)
    }))
    const existing = {
      ...account('solo@x'),
      cachedLimits: { groups: [{ name: 'old', windows: [] }], updatedAt: 1 },
    }
    const store = new InMemoryAccountStore(storage([existing]))
    const sessions = new AgySessionManager({ store })
    await sessions.refreshLimits(await store.load())
    // A failed probe must not erase what was already known.
    expect((await store.load()).accounts[0]!.cachedLimits?.groups[0]?.name).toBe('old')
  })

  it('treats an absent or non-numeric snapshot as stale', () => {
    expect(isLimitsStale(account())).toBe(true)
    expect(isLimitsStale({ ...account(), cachedLimits: { groups: [], updatedAt: Number.NaN } })).toBe(true)
    expect(isLimitsStale({ ...account(), cachedLimits: { groups: [], updatedAt: Date.now() } })).toBe(false)
  })
})
