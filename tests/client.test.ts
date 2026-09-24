import { readFileSync } from 'node:fs'
import { expect, it, describe } from 'vitest'
import { apply, orderModels, tokenText } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import type { ModelView } from '../src/rpc-contract.ts'

/** Minimal client context: locale, connection (RPC transport), and the slot registry. */
function makeContext(options: { withConnection?: boolean } = {}) {
  const entries: Array<{ id: string, name: string }> = []
  const dictionaries: string[] = []
  let cleanup: (() => void) | undefined
  const warnings: string[] = []
  const ctx = {
    effect: (install: () => () => void) => { cleanup = install(); return cleanup },
    get: (name: string) => (name === 'connection' && options.withConnection !== false
      ? { rpc: { call: async () => ({ ok: true, value: {} }) } }
      : undefined),
    locale: {
      register: (ns: string) => { dictionaries.push(ns); return () => {} },
      bind: () => (key: string) => key,
    },
    logger: { warn: (message: string) => { warnings.push(message) } },
    slots: {
      inject: (_slot: string, install: () => () => void) => install(),
      register: (registration: { id: string, name: string }) => {
        entries.push({ id: registration.id, name: registration.name })
        return () => {
          const at = entries.findIndex((entry) => entry.id === registration.id)
          if (at >= 0) entries.splice(at, 1)
        }
      },
    },
  }
  return { ctx, entries, dictionaries, warnings, dispose: () => { cleanup?.() } }
}

describe('dsh-agy client plugin', () => {
  it('registers the Antigravity Settings section, not a Plugins tab', () => {
    // The old entry contributed a `settings.plugins.tab` link to the standalone
    // /agy dashboard; that surface is gone and this is a first-class section.
    const { ctx, entries, dictionaries } = makeContext()
    apply(ctx as never)
    expect(entries).toEqual([{ id: 'agy', name: 'settings.section' }])
    // The section must own a dictionary, or its copy cannot follow the host's
    // language setting.
    expect(dictionaries).toEqual(['agy'])
  })

  it('removes the section when the client fiber disposes', () => {
    const { ctx, entries, dispose } = makeContext()
    apply(ctx as never)
    expect(entries).toHaveLength(1)
    dispose()
    expect(entries).toEqual([])
  })

  it('skips registration and warns when the connection service is absent', () => {
    // Profiles without a Web composition have no `connection`; the plugin must
    // degrade to a warning rather than throwing during activation.
    const { ctx, entries, warnings } = makeContext({ withConnection: false })
    apply(ctx as never)
    expect(entries).toEqual([])
    expect(warnings.join('\n')).toContain('connection service unavailable')
  })
})

