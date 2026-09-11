import { expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

it('registers and disposes the Antigravity Settings tab', () => {
  let registration: { options: Record<string, unknown>, component: () => unknown } | undefined
  let cleanup: (() => void) | undefined
  let disposed = false
  const ctx = {
    effect: (install: () => () => void) => {
      cleanup = install()
      return cleanup
    },
    slots: {
      inject: (_slot: string, install: () => void) => install(),
      register: (options: Record<string, unknown>, component: () => unknown) => {
        registration = { options, component }
        return () => { disposed = true }
      },
    },
  }

  apply(ctx as never)
  expect(registration?.options).toMatchObject({
    name: 'settings.plugins.tab', id: 'agy', order: 10, label: 'Antigravity',
  })
  const element = registration?.component() as { type: string, props: { children: unknown[] } }
  const link = element.props.children[2] as { type: string, props: Record<string, unknown> }
  expect(link).toMatchObject({ type: 'a', props: { href: '/agy', target: '_blank', rel: 'noreferrer' } })
  expect(disposed).toBe(false)
  cleanup?.()
  expect(disposed).toBe(true)
})

it('removes the tab when the client fiber disposes', () => {
  const entries: Array<{ id: string }> = []
  let cleanup: (() => void) | undefined
  const ctx = {
    effect: (install: () => () => void) => { cleanup = install(); return cleanup },
    slots: {
      inject: (_slot: string, install: () => () => void) => install(),
      register: (options: { id: string }) => {
        entries.push({ id: options.id })
        return () => { entries.splice(entries.findIndex(entry => entry.id === options.id), 1) }
      },
    },
  }

  apply(ctx as never)
  cleanup?.()
  expect(entries).toEqual([])
})
