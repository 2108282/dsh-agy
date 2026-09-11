import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

/** Required browser services. */
export const inject = ['slots']

/** Renders the Settings tab link to the loopback-only Antigravity dashboard. */
function AgySettingsLink() {
  return createElement('section', null,
    createElement('h3', null, 'Antigravity'),
    createElement('p', null, 'Manage Google Antigravity accounts, quotas, and model checks.'),
    createElement('a', { href: '/agy', target: '_blank', rel: 'noreferrer' }, 'Open Antigravity dashboard'),
  )
}

/**
 * Registers the Antigravity Settings tab while this client plugin is active.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'agy',
    order: 10,
    label: 'Antigravity',
  }, AgySettingsLink)), 'dsh-agy: Settings tab')
}