describe('agy section i18n', () => {
  it('keeps zh and en key-for-key identical', () => {
    // A key present in one dictionary but not the other renders as the raw key
    // in that locale, which is invisible until a user switches language.
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has no empty translations', () => {
    for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
      expect(value.trim(), `empty translation for "${key}"`).not.toBe('')
    }
  })

  it('uses the same placeholders in both languages', () => {
    // A placeholder renamed in one language silently drops the value.
    const placeholders = (text: string): string[] =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort()
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(placeholders(zh[key]), `placeholder mismatch in "${key}"`).toEqual(placeholders(en[key]))
    }
  })

  it('has no unused keys and no copy that bypasses the dictionary', () => {
    // Two failures this catches that the parity test cannot:
    //  - a dead key (its copy can never render, and it drifts from the UI);
    //  - a hardcoded label (Chinese string literals shipped into the English UI),
    //    which is why the Credentials tab's import buttons are checked here.
    const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const unused = (Object.keys(zh) as Array<keyof typeof zh>)
      .filter((key) => !source.includes(`'${key}'`))
    expect(unused, `locale keys never referenced by index.ts: ${unused.join(', ')}`).toEqual([])
  })

  it('passes every placeholder a key declares at every call site', () => {
    // The host's translator substitutes `{name}` only when `name in params`, and
    // otherwise returns the match UNCHANGED — so a forgotten argument renders the
    // literal braces to the user (`代理可达：{proxy}`) instead of failing. The
    // parity test above compares the two dictionaries and so cannot see this:
    // both sides agree on a placeholder that no caller ever supplies.
    const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const missing: string[] = []
    for (const [key, template] of Object.entries(zh)) {
      const names = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string)
      if (names.length === 0) continue
      // Every `t('key', ...)` call, up to the closing paren of its first argument
      // list — enough to see the params object literal that follows.
      const calls = [...source.matchAll(new RegExp(`t\\('${key}'\\s*(,\\s*\\{[^}]*\\})?`, 'g'))]
      expect(calls.length, `key "${key}" has placeholders but no call site`).toBeGreaterThan(0)
      for (const call of calls) {
        const params = call[1] ?? ''
        for (const name of names) {
          // Accept both an explicit property (`{ proxy: result.masked }`) and the
          // shorthand that just forwards a same-named binding (`{ value }`).
          const supplied = new RegExp(`\\b${name}\\s*:`).test(params)
            || new RegExp(`[{,]\\s*${name}\\s*[,}]`).test(params)
          if (!supplied) missing.push(`${key} -> {${name}}`)
        }
      }
    }
    expect(missing, `placeholder never supplied at its call site: ${missing.join(', ')}`).toEqual([])
  })

  it('has no CJK literals outside the dictionaries', () => {
    // The UI's copy belongs in locales.ts; a literal here is untranslatable and
    // invisible to every other i18n check. `styles.ts` carries no user-visible
    // text at all, so it is held to the same rule.
    const cjkIn = (file: string): string[] => {
      const source = readFileSync(new URL(`../src/client/${file}`, import.meta.url), 'utf8')
      return source.match(/[\u4e00-\u9fff]+/g) ?? []
    }
    expect(cjkIn('index.ts'), 'CJK copy in index.ts (belongs in locales.ts)').toEqual([])
    expect(cjkIn('styles.ts'), 'CJK copy in styles.ts').toEqual([])
  })
})

describe('usage table stylesheet', () => {
  const css = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

  it('right-aligns numeric headers with a selector that beats the th rule', () => {
    // Regression: a numeric <th> carries `.agy-num`, but `.agy-table th
    // { text-align: left }` is specificity 0-1-1 and outranks the bare class
    // (0-1-0), so headers stayed left-aligned above right-aligned cells — the
    // figure looked shoved to the right of its own label. The fix must be a
    // compound selector (0-2-1), not an `!important` escalation.
    expect(css).toContain('.agy-table th.agy-num { text-align: right; }')
    // Pin the trap itself, so the selector above cannot be "simplified" back to
    // the bare class without this test going red.
    expect(css).toMatch(/\.agy-table th\s*\{[^}]*text-align:\s*left/)
  })

  it('draws no vertical rules between metric cells', () => {
    // The usage summary's four cells are separated by the grid; a border-right
    // turned the strip into a spreadsheet grid and was removed.
    const metricRule = /\.agy-metric\s*\{([^}]*)\}/.exec(css)
    expect(metricRule).not.toBeNull()
    expect(metricRule?.[1]).not.toMatch(/border-(right|left)/)
  })

  it('keeps the CSS template body free of backticks', () => {
    // The stylesheet is one template literal, so a backtick inside a comment
    // ENDS it and the rest of the CSS is parsed as TypeScript ("Expected ';' but
    // found ...", reported at a line far from the real cause). Easy to
    // reintroduce when quoting a property name in prose, and it has happened
    // repeatedly. Only the body matters — the delimiters and the surrounding
    // TypeScript (other template literals in this file) legitimately contain
    // backticks, so counting the whole file would be meaningless.
    const start = css.indexOf('const CSS = `') + 'const CSS = `'.length
    const end = css.indexOf('`', start)
    expect(start, 'the CSS template literal must exist').toBeGreaterThan('const CSS = `'.length)
    expect(css.slice(start, end), 'no backtick may appear inside the CSS body').not.toContain('`')
  })

  it('sizes the master/detail split from the panel, not the viewport', () => {
    // Regression: the collapse used `@media (max-width: 720px)`, but this
    // section renders inside a ~600px Settings panel, so the query never fired
    // and the 320px master column squeezed the detail to ~270px on every
    // desktop. The breakpoint must be a CONTAINER query — the measured
    // constraint is the panel's inline size.
    expect(css).toMatch(/\.agy-split-wrap\s*\{[^}]*container-type:\s*inline-size/)
    expect(css).toMatch(/@container\s*\(min-width:[^)]*\)/)
    expect(css).not.toMatch(/@media[^{]*\{\s*\.agy-split/)
  })

  it('lets an account row wrap instead of squeezing the identity', () => {
    // Regression: the row was a two-column grid, whose `1fr` may collapse to
    // zero — the ~167px action cluster left ~45px for the email, truncating
    // every address to "a1…". A flex basis wraps the actions to a second line.
    // The flex-wrap declaration is what matters; the comment above the rule
    // quotes the old grid declaration, so only actual declarations are checked.
    const rowRule = /\.agy-rowitem\s*\{([^}]*)\}/.exec(css)
    expect(rowRule).not.toBeNull()
    const declarations = (rowRule?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).toMatch(/flex-wrap:\s*wrap/)
    expect(declarations).not.toMatch(/grid-template-columns/)
  })
})

