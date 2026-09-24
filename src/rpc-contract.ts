/**
 * Wire contract for the agy management RPC (`/api/agy`).
 *
 * Type-only by construction: the browser bundle imports these shapes with
 * `import type`, which erases at build time, so the client half never links
 * host code.
 *
 * Transport is DSH's own generic RPC channel
 * (`connection.fetch.register` on the host, `connection.rpc.call` in the
 * browser) rather than plugin-owned HTTP routes. That buys the host's browser
 * trust fence and BrowserAuth for free, which the previous bare
 * `ctx.webServer.register` routes had none of, and keeps every management
 * endpoint off the public route table. The OAuth callback is the one exception
 * and stays a real HTTP route: Google redirects a browser to it.
 */

import type { ThinkingBudgets } from './thinking-types.ts'
import type { QuotaGroup } from './types.ts'
import type { UsageCounters, UsageSource } from './usage-types.ts'

export type { QuotaGroup, QuotaWindow } from './types.ts'
export type { ThinkingBudgets, ThinkingLevel } from './thinking-types.ts'

/** Account lifecycle state as the UI presents it. */
export type AccountState = 'active' | 'cooling' | 'verification-required' | 'disabled'

/** One account row. Mirrors the /agy dashboard's shape, minus stored secrets. */
export interface AccountView {
  index: number
  email: string | null
  projectId: string | null
  /** True when this is the pool's active account and it is not disabled. */
  active: boolean
  state: AccountState
  /** ISO timestamp while cooling, else null. */
  cooldownUntil: string | null
  /**
   * Why the account is cooling, or null when it is not.
   *
   * Null for an expired window: the host clears stale cooldown state before
   * rendering, so this field and `state` cannot disagree.
   */
  cooldownReason: string | null
  /**
   * When the current cooldown began, as an ISO timestamp (null when not cooling).
   *
   * The reason alone is not actionable without its age: "network-error" reads
   * the same whether it happened seconds or days ago, and the cooldown END
   * cannot yield the start because the duration is a backoff.
   */
  cooldownSetAt: string | null
  /**
   * Appeal link from an upstream verification challenge, when one was supplied.
   * The account is parked, not disabled, and recovers without user action.
   */
  verificationUrl: string | null
  /** True while the account is parked behind a verification challenge. */
  verificationRequired: boolean
  /** Per-family reset wall, as stored (`familyKey -> epoch ms`). */
  rateLimits: Record<string, number> | null
  fingerprint: { userAgent: string; deviceId: string; createdAt: number } | null
  /** Number of retained fingerprint versions (regeneration history depth). */
  fingerprintHistory: number
  /** Masked proxy (`protocol//host:port`), never credentials. */
  proxy: string | null
  /**
   * Grouped 5-hour / weekly windows for this account, or null when not yet
   * measured.
   *
   * These are upstream's per-GROUP windows (Gemini vs Claude+GPT), from
   * `retrieveUserQuotaSummary` — a different endpoint from the per-model
   * `quotaInfo` that feeds rotation. They are refreshed by a SEPARATE call
   * (`account.limits`, backed by `session.refreshLimits`) rather than riding the
   * scheduling quota refresh: that one is skipped for a solo pool because writing
   * its cache can block the only account, which is exactly why the windows are
   * fetched on a path that touches `cachedLimits` alone. So this arrives on its
   * own request, not with `account.list`.
   */
  limits: QuotaGroup[] | null
  /** When `limits` was measured (Unix ms), or null when never. */
  limitsUpdatedAt: number | null
  /** This account's ledger entry, when it has recorded traffic. */
  usage: AccountUsageView | null
}

/**
 * One account's ledger, flattened for transport.
 *
 * Only the two fields the account detail actually renders. `models` and
 * `lastUsedAt` were carried here with no reader — the per-model table that used
 * the former was removed, and the ordering rule that used the latter went with
 * it — so they are gone rather than left as a wire surface nobody consumes.
 */
export interface AccountUsageView {
  totals: UsageCounters
  sources: Record<UsageSource, number>
}

/** A model row in the Model tab. */
export interface ModelView {
  id: string
  name: string
  /** True when hidden from the DSH model selector. */
  disabled: boolean
}

/** Aggregate view the Usage tab renders, folded host-side to keep the client thin. */
export interface StatsView {
  /** When the ledger began collecting (Unix ms), or null when empty. */
  since: number | null
  /** Grand totals (all time) and their breakdown. */
  all: RangeBreakdown
  /** Today's counts and breakdown. */
  today: RangeBreakdown
  /** Last 7 days. */
  week: RangeBreakdown
  /** Last 30 days (the full retained window). */
  month: RangeBreakdown
}

/**
 * One range selection's figures: the headline counters plus the SAME counters
 * partitioned by model and by account.
 *
 * Every range carries its own breakdown so the whole page follows one
 * selection. The tables previously read all-time maps while the headline strip
 * read the selected range, so choosing "Today" showed 30 requests above a
 * 164-request row with nothing on screen to explain the difference.
 */
export interface RangeBreakdown {
  /** Headline counters for this range (uncached input, output, cache read/write). */
  counters: UsageCounters
  /** Per-model counters within this range, heaviest first. */
  models: Array<{ model: string, counters: UsageCounters }>
  /** Per-account counters within this range, heaviest first. */
  accounts: Array<{ account: string, counters: UsageCounters }>
}

/** Result of one import batch. */
export interface ImportResult {
  imported: number
  /** Accounts that replaced an existing entry (deduped by email). */
  replaced: number
  /**
   * Human-readable per-source failures; empty on full success.
   *
   * Typed as `string[]` (not `unknown`): the UI renders these verbatim, so the
   * wire contract must guarantee they are displayable text. Without surfacing
   * them a partially-failed paste looked like a no-op.
   */
  errors: string[]
}

