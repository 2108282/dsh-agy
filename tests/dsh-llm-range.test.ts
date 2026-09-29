/**
 * The range arithmetic behind `pnpm run verify:dsh-llm-compat`.
 *
 * Pinned because that gate decides WHICH dsh-llm lines get measured: a matcher
 * that mis-parses `^0.1.5-rc.1` as `<1.0.0` would check one line and report
 * both as verified, which is worse than not gating at all. The caret-on-`0.x`
 * cases below are exactly the ones that decide whether 0.2.0 is a separate
 * claim.
 */

import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  newestPerLine,
  parseCaretRange,
  rangeLines,
  satisfiesCaretRange,
} from '../scripts/dsh-llm-range.mts'

describe('parseCaretRange', () => {
  it('parses the clauses this package declares', () => {
    expect(parseCaretRange('^0.1.5-rc.1 || ^0.2.0-rc.1')).toEqual([
      { major: 0, minor: 1, patch: 5, prerelease: 'rc.1' },
      { major: 0, minor: 2, patch: 0, prerelease: 'rc.1' },
    ])
  })

  it('throws on a shape it cannot evaluate rather than guessing a meaning', () => {
    // Each of these would need an operator this module does not implement.
    for (const range of ['>=0.1.5', '~0.1.5', '0.1.x', '*', '^0.1', '']) {
      expect(() => parseCaretRange(range), range).toThrow()
    }
  })
})

describe('satisfiesCaretRange', () => {
  const range = '^0.1.5-rc.1 || ^0.2.0-rc.1'

  it('admits each claimed line and excludes the next one', () => {
    // Caret on 0.x pins the MINOR, so a 0.1 clause stops before 0.2.0 — the
    // whole reason the 0.2.0 line needs its own clause.
    expect(satisfiesCaretRange(range, '0.1.5-rc.1')).toBe(true)
    expect(satisfiesCaretRange(range, '0.1.5-rc.2')).toBe(true)
    expect(satisfiesCaretRange(range, '0.1.7-rc.2')).toBe(true)
    expect(satisfiesCaretRange(range, '0.2.0-rc.1')).toBe(true)
    expect(satisfiesCaretRange(range, '0.1.4')).toBe(false)
    expect(satisfiesCaretRange(range, '0.2.0-rc.2')).toBe(true)
    expect(satisfiesCaretRange(range, '0.3.0')).toBe(false)
    expect(satisfiesCaretRange(range, '1.0.0')).toBe(false)
  })

  it('admits a prerelease of the exclusive upper bound, agreeing with the loader gate', () => {
    // `^0.2.0-rc.1` is `>=0.2.0-rc.1 <0.3.0`, and 0.3.0-rc.1 ranks BELOW 0.3.0,
    // so semver admits it. The DSH loader evaluates the same range with
    // `semver.satisfies(..., { includePrerelease: true })`, and this module must
    // agree with it: measuring a different set than the gate admits would make
    // a green run here meaningless there.
    expect(satisfiesCaretRange(range, '0.3.0-rc.1')).toBe(true)
    expect(compareVersions('0.3.0-rc.1', '0.3.0')).toBeLessThan(0)
  })

  it('ranks a release above its own prereleases', () => {
    expect(satisfiesCaretRange('^0.1.5-rc.1', '0.1.5')).toBe(true)
    expect(compareVersions('0.1.5', '0.1.5-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('0.1.5-rc.2', '0.1.5-rc.10')).toBeLessThan(0)
    expect(compareVersions('0.1.6-alpha.1', '0.1.5-rc.9')).toBeGreaterThan(0)
  })

  it('treats a 0.0 caret as a patch bump', () => {
    expect(satisfiesCaretRange('^0.0.3', '0.0.3')).toBe(true)
    expect(satisfiesCaretRange('^0.0.3', '0.0.4')).toBe(false)
    expect(satisfiesCaretRange('^1.2.3', '1.9.0')).toBe(true)
    expect(satisfiesCaretRange('^1.2.3', '2.0.0')).toBe(false)
  })

  it('throws for a version it cannot parse', () => {
    expect(() => satisfiesCaretRange('^0.1.5', 'not-a-version')).toThrow()
  })
})

describe('rangeLines', () => {
  it('names one line per clause, deduplicated and in declaration order', () => {
    expect(rangeLines('^0.1.5-rc.1 || ^0.2.0-rc.1')).toEqual(['0.1', '0.2'])
    expect(rangeLines('^0.1.5-rc.1 || ^0.1.7-rc.1')).toEqual(['0.1'])
  })
})

describe('newestPerLine', () => {
  const published = ['0.1.0-rc.2', '0.1.1-rc.1', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.7-rc.2', '0.2.0-rc.1']

  it('measures every claimed line, not just the newest overall', () => {
    // The gate's whole point is that a green run covers BOTH vocabularies, so a
    // 0.1.x pick must survive a 0.2.x release shipping.
    expect(newestPerLine('^0.1.5-rc.1 || ^0.2.0-rc.1', published)).toEqual(['0.1.7-rc.2', '0.2.0-rc.1'])
  })

  it('throws when a claimed line has no published version', () => {
    expect(() => newestPerLine('^0.1.5-rc.1 || ^0.9.0-rc.1', published)).toThrow(/0\.9/)
  })
})
