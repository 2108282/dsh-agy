/**
 * Thinking-budget configuration: a global Low/Medium/High -> token mapping.
 *
 * WHY A GLOBAL MAP RATHER THAN PER-MODEL. Only `*-tiered` models emit a
 * `thinkingConfig` at all (see `isLevelThinkingModel`), and today that is three
 * ids in one family — while the levels a user actually picks are already exposed
 * by DSH's own model selector (`reasoningEffort`). So the missing piece is not a
 * per-model switch but the VALUE behind each level: "High" currently means the
 * upstream's own High, with no way to say "High = 16000 tokens". One mapping of
 * three numbers gives that, and because it is keyed by level it applies to every
 * tiered model without a per-model row.
 *
 * Measured on this channel (docs/ANTIGRAVITY-API.md §3):
 *   - accepted interval is [-1, 65535]; `-1` is adaptive and IS accepted
 *   - `minThinkingBudget` is NOT a validation (a budget below it answers 200),
 *     so it must never become a client-side clamp
 *   - `0` reduces thinking but does NOT reliably disable it
 *
 * An EMPTY entry means "do not send a budget for this level" — the request keeps
 * sending `thinkingLevel`, which is the behaviour before this feature existed.
 * That is why the shipped defaults are all empty: the feature is opt-in and its
 * absence is a no-op.
 *
 * Persisted to agy's own JSON rather than `ctx.settings`, for the reason recorded
 * in `model-visibility.ts`: that service needs a `@deepseek-ai/schemastery`
 * schema, and the CLI must not import `@deepseek-ai/*` at runtime. Same
 * atomic-write and content-compare reload pattern, so a writer in one process
 * (the web entry) is seen by a reader in another (the main plugin).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from './store/keyring.ts'
import {
  THINKING_BUDGET_MAX,
  THINKING_BUDGET_MIN,
  THINKING_LEVELS,
} from './thinking-types.ts'
import type { ThinkingBudgets, ThinkingLevel } from './thinking-types.ts'

export const THINKING_VERSION = 1

export {
  THINKING_LEVELS,
  THINKING_BUDGET_MIN,
  THINKING_BUDGET_MAX,
} from './thinking-types.ts'
export type { ThinkingLevel, ThinkingBudgets } from './thinking-types.ts'

/** The persisted document. */
export interface ThinkingDocument {
  version: number
  budgets: ThinkingBudgets
}

/** Whether `value` may be sent as a `thinkingBudget`. */
export function isValidThinkingBudget(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= THINKING_BUDGET_MIN
    && value <= THINKING_BUDGET_MAX
}

/**
 * Keep only well-formed entries (tolerates hand edits).
 *
 * Rejects out-of-range and non-integer values rather than clamping them: a
 * clamped value would silently mean something the user did not ask for, and
 * upstream rejects it anyway, so dropping the entry falls back to the
 * `thinkingLevel` path — which is valid.
 */
export function sanitizeThinkingBudgets(raw: unknown): ThinkingBudgets {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: ThinkingBudgets = {}
  for (const level of THINKING_LEVELS) {
    const value = (raw as Record<string, unknown>)[level]
    if (isValidThinkingBudget(value)) out[level] = value
  }
  return out
}

export function parseThinkingDocument(text: string): ThinkingDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { version: THINKING_VERSION, budgets: {} }
  }
  const budgets = typeof raw === 'object' && raw !== null
    ? sanitizeThinkingBudgets((raw as Record<string, unknown>).budgets)
    : {}
  return { version: THINKING_VERSION, budgets }
}

export interface ThinkingBudgetOptions {
  /** Defaults to `$DSH_HOME/agy-thinking.json`. */
  file?: string
}

/**
 * In-memory authoritative copy of the budgets, backed by a JSON file.
 *
 * Reads are in-memory and cheap because `toAgyRequestBody` consults this on every
 * generation; writes go to the file immediately, since edits are rare and
 * user-initiated.
 */
export class ThinkingBudgetStore {
  private readonly file: string
  private budgets: ThinkingBudgets
  /** Raw text this instance last read or wrote; see `reloadIfChanged`. */
  private raw: string

  constructor(options: ThinkingBudgetOptions = {}) {
    this.file = options.file ?? join(resolveDshHome(), 'agy-thinking.json')
    const initial = this.readWithRaw()
    this.budgets = initial.budgets
    this.raw = initial.raw
  }

  /** Path of the backing file. */
  get path(): string {
    return this.file
  }

  private static serialize(budgets: ThinkingBudgets): string {
    const doc: ThinkingDocument = { version: THINKING_VERSION, budgets }
    return JSON.stringify(doc, null, 2) + '\n'
  }

  /**
   * Read the budgets together with the raw text they came from.
   *
   * Content, not mtime: two writers can land in the same filesystem timestamp
   * tick (Windows resolves it coarsely enough to have failed CI in this repo),
   * and a missed change is exactly the bug this check exists to prevent.
   */
  private readWithRaw(): { budgets: ThinkingBudgets, raw: string } {
    try {
      const raw = readFileSync(this.file, 'utf8')
      return { budgets: parseThinkingDocument(raw).budgets, raw }
    } catch {
      // A missing or unreadable file means "nothing configured".
      return { budgets: {}, raw: '' }
    }
  }

  private reloadIfChanged(): void {
    let current: string
    try {
      current = readFileSync(this.file, 'utf8')
    } catch {
      current = ''
    }
    if (current === this.raw) return
    const fresh = this.readWithRaw()
    this.budgets = fresh.budgets
    this.raw = fresh.raw
  }

  /** The configured budget for one level, or undefined when unset. */
  budgetFor(level: string | undefined): number | undefined {
    this.reloadIfChanged()
    if (level === undefined) return undefined
    const key = level.toLowerCase() as ThinkingLevel
    if (!THINKING_LEVELS.includes(key)) return undefined
    return this.budgets[key]
  }

  /** The raw map, for the settings UI. */
  all(): ThinkingBudgets {
    this.reloadIfChanged()
    return { ...this.budgets }
  }

  /**
   * Replace one level's budget, or clear it when `value` is undefined.
   *
   * Applied to a freshly re-read map rather than this instance's copy: with two
   * instances in one process (main plugin + web entry) editing a stale copy would
   * silently drop the other's edit.
   */
  setBudget(level: string, value: number | undefined): ThinkingBudgets {
    const key = level.toLowerCase() as ThinkingLevel
    if (!THINKING_LEVELS.includes(key)) throw new Error(`unknown thinking level: ${level}`)
    if (value !== undefined && !isValidThinkingBudget(value)) {
      throw new Error(`thinking budget must be an integer in [${THINKING_BUDGET_MIN}, ${THINKING_BUDGET_MAX}]`)
    }
    this.reloadIfChanged()
    const next: ThinkingBudgets = { ...this.budgets }
    if (value === undefined) delete next[key]
    else next[key] = value
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, ThinkingBudgetStore.serialize(next), { mode: 0o600 })
    renameSync(tmp, this.file)
    this.budgets = next
    this.raw = ThinkingBudgetStore.serialize(next)
    return { ...next }
  }
}
