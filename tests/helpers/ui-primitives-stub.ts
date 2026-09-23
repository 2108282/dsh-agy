/**
 * Test stub for the host UI primitives.
 *
 * The real package ships CSS modules, which Node's ESM loader cannot import, so
 * a Node-environment unit test cannot load it. These tests cover plugin
 * registration and i18n parity — not rendering — so inert stand-ins of the same
 * shapes are sufficient and keep the suite free of a DOM harness.
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'

type AnyProps = Record<string, unknown>

/** Render a component-shaped placeholder. */
function stub(name: string) {
  const Component = (props: AnyProps): ReactNode =>
    createElement(name, null, (props.children as ReactNode) ?? null)
  Component.displayName = name
  return Component
}

export const Button = stub('Button')
export const Switch = stub('Switch')
export const Input = stub('Input')
export const Tag = stub('Tag')
export const StateDot = stub('StateDot')
export const DisclosureRow = stub('DisclosureRow')

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
