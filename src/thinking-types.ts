/**
 * Thinking-budget vocabulary shared by the host store, the RPC wire contract,
 * and the browser UI.
 *
 * Split out for the same reason `usage-types.ts` exists: these types live on
 * their own, free of any `node:*` import, so the browser bundle can describe the
 * settings surface without pulling in the host's storage module. Putting them in
 * `thinking-budget.ts` instead made `rpc-contract.ts` (which the client
 * typechecks) reach `node:fs` through the transitive import — caught by
 * `tsconfig.client.json`, which includes the contract and excludes `src/store`.
 */

/** The three levels a tiered model exposes, in display order. */
export const THINKING_LEVELS = ['low', 'medium', 'high'] as const

export type ThinkingLevel = typeof THINKING_LEVELS[number]

/**
 * The accepted `thinkingBudget` interval, measured on this channel.
 *
 * Exported so the UI, the RPC validation, and the store's sanitizer share ONE
 * definition: a value outside it is a 400 from upstream naming exactly this
 * range, so rejecting it locally turns a per-request failure into a save-time
 * message.
 */
export const THINKING_BUDGET_MIN = -1
export const THINKING_BUDGET_MAX = 65_535

/** One budget per level; an ABSENT key means "send no budget" (upstream decides). */
export type ThinkingBudgets = Partial<Record<ThinkingLevel, number>>

/**
 * The Claude family's `thinkingBudget` bounds, measured separately from Gemini's.
 *
 * The two families do NOT share a contract, which is why one interval cannot
 * serve both:
 *   - Claude's floor is **1024**, not `-1`. A budget of 1 or 512 is rejected with
 *     `thinking.enabled.budget_tokens: Input should be greater than or equal to
 *     1024`; `-1` and `0` are accepted as special values.
 *   - Claude additionally requires **`max_tokens` strictly greater than the
 *     budget**: `budget=1024, max_tokens=1024` is a 400, and a budget sent with
 *     no `maxOutputTokens` at all also fails. So the margin is at least one token.
 *
 * `CLAUDE_BUDGET_MAX` is therefore one below `AGY_CLAUDE_MAX_OUTPUT_TOKENS` — the
 * largest budget that can still leave room for a strictly greater `max_tokens`.
 */
export const CLAUDE_BUDGET_MIN = 1024
export const CLAUDE_BUDGET_MAX = 63_999

/** Whether `value` may be sent as a Claude `thinkingBudget`. */
export function isValidClaudeBudget(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false
  // `-1` (adaptive) and `0` are accepted in addition to the documented minimum;
  // both are measured rather than inferred.
  if (value === -1 || value === 0) return true
  return value >= CLAUDE_BUDGET_MIN && value <= CLAUDE_BUDGET_MAX
}