/** Methods and their payload/result shapes. */
export interface AgyRpcMethods {
  'account.list': { payload: Record<string, never>; result: { accounts: AccountView[] } }
  'account.activate': { payload: { index: number }; result: { ok: true; index: number } }
  'account.delete': { payload: { index: number }; result: { ok: true } }
  'account.verify': { payload: { index: number }; result: { ok: boolean; email?: string; error?: string } }
  'account.health': { payload: { indices?: number[] }; result: { results: unknown[] } }
  /**
   * Refresh and return the 5h/weekly windows for every enabled account.
   *
   * Separate from `account.list` because that reply is deliberately probe-free;
   * the client renders the list immediately and merges these in on arrival.
   * Server-side this is TTL-gated, so it does not re-probe per view. It works for
   * a pool of ANY size — including a single account, which the scheduling quota
   * refresh skips (measuring that one could block the only account).
   */
  'account.limits': {
    /**
     * `force` re-probes inside the TTL, for an explicit user refresh.
     *
     * Absent (the default) keeps the TTL, so an automatic reload never spends an
     * upstream call it did not need.
     */
    payload: { force?: boolean }
    result: {
      limits: Array<{
        index: number
        groups: QuotaGroup[] | null
        updatedAt: number | null
      }>
      /** Accounts measured by THIS call. */
      measured: number
      /** Accounts whose probe was attempted and failed. */
      failed: number
      /** Accounts left alone because their snapshot was still fresh. */
      skipped: number
    }
  }
  'account.test': {
    payload: { model: string; index?: number }
    result: { ok: boolean; text?: string; error?: string }
  }
  'account.export': { payload: { index: number }; result: { blob?: string; error?: string } }
  'account.exportAll': { payload: Record<string, never>; result: { blobs: Array<{ index: number; blob: string }> } }
  'account.import': {
    payload: { kind: 'blob' | 'json'; sources: string[] }
    result: ImportResult
  }
  'account.fingerprint': {
    payload: { index: number; action: 'show' | 'regenerate' }
    result: {
      action: 'show' | 'regenerate'
      fingerprint: { userAgent: string; deviceId: string; createdAt: number } | null
      history: number
    }
  }
  'account.proxy': {
    payload: { index: number; proxy: string }
    result: { ok: true; proxy: string | null; proxyMasked: string | null; rawLogs: string | null }
  }
  'account.proxyTest': {
    payload: { index?: number; proxy?: string }
    result: { ok: boolean; masked: string; error?: string }
  }
  /** Begin an OAuth login; returns the consent URL the browser should open. */
  'auth.url': { payload: Record<string, never>; result: { url: string } }
  'model.list': { payload: Record<string, never>; result: { account: string | null; models: ModelView[] } }
  'model.setDisabled': {
    payload: { modelId: string; disabled: boolean }
    result: { modelId: string; disabled: boolean }
  }
  /**
   * The global reasoning-level budgets (see `thinking-budget.ts`).
   *
   * One map rather than per-model entries: only `*-tiered` models send a
   * `thinkingConfig` at all, and the level a user picks is already the model
   * selector's `reasoningEffort`. So the only missing piece is the token value
   * behind each level, which is the same three numbers for every such model.
   */
  'thinking.get': {
    payload: Record<string, never>
    result: {
      budgets: ThinkingBudgets
      min: number
      max: number
      /** Budget for the tiered slot (the selector's "Default" effort). */
      tieredBudget: number | null
      /** Claude-family budget (a single value; the family is id-bound). */
      claudeBudget: number | null
      /** Claude's own accepted interval, which differs from the tiered one. */
      claudeMin: number
      claudeMax: number
    }
  }
  /**
   * Set or clear one level's budget.
   *
   * Omitting `budget` (or passing null) CLEARS it, which is a distinct action:
   * the request then sends `thinkingLevel` and lets upstream choose, which is
   * the shipped default. A number outside the accepted interval is rejected
   * here rather than sent, because upstream answers 400 naming that range.
   */
  'thinking.set': {
    payload: { level: string; budget?: number | null }
    result: { budgets: ThinkingBudgets }
  }
  /**
   * Set or clear the Claude thinking budget.
   *
   * Its own call rather than a `level` value on `thinking.set`, because Claude
   * has no levels and validates differently (floor 1024, and the request needs
   * `max_tokens` strictly greater than the budget).
   */
  'thinking.setClaude': {
    payload: { budget?: number | null }
    result: { claudeBudget: number | null }
  }
  /**
   * Set or clear the tiered slot's budget.
   *
   * Its own call because the slot has no level id: `thinking.set` is keyed by
   * level, and this one is the selector's "Default" effort.
   */
  'thinking.setTiered': {
    payload: { budget?: number | null }
    result: { tieredBudget: number | null }
  }
  'stats.get': { payload: Record<string, never>; result: StatsView }
}

/** Every method name, for the host's dispatch guard and the client's typing. */
export type AgyRpcMethod = keyof AgyRpcMethods

/** Payload type of one method. */
export type AgyRpcPayload<M extends AgyRpcMethod> = AgyRpcMethods[M]['payload']

/** Result type of one method. */
export type AgyRpcResult<M extends AgyRpcMethod> = AgyRpcMethods[M]['result']

/**
 * The browser-side caller shape the UI consumes.
 *
 * `call` rejects when the host reports a failure; callers surface the message.
 */
export interface AgyRpcClient {
  call<M extends AgyRpcMethod>(
    method: M,
    payload: AgyRpcPayload<M>,
    signal?: AbortSignal,
  ): Promise<AgyRpcResult<M>>
}
