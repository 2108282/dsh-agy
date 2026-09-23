import { readFileSync } from 'node:fs'
import { expect, it, describe } from 'vitest'
import { apply, orderModels } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'

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
