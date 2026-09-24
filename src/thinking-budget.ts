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
  CLAUDE_BUDGET_MAX,
  CLAUDE_BUDGET_MIN,
  isValidClaudeBudget,
} from './thinking-types.ts'
import type { ThinkingBudgets, ThinkingLevel } from './thinking-types.ts'

export const THINKING_VERSION = 1

export {
  THINKING_LEVELS,
  THINKING_BUDGET_MIN,
  THINKING_BUDGET_MAX,
} from './thinking-types.ts'
export type { ThinkingLevel, ThinkingBudgets } from './thinking-types.ts'

/**
 * The persisted document.
 *
 * `budgets` is keyed by reasoning LEVEL and applies to the tiered (Gemini)
 * family, whose single id exposes low/medium/high. `claudeBudget` is a single
 * value because the Claude family is id-bound: each capability is its own model
 * id with no level selector, so there is nothing to key by. Keeping them in one
 * document but distinct fields is what lets each carry its own validation —
 * their accepted intervals genuinely differ (Claude's floor is 1024, not -1).
 */
export interface ThinkingDocument {
  version: number
  budgets: ThinkingBudgets
  /** Budget for Claude thinking models; absent means "send no budget". */
  claudeBudget?: number
  /**
   * Budget for the TIERED slot — the selector's "Default" effort.
   *
   * That effort carries no level id (`effort: void 0`), so it cannot be keyed in
   * `budgets`. A value here sends `thinkingBudget` WITHOUT `thinkingLevel`, which
   * is what makes "Default" configurable as a Max: the effort still decides
   * nothing, the number does. Absent means the request sends no thinkingConfig at
   * all, i.e. upstream's own adaptive allocation.
   */
  tieredBudget?: number
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
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const budgets = sanitizeThinkingBudgets(record.budgets)
  const claude = record.claudeBudget
  const tiered = record.tieredBudget
  return {
    version: THINKING_VERSION,
    budgets,
    // Dropped when unusable rather than clamped, matching the level budgets: the
    // request then sends no budget, which is a valid state.
    ...(isValidClaudeBudget(claude) ? { claudeBudget: claude } : {}),
    ...(isValidThinkingBudget(tiered) ? { tieredBudget: tiered } : {}),
  }
}

export interface ThinkingBudgetOptions {
  /** Defaults to `$DSH_HOME/agy-thinking.json`. */
  file?: string
  /**
   * Minimum gap between hot-path file revalidations. Defaults to
   * `DEFAULT_REVALIDATE_INTERVAL_MS`; `0` disables throttling (useful in tests
   * that need a cross-instance write visible immediately).
   */
  revalidateIntervalMs?: number
}

/**
 * How long a hot-path read may serve the in-memory copy before re-checking the
 * file. One second keeps a settings change effectively immediate to the user
 * while collapsing a per-request read into at most one per second.
 */
export const DEFAULT_REVALIDATE_INTERVAL_MS = 1_000

/**
 * In-memory authoritative copy of the budgets, backed by a JSON file.
 *
 * `budgetFor` sits on the GENERATION HOT PATH (`toAgyRequestBody` calls it for
 * every request), so the cross-instance revalidation it needs is rate-limited:
 * see `revalidateIntervalMs`. Writes go to the file immediately, since edits are
 * rare and user-initiated, and they bypass the limit so a concurrent edit is
 * never overwritten.
 */
export class ThinkingBudgetStore {
  private readonly file: string
  private readonly revalidateIntervalMs: number
  private doc: ThinkingDocument
  /** Raw text this instance last read or wrote; see `reloadNow`. */
  private raw: string
  /** When `reloadNow` last ran, for the hot-path throttle. */
  private checkedAt: number

  constructor(options: ThinkingBudgetOptions = {}) {
    this.file = options.file ?? join(resolveDshHome(), 'agy-thinking.json')
    this.revalidateIntervalMs = options.revalidateIntervalMs ?? DEFAULT_REVALIDATE_INTERVAL_MS
    const initial = this.readWithRaw()
    this.doc = initial.doc
    this.raw = initial.raw
    this.checkedAt = Date.now()
  }

  /** Path of the backing file. */
  get path(): string {
    return this.file
  }

  private static serialize(doc: ThinkingDocument): string {
    return JSON.stringify(doc, null, 2) + '\n'
  }

  /**
   * Read the document together with the raw text it came from.
   *
   * Content, not mtime: two writers can land in the same filesystem timestamp
   * tick (Windows resolves it coarsely enough to have failed CI in this repo),
   * and a missed change is exactly the bug this check exists to prevent.
   */
  private readWithRaw(): { doc: ThinkingDocument, raw: string } {
    try {
      const raw = readFileSync(this.file, 'utf8')
      return { doc: parseThinkingDocument(raw), raw }
    } catch {
      // A missing or unreadable file means "nothing configured".
      return { doc: { version: THINKING_VERSION, budgets: {} }, raw: '' }
    }
  }

