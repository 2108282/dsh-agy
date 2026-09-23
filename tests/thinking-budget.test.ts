import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  THINKING_BUDGET_MAX,
  THINKING_BUDGET_MIN,
  ThinkingBudgetStore,
  isValidThinkingBudget,
  parseThinkingDocument,
  sanitizeThinkingBudgets,
} from '../src/thinking-budget.ts'

function scratch(): string {
  return join(mkdtempSync(join(tmpdir(), 'agy-thinking-test-')), 'agy-thinking.json')
}

describe('thinking budget store', () => {
  it('starts empty, so the feature is a no-op until configured', () => {
    // The shipped default must not change any request: an empty map keeps the
    // `thinkingLevel` path exactly as it was before this setting existed.
    const store = new ThinkingBudgetStore({ file: scratch() })
    expect(store.all()).toEqual({})
    expect(store.budgetFor('high')).toBeUndefined()
  })

  it('persists per level and reads back', () => {
    const file = scratch()
    const store = new ThinkingBudgetStore({ file })
    store.setBudget('high', 16000)
    store.setBudget('low', 1000)
    expect(store.all()).toEqual({ low: 1000, high: 16000 })
    // A fresh instance sees it, i.e. it really went to disk.
    expect(new ThinkingBudgetStore({ file }).all()).toEqual({ low: 1000, high: 16000 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: 1, budgets: { low: 1000, high: 16000 },
    })
  })

  it('clears a level, which is distinct from setting 0', () => {
    // Clearing returns to "let upstream decide"; 0 is a real value that reduces
    // thinking (measured: it does not reliably disable it). Conflating them would
    // make "no preference" indistinguishable from "as little as possible".
    const store = new ThinkingBudgetStore({ file: scratch() })
    store.setBudget('medium', 4000)
    store.setBudget('medium', undefined)
    expect(store.all()).toEqual({})
    store.setBudget('medium', 0)
    expect(store.all()).toEqual({ medium: 0 })
  })

  it('rejects out-of-range and non-integer budgets instead of clamping', () => {
    // A clamped value would silently mean something the user did not ask for, and
    // upstream rejects it anyway (400 naming the range).
    const store = new ThinkingBudgetStore({ file: scratch() })
    for (const bad of [THINKING_BUDGET_MIN - 1, THINKING_BUDGET_MAX + 1, 1.5, NaN]) {
      expect(() => store.setBudget('high', bad)).toThrow(/thinking budget/)
    }
    expect(() => store.setBudget('ultra', 100)).toThrow(/unknown thinking level/)
    expect(store.all()).toEqual({})
    // The measured boundaries themselves are accepted.
    store.setBudget('high', THINKING_BUDGET_MIN)
    store.setBudget('low', THINKING_BUDGET_MAX)
    expect(store.all()).toEqual({ high: -1, low: 65535 })
  })

  it('ignores unusable stored values, tolerating hand edits', () => {
    const file = scratch()
    writeFileSync(file, JSON.stringify({
      version: 1,
      budgets: { low: 1000, medium: 'nope', high: 999999, extra: 5 },
    }))
    expect(new ThinkingBudgetStore({ file }).all()).toEqual({ low: 1000 })
    expect(parseThinkingDocument('{ not json').budgets).toEqual({})
    expect(sanitizeThinkingBudgets(null)).toEqual({})
    expect(sanitizeThinkingBudgets([1, 2])).toEqual({})
  })

  it('sees a concurrent writer rather than serving a stale copy', () => {
    // Two instances coexist in one process (main plugin + web entry); the editor
    // writes while the generation path reads, so a stale read would make the
    // setting appear to do nothing until restart.
    const file = scratch()
    const reader = new ThinkingBudgetStore({ file })
    expect(reader.budgetFor('high')).toBeUndefined()
    new ThinkingBudgetStore({ file }).setBudget('high', 8192)
    expect(reader.budgetFor('high')).toBe(8192)
  })

  it('validates the shared interval definition', () => {
    expect(isValidThinkingBudget(-1)).toBe(true)
    expect(isValidThinkingBudget(65535)).toBe(true)
    expect(isValidThinkingBudget(0)).toBe(true)
    expect(isValidThinkingBudget(-2)).toBe(false)
    expect(isValidThinkingBudget(65536)).toBe(false)
    expect(isValidThinkingBudget('100')).toBe(false)
  })
})
