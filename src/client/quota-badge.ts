/**
 * Conversation-header quota badge.
 *
 * Shows the tightest of the active account's tracked windows — the same figures
 * the Settings section's limits card renders, from the same RPC — and opens the
 * window breakdown on hover or click.
 *
 * The header is a glanceable surface, so the badge itself is one number: the
 * percentage, or an em dash when nothing has been measured (unknown headroom is
 * not zero headroom). Everything else — the driving window, the reset walls, the
 * snapshot's age, the account — is one hover away.
 *
 * Built from the host's own controls (`Button`, `Pill`, `Tag`, `StateDot`) and
 * positioned with the host's `useAnchoredPosition`, so focus rings, disabled
 * states, size tiers, theming and viewport clamping are the platform's rather
 * than an imitation.
 *
 * The panel is NOT portaled: `react-dom` is not a dependency of this package (the
 * bundle requires `react` and the primitives, both shared into the shell's frozen
 * module table), so the panel renders inside its anchor wrapper and is placed with
 * a fixed position from `useAnchoredPosition`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Pill,
  StateDot,
  Tag,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { h } from './element.ts'
import {
  agoText,
  buildQuotaCards,
  desensitizeEmail,
  dotStateFor,
  pickBadgeQuota,
  quotaColor,
  shouldProbeLimits,
  stateLabel,
  windowLabel,
  type QuotaTranslate,
  type QuotaWindowRow,
} from './quota-view.ts'
import type { AccountView, AgyRpcClient } from '../rpc-contract.ts'

/**
 * How often the badge re-reads the pool.
 *
 * Cheap by construction: `account.list` is probe-free, and the window refresh it
 * asks for is TTL-gated on the host side. The badge also re-reads on focus and on
 * the tab becoming visible again, so a session left in the background for hours
 * still shows a current figure the moment it is looked at.
 */
const REFRESH_INTERVAL_MS = 120_000

/**
 * Grace period before a hover-close.
 *
 * The panel hangs below the badge, so the pointer has to cross a gap to reach it;
 * closing on the button's own leave would make the panel unreachable.
 */
const HOVER_CLOSE_DELAY_MS = 250

/** One tag tone per account state, matching the Settings section's own badge. */
function toneFor(state: AccountView['state']): TagTone {
  if (state === 'active') return 'success'
  if (state === 'cooling') return 'warning'
  return 'danger'
}

/** One window row: label, bar, figure, reset wall, and why it has no figure. */
function windowRow(row: QuotaWindowRow, t: QuotaTranslate): ReactNode {
  // The note is only needed when there is no figure: either upstream never
  // reported one, or the reading is from a period that has already ended. A
  // stale row still shows its reset wall, which is what says when to look again.
  const note = row.percent === null
    ? h('div', { className: 'agy-quota-note' }, row.stale ? t('quotaStaleNote') : t('quotaUnmeasuredNote'))
    : null
  return h('div', { className: 'agy-quota-item', key: row.bucketId },
    h('div', { className: 'agy-quota-row' },
      h('span', { className: 'agy-quota-k' }, row.label),
      h('span', { className: 'agy-quota-track' },
        row.percent === null
          ? null
          : h('i', { style: { width: `${row.percent}%`, background: quotaColor(row.percent / 100) } })),
      h('span', { className: 'agy-quota-p' }, row.percent === null ? t('valueUnknown') : `${row.percent}%`),
      h('span', { className: 'agy-quota-reset' }, row.reset)),
    note)
}

/**
 * The badge and its panel.
 *
 * `rpc` and `t` are injected by the plugin registration exactly as the Settings
 * section receives them; the slot content has no way to reach `ctx` itself.
 */
