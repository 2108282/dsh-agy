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