  /**
   * Re-read the file if another writer changed it.
   *
   * Compares CONTENT, not mtime: a toggle and a re-read can land in the same
   * filesystem timestamp tick, and Windows resolves that coarsely enough to have
   * failed CI in this repo (`model-visibility.ts` records the incident). Content
   * comparison cannot miss a change, whatever the clock resolution.
   *
   * Unconditional — callers on the hot path use `reloadIfChanged` instead.
   */
  private reloadNow(): void {
    let current: string
    try {
      current = readFileSync(this.file, 'utf8')
    } catch {
      current = ''
    }
    this.checkedAt = Date.now()
    if (current === this.raw) return
    const fresh = this.readWithRaw()
    this.doc = fresh.doc
    this.raw = fresh.raw
  }

  /**
   * Hot-path revalidation: `reloadNow`, rate-limited.
   *
   * Without the limit every generation pays a blocking `readFileSync` plus a
   * UTF-8 decode — the module used to claim these reads were "in-memory", which
   * an unconditional read made false. The file is written only by `setBudget`
   * (a rare, user-initiated action), so the worst case here is that a settings
   * change takes up to `revalidateIntervalMs` to reach an already-running
   * adapter. That is the right trade for a setting; it is not right for the write
   * path, which is why `write` calls `reloadNow` directly.
   */
  private reloadIfChanged(): void {
    if (Date.now() - this.checkedAt < this.revalidateIntervalMs) return
    this.reloadNow()
  }

  /**
   * Write the whole document atomically.
   *
   * Always re-reads first, so a concurrent edit by the OTHER instance in this
   * process (main plugin + web entry) is merged rather than overwritten: each
   * caller passes a mutation, not a full replacement built from a stale copy.
   */
  private write(mutate: (doc: ThinkingDocument) => void): void {
    // Unconditional: building on a throttled-skipped stale copy would drop the
    // other instance's concurrent edit, which is the whole reason for re-reading.
    this.reloadNow()
    const next: ThinkingDocument = {
      version: THINKING_VERSION,
      budgets: { ...this.doc.budgets },
      ...(this.doc.claudeBudget === undefined ? {} : { claudeBudget: this.doc.claudeBudget }),
      ...(this.doc.tieredBudget === undefined ? {} : { tieredBudget: this.doc.tieredBudget }),
    }
    mutate(next)
    const text = ThinkingBudgetStore.serialize(next)
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, text, { mode: 0o600 })
    renameSync(tmp, this.file)
    this.doc = next
    this.raw = text
  }

  /** The configured budget for one level, or undefined when unset. */
  budgetFor(level: string | undefined): number | undefined {
    this.reloadIfChanged()
    if (level === undefined) return undefined
    const key = level.toLowerCase() as ThinkingLevel
    if (!THINKING_LEVELS.includes(key)) return undefined
    return this.doc.budgets[key]
  }

  /** The Claude-family budget, or undefined when unset. */
  claudeBudget(): number | undefined {
    this.reloadIfChanged()
    return this.doc.claudeBudget
  }

  /** The tiered-slot budget (the selector's Default effort), or undefined. */
  tieredBudget(): number | undefined {
    this.reloadIfChanged()
    return this.doc.tieredBudget
  }

  /** The raw map, for the settings UI. */
  all(): ThinkingBudgets {
    this.reloadIfChanged()
    return { ...this.doc.budgets }
  }

  /** The whole document, for the settings UI. */
  snapshot(): ThinkingDocument {
    this.reloadIfChanged()
    return {
      version: THINKING_VERSION,
      budgets: { ...this.doc.budgets },
      ...(this.doc.claudeBudget === undefined ? {} : { claudeBudget: this.doc.claudeBudget }),
      ...(this.doc.tieredBudget === undefined ? {} : { tieredBudget: this.doc.tieredBudget }),
    }
  }

  /** Replace one level's budget, or clear it when `value` is undefined. */
  setBudget(level: string, value: number | undefined): ThinkingBudgets {
    const key = level.toLowerCase() as ThinkingLevel
    if (!THINKING_LEVELS.includes(key)) throw new Error(`unknown thinking level: ${level}`)
    if (value !== undefined && !isValidThinkingBudget(value)) {
      throw new Error(`thinking budget must be an integer in [${THINKING_BUDGET_MIN}, ${THINKING_BUDGET_MAX}]`)
    }
    this.write((doc) => {
      if (value === undefined) delete doc.budgets[key]
      else doc.budgets[key] = value
    })
    return this.all()
  }

  /** Replace the tiered-slot budget, or clear it when `value` is undefined. */
  setTieredBudget(value: number | undefined): ThinkingDocument {
    if (value !== undefined && !isValidThinkingBudget(value)) {
      throw new Error(`thinking budget must be an integer in [${THINKING_BUDGET_MIN}, ${THINKING_BUDGET_MAX}]`)
    }
    this.write((doc) => {
      if (value === undefined) delete doc.tieredBudget
      else doc.tieredBudget = value
    })
    return this.snapshot()
  }

  /** Replace the Claude budget, or clear it when `value` is undefined. */
  setClaudeBudget(value: number | undefined): ThinkingDocument {
    if (value !== undefined && !isValidClaudeBudget(value)) {
      throw new Error(`Claude thinking budget must be -1, 0, or an integer in [${CLAUDE_BUDGET_MIN}, ${CLAUDE_BUDGET_MAX}]`)
    }
    this.write((doc) => {
      if (value === undefined) delete doc.claudeBudget
      else doc.claudeBudget = value
    })
    return this.snapshot()
  }
}