describe('model list ordering', () => {
  const m = (id: string, disabled: boolean) => ({ id, name: id, disabled })

  it('puts disabled models last, keeping host order within each group', () => {
    // The requested behaviour: switching a model off moves it to the bottom
    // rather than leaving it wherever the reload happened to place it.
    const ordered = orderModels([m('a', false), m('b', true), m('c', false), m('d', true)])
    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves only the toggled row, never reshuffling the others', () => {
    // Stability is the point: with a non-stable sort the untouched rows could
    // reorder, which is what made the list appear to jump on every toggle.
    const before = orderModels([m('a', false), m('b', false), m('c', false)])
    expect(before.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])

    // Switching the FIRST model off must send it past the two it preceded,
    // without disturbing their relative order.
    const firstOff = orderModels([m('a', true), m('b', false), m('c', false)])
    expect(firstOff.map((entry) => entry.id)).toEqual(['b', 'c', 'a'])

    // Switching it back on restores the host's original order.
    const restored = orderModels([m('a', false), m('b', false), m('c', false)])
    expect(restored.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input list', () => {
    const input = [m('a', false), m('b', true)]
    orderModels(input)
    expect(input.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('token count formatting', () => {
  it('starts a unit suffix at 1K and keeps full precision below it', () => {
    expect(tokenText(0)).toBe('0')
    expect(tokenText(512)).toBe('512')
    expect(tokenText(999)).toBe('999')
    expect(tokenText(1_000)).toBe('1.0K')
    expect(tokenText(1_500)).toBe('1.5K')
    expect(tokenText(284_000)).toBe('284K')
    expect(tokenText(1_200_000)).toBe('1.2M')
  })

  it('promotes the unit when rounding would reach 1000 of it', () => {
    // Regression: the unit came from the raw magnitude while the decimals came
    // from a different threshold, so rounding produced a number outside its own
    // unit — `1000K` instead of `1.0M`.
    expect(tokenText(999_999)).toBe('1.0M')
    expect(tokenText(999_999_999)).toBe('1.0B')
    expect(tokenText(999_999_999_999)).toBe('1.0T')
  })

  it('keeps decimals consistent across a unit boundary', () => {
    // Regression: 99999 was `100.0K` while 100000 was `100K`, and 9999999 was
    // `10.0M` while 10000000 was `10M` — the same magnitude, formatted two ways.
    expect(tokenText(99_999)).toBe('100K')
    expect(tokenText(100_000)).toBe('100K')
    expect(tokenText(9_999_999)).toBe('10.0M')
    expect(tokenText(10_000_000)).toBe('10.0M')
  })
})
