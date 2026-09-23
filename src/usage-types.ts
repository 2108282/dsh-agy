/**
 * Usage vocabulary shared by the host ledger, the RPC wire contract, and the
 * browser UI.
 *
 * These types live on their own, free of any `node:*` import, so the browser
 * bundle can describe usage without pulling in the host's storage module. The
 * ledger (`stats.ts`) and the wire contract (`rpc-contract.ts`) both build on
 * this module rather than on each other.
 */

/** Token counters, disjoint exactly like DSH's `TokenUsage`. */
export interface TokenBuckets {
  /** Uncached input tokens. */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** One scope's counters (an account, a model, a day, or the grand total). */
export interface UsageCounters extends TokenBuckets {
  /** Requests attempted, including failures. */
  requests: number
  /** Requests that returned a usable stream. */
  succeeded: number
  /** Classified upstream failures of any kind. */
  failed: number
  /** Rate-limit classifications (HTTP 429, and 403 carrying quota phrasing). */
  rateLimited: number
  /** Pool rotations triggered by a failure. */
  rotations: number
  /** Summed request wall time, and the number of requests that timed it. */
  latencyMs: number
  latencyN: number
  /** Summed time-to-first-token, and the number of requests that reported one. */
  ttftMs: number
  ttftN: number
}

/** Where a request came from; CLI/verify/test never appear in DSH's own ledger. */
export type UsageSource = 'chat' | 'cli' | 'verify' | 'test'

/** Zeroed counters, for accumulation. */
export function zeroCounters(): UsageCounters {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    requests: 0,
    succeeded: 0,
    failed: 0,
    rateLimited: 0,
    rotations: 0,
    latencyMs: 0,
    latencyN: 0,
    ttftMs: 0,
    ttftN: 0,
  }
}