export function AgyQuotaBadge({ rpc, t }: { rpc: AgyRpcClient, t: QuotaTranslate }): ReactNode {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [busy, setBusy] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const failedAtRef = useRef<number | null>(null)

  const open = pinned || hovered

  const load = useCallback(async (force: boolean) => {
    setBusy(true)
    try {
      const listed = await rpc.call('account.list', {})
      // A reply from the channel is authoritative even when it is empty; only a
      // FAILURE keeps the last good rows, which is why the catch below writes
      // nothing at all.
      setAccounts(listed.accounts)
      const probe = shouldProbeLimits({ force, failedAt: failedAtRef.current, now: Date.now() })
      if (probe !== 'off') {
        const limits = await rpc.call('account.limits', probe === 'force' ? { force: true } : {})
        const byIndex = new Map(limits.limits.map((entry) => [entry.index, entry]))
        setAccounts((current) => current.map((account) => {
          const entry = byIndex.get(account.index)
          // An account the probe skipped keeps the windows it already had: the
          // host's cached snapshot is the last good reading, and a failed probe
          // writes nothing (by design — see refreshLimits).
          return entry === undefined
            ? account
            : { ...account, limits: entry.groups, limitsUpdatedAt: entry.updatedAt }
        }))
        // A run that measured nothing but failed is the one case the host's TTL
        // cannot cover: it wrote no snapshot, so the next automatic tick would
        // probe again. Back that off; an explicit refresh is never held back.
        failedAtRef.current = limits.measured === 0 && limits.failed > 0 ? Date.now() : null
      }
    } catch {
      // Deliberately silent: a failed refresh must not blank a working badge, and
      // the panel's age line already says how current the figures are.
    } finally {
      setBusy(false)
      setNow(Date.now())
    }
  }, [rpc])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load(false)
    }, REFRESH_INTERVAL_MS)
    const onFocus = (): void => { if (document.visibilityState !== 'hidden') void load(false) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  // A pinned panel is dismissed by a pointerdown outside it; a hover-opened one
  // closes with the pointer.
  useDismissOnOutsidePointer(rootRef, pinned, setPinned, panelRef)

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setHovered(false)
    }, HOVER_CLOSE_DELAY_MS)
  }, [])

  const keepOpen = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setHovered(true)
  }, [])

  const active = accounts.find((account) => account.active) ?? accounts[0]
  const quota = pickBadgeQuota(accounts, now)
  const cards = buildQuotaCards(active, t, now)
  const dotState = dotStateFor(accounts)
  const reading = quota === null
    ? t('badgeUnmeasured')
    : t('badgeReading', { window: windowLabel(quota.window, t), percent: quota.percent })

  const anchored = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'bottom',
    gap: 6,
    margin: 12,
  })

  const panel = open
    ? h('div', {
      ref: panelRef,
      className: 'agy-quota-pop',
      // The panel must be mounted before it can be measured, so the first frame
      // renders hidden rather than at the viewport origin.
      style: anchored === null ? { visibility: 'hidden' } : { ...anchored, visibility: 'visible' },
      onMouseEnter: keepOpen,
      onMouseLeave: scheduleClose,
    },
      h('div', { className: 'agy-quota-pop-head' },
        h('span', { className: 'agy-quota-pop-title' }, t('badgeTitle')),
        pinned ? h(Pill, { className: 'agy-quota-pill' }, t('badgePinned')) : null,
        h('span', { className: 'agy-quota-pop-actions' },
          h(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled: busy,
            onClick: () => { void load(true) },
          }, t('refresh')),
          h(Button, {
            variant: 'ghost',
            size: 'sm',
            onClick: () => { setPinned(false); setHovered(false) },
          }, t('badgeClose')))),
      active === undefined
        ? h('div', { className: 'agy-quota-empty' }, t('badgeNoAccount'))
        : h('div', { className: 'agy-quota-account' },
          h('span', { className: 'agy-quota-email' }, desensitizeEmail(active.email)),
          h(Tag, { tone: toneFor(active.state) }, stateLabel(active.state, t)),
          h('span', { className: 'agy-quota-project' }, active.projectId ?? t('noProject'))),
      active !== undefined && active.verificationRequired && active.verificationUrl !== null
        ? h('div', { className: 'agy-quota-note' },
          h('a', {
            className: 'agy-link',
            href: active.verificationUrl,
            target: '_blank',
            rel: 'noreferrer noopener',
          }, t('verificationOpen')))
        : null,
      active !== undefined && active.limitsUpdatedAt !== null
        ? h('div', { className: 'agy-quota-age' },
          t('limitsMeasured', { ago: agoText(new Date(active.limitsUpdatedAt).toISOString(), t, now) }))
        : null,
      cards.length === 0
        ? h('div', { className: 'agy-quota-empty' }, t('limitsUnavailable'))
        : h('div', { className: 'agy-quota-cards' }, ...cards.map((card) => h('div', {
          className: 'agy-quota-card',
          key: card.key,
        },
          h('div', { className: 'agy-quota-card-title' }, card.title),
          ...card.windows.map((row) => windowRow(row, t))))),
      h('div', { className: 'agy-quota-foot' },
        h('span', null, t('quotaSourceCaption')),
        h('span', null, t('quotaManageHint'))))
    : null

  return h('span', {
    ref: rootRef,
    className: 'agy-quota-anchor',
    onMouseEnter: keepOpen,
    onMouseLeave: scheduleClose,
  },
    h(Button, {
      variant: 'ghost',
      size: 'sm',
      className: 'agy-quota-badge',
      'aria-label': t('badgeAria'),
      title: `${reading} · ${t('badgeHint')}`,
      onClick: () => { setPinned((current) => !current) },
      onFocus: keepOpen,
      onBlur: scheduleClose,
    },
      h(StateDot, { state: dotState, size: 8 }),
      quota === null ? t('valueUnknown') : `${quota.percent}%`),
    panel)
}
