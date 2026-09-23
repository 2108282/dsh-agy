/**
 * agy Settings section — the browser half.
 *
 * One `settings.section` page with four tabs (accounts, models, usage,
 * credentials), replacing the standalone `/agy` dashboard. Every figure comes
 * from the `/api/agy` RPC over `ctx.connection`, so this section needs no
 * host-rendered page and there is no second UI to keep in step.
 *
 * Elements are built through the local `h` helper rather than JSX or nested
 * `createElement` calls: this package configures no JSX transform for the client
 * bundle, and `h(tag, props, ...children)` keeps the element tree flat and
 * readable where nested `createElement` calls become a parenthesis maze.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button,
  Input,
  Pill,
  StateDot,
  Switch,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState, TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { installAgyStyles } from './styles.ts'
import { en, zh, type AgyLocaleKey } from './locales.ts'
import type { AccountView, AgyRpcClient, ModelView, StatsView, ThinkingBudgets } from '../rpc-contract.ts'
import { CLAUDE_BUDGET_MAX, CLAUDE_BUDGET_MIN, THINKING_BUDGET_MAX, THINKING_BUDGET_MIN, THINKING_LEVELS } from '../thinking-types.ts'
import type { UsageCounters } from '../usage-types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the Antigravity Settings section. */
    agy: AgyLocaleKey
  }
}

/** Required browser services: the slot registry, dictionaries, and the RPC carrier. */
export const inject = ['slots', 'locale', 'connection']

/** Dictionary namespace this plugin owns. */
const NS = 'agy'

/** This section's translator. */
type T = TranslateNS<typeof NS>

/** RPC channel and endpoint the host registers as `/api/agy`. */
const RPC_CHANNEL = '/api'
const RPC_ENDPOINT = 'agy'

type TabId = 'accounts' | 'models' | 'usage' | 'credentials'

/** Connection shape this plugin needs (structural, so no host-only import). */
interface ConnectionLike {
  rpc: {
    call: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<unknown>
  }
}

/**
 * Element shorthand: flat children, no nesting ceremony.
 *
 * The component overload accepts children as trailing arguments too, because
 * React's `createElement` handles them natively for function components.
 */
function h(tag: string, props?: Record<string, unknown> | null, ...children: ReactNode[]): ReactNode
function h<Props>(
  // `key` rides in props for `createElement`, so the component overload must
  // admit it even though it is not part of the component's own props type.
  component: (props: Props) => ReactNode,
  props: Props & { key?: string | number },
  ...children: ReactNode[]
): ReactNode
function h(
  tag: string | ((props: never) => ReactNode),
  props?: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  return createElement(tag as string, props ?? null, ...children)
}

/** Call one management method and unwrap the Connection RPC envelope. */
function createRpc(connection: ConnectionLike): AgyRpcClient {
  return {
    async call(method, payload, signal) {
      const raw = await connection.rpc.call(
        RPC_CHANNEL,
        RPC_ENDPOINT,
        { method, payload },
        signal,
      ) as { ok?: boolean; value?: unknown; error?: { message?: string } } | undefined
      if (raw?.ok === true) return raw.value as never
      if (raw?.ok === false) throw new Error(raw.error?.message ?? `${method} failed`)
      // An unrecognized envelope means the transport misbehaved; surfacing it
      // beats returning undefined as though the call had succeeded.
      throw new Error(`${method}: malformed RPC response`)
    },
  }
}

// ─── formatting ──────────────────────────────────────────────────────────────

/** Compact token text: 1.2M / 284K / 512. */
/** Token-count units, largest first. */
const TOKEN_UNITS: ReadonlyArray<readonly [number, string]> = [
  [1_000_000_000_000, 'T'],
  [1_000_000_000, 'B'],
  [1_000_000, 'M'],
  [1_000, 'K'],
]

/**
 * Compact token count: `1.2M` / `284K` / `512`. Counts below 1000 render in
 * full — a suffix starts at 1K.
 *
 * The unit is chosen from the value ROUNDED TO ITS DISPLAYED PRECISION, and
 * promoted when that rounding would reach 1000 (which belongs to the next unit).
 * Deciding from the raw magnitude let rounding contradict the suffix: 999_999
 * printed as `1000K`, 99999 as `100.0K` while 100000 was `100K`, and 9999999 as
 * `10.0M` while 10000000 was `10M`.
 *
 * Exported for a direct unit test: the boundaries are exactly where this broke.
 * @param value - token count.
 * @returns the display string.
 */
export function tokenText(value: number): string {
  if (value < 1_000) return String(value)
  /** One decimal below 100 (`1.2M`), none at or above (`284K`). */
  const render = (scaled: number, suffix: string): string =>
    `${scaled < 100 ? scaled.toFixed(1) : String(Math.round(scaled))}${suffix}`

  // Largest unit the value reaches; a smaller index is a larger unit.
  const start = TOKEN_UNITS.findIndex(([divisor]) => value >= divisor)
  for (let index = start; index >= 0; index--) {
    const [divisor, suffix] = TOKEN_UNITS[index]!
    const scaled = Math.round((value / divisor) * 10) / 10
    // Rounding overflow belongs to the next unit up, not to `1000<suffix>`.
    if (scaled < 1_000) return render(scaled, suffix)
  }
  // Beyond the largest unit: render it anyway rather than mislabel the value.
  const [divisor, suffix] = TOKEN_UNITS[0]!
  return render(Math.round((value / divisor) * 10) / 10, suffix)
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = ms / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, '0')}s`
}

/** Cache-hit share of prompt-side input; null when nothing was billed. */
function cacheHitPercent(counters: UsageCounters): number | null {
  const billed = counters.input + counters.cacheRead + counters.cacheWrite
  if (billed <= 0) return null
  return Math.round((counters.cacheRead / billed) * 100)
}

function average(total: number, count: number): number {
  return count > 0 ? total / count : 0
}

/** Total tokens across the four disjoint buckets. */
function totalTokens(counters: UsageCounters): number {
  return counters.input + counters.output + counters.cacheRead + counters.cacheWrite
}

/** Quota tint by remaining fraction: healthy / low / critical. */
function quotaColor(fraction: number): string {
  if (fraction > 0.7) return 'var(--dsw-alias-state-success-primary, #22c55e)'
  if (fraction >= 0.3) return 'var(--dsw-alias-state-warn-primary, #f59e0b)'
  return 'var(--dsw-alias-state-error-primary, #ec1313)'
}

/** Localized account-state label. */
function stateLabel(state: AccountView['state'], t: T): string {
  switch (state) {
    case 'active': return t('stateActive')
    case 'cooling': return t('stateCooling')
    case 'verification-required': return t('stateVerificationRequired')
    case 'disabled': return t('stateDisabled')
  }
}

/**
 * Localized label for a reasoning level.
 *
 * Falls back to the raw id so a level added upstream is still usable rather than
 * rendering blank.
 */
function levelLabel(level: string, t: T): string {
  switch (level) {
    case 'low': return t('thinkingLevelLow')
    case 'medium': return t('thinkingLevelMedium')
    case 'high': return t('thinkingLevelHigh')
    default: return level
  }
}

/**
 * Localized label for an upstream quota window token.
 *
 * Upstream sends `5h` / `weekly` today. The tokens are mapped rather than
 * printed so the panel follows the UI language, and an UNRECOGNIZED token falls
 * back to its raw value: upstream may add a window, and showing `30d` is better
 * than a blank or a wrong localized label.
 */
function windowLabel(window: string, t: T): string {
  switch (window) {
    case '5h': return t('quotaWindow5h')
    case 'weekly': return t('quotaWindowWeekly')
    default: return window
  }
}

/**
 * A wall-clock moment for a state label (a cooldown end).
 *
 * Time-of-day alone is enough while the wall is today; past midnight it must
 * carry the date, or a 24h quota cooldown reads as though it ends in a few
 * minutes. (`untilText` is the relative form, used where "how long from now" is
 * the question rather than "when".)
 */
function clockTime(iso: string | null): string {
  if (iso === null) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Time until a future moment, as localized copy.
 *
 * A quota reset wall is often more than 24h out, so a bare `HH:mm` cannot say
 * whether it means today or tomorrow — the failure this replaces. Bucket
 * boundaries mirror the host's `relativeTime` (which is defined for past-dated
 * rows and would need its arguments reversed to serve a future one, so the
 * comparison is written out here instead); the words stay in this plugin's own
 * dictionary, which is exactly the split that API intends.
 */
function untilText(iso: string | null, t: T, now: number): string {
  if (iso === null) return '—'
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return '—'
  const diff = at - now
  if (diff <= 0) return t('relNow')
  const value = diff < MINUTE_MS
    ? t('relNow')
    : diff < HOUR_MS
      ? t('relMinutes', { n: Math.floor(diff / MINUTE_MS) })
      : diff < DAY_MS
        ? t('relHours', { n: Math.floor(diff / HOUR_MS) })
        : diff < 30 * DAY_MS
          ? t('relDays', { n: Math.floor(diff / DAY_MS) })
          : diff < 365 * DAY_MS
            ? t('relMonths', { n: Math.floor(diff / (30 * DAY_MS)) })
            : t('relYears', { n: Math.floor(diff / (365 * DAY_MS)) })
  return t('quotaResetIn', { value })
}

/**
 * Localized label for a cooldown reason.
 *
 * Falls back to the raw token so a reason added on the host side still renders
 * something legible rather than blank.
 */
function cooldownReasonLabel(reason: string, t: T): string {
  switch (reason) {
    case 'network-error': return t('cooldownReasonNetworkError')
    case 'quota-exhausted': return t('cooldownReasonQuotaExhausted')
    case 'validation-required': return t('cooldownReasonValidationRequired')
    case 'project-error': return t('cooldownReasonProjectError')
    default: return reason
  }
}

/**
 * How long ago a past moment was (the mirror of `untilText`).
 *
 * Reuses the same `rel*` magnitudes so the two read consistently, but adds a
 * direction suffix: a bare magnitude beside a cooldown could equally mean when
 * it started or when it ends. The suffix and every magnitude come from the
 * dictionary, so nothing here is language-specific.
 */
function agoText(iso: string | null, t: T, now: number): string {
  if (iso === null) return '—'
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return '—'
  const diff = now - at
  // A clock skew or a just-written stamp reads as "just now" rather than a
  // negative age.
  if (diff < MINUTE_MS) return t('relJustNow')
  const value = diff < HOUR_MS
    ? t('relMinutes', { n: Math.floor(diff / MINUTE_MS) })
    : diff < DAY_MS
      ? t('relHours', { n: Math.floor(diff / HOUR_MS) })
      : diff < 30 * DAY_MS
        ? t('relDays', { n: Math.floor(diff / DAY_MS) })
        : diff < 365 * DAY_MS
          ? t('relMonths', { n: Math.floor(diff / (30 * DAY_MS)) })
          : t('relYears', { n: Math.floor(diff / (365 * DAY_MS)) })
  return t('relAgo', { value })
}

// ─── building blocks ─────────────────────────────────────────────────────────

/**
 * A host-styled button.
 *
 * Delegates to the host's `Button` so focus rings, disabled states, size tiers
 * and theming are the platform's rather than an imitation. `danger` has no
 * primitive equivalent, so it keeps the ghost family with a local class.
 *
 * Every click stops propagating. Account rows are themselves click targets
 * (selecting the row), so without this a row's "Delete"/"Verify"/"Activate"
 * button also selected that row — and for Delete the row indices then shifted
 * underneath a selection that was about to be acted on. Stopping unconditionally
 * is safe for buttons outside rows, where there is no ancestor handler.
 */
function button(label: string, onClick: () => void, options: {
  variant?: 'danger' | 'ghost'
  size?: 'sm'
  disabled?: boolean
  title?: string
} = {}): ReactNode {
  return h(Button, {
    variant: options.variant === 'danger' ? 'outline' : (options.variant ?? 'outline'),
    size: options.size === 'sm' ? 'sm' : 'md',
    ...(options.disabled === true ? { disabled: true } : {}),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.variant === 'danger' ? { className: 'agy-btn-danger' } : {}),
    onClick: (event: { stopPropagation?: () => void }) => {
      event?.stopPropagation?.()
      onClick()
    },
  }, label)
}

/** Full-width quota row used by the (collapsible) model quota list. */
/** Account state rendered with the host's state dot plus a tinted tag. */
function stateBadge(state: AccountView['state'], label: string): ReactNode {
  const dot: StateDotState = state === 'active'
    ? 'done'
    : state === 'cooling' ? 'warning' : 'error'
  const tone: TagTone = state === 'active' ? 'success' : state === 'cooling' ? 'warning' : 'danger'
  return h('span', { className: 'agy-state' },
    h(StateDot, { state: dot, size: 8 }),
    h(Tag, { tone }, label))
}

function subhead(title: string, aside?: string): ReactNode {
  return h('div', { className: 'agy-subhead' },
    h('span', null, title),
    aside === undefined || aside === '' ? null : h('span', { className: 'agy-aside' }, aside))
}

function hint(text: string): ReactNode {
  return h('p', { className: 'agy-hint' }, text)
}

function table(headers: ReactNode, rows: ReactNode[]): ReactNode {
  return h('table', { className: 'agy-table' },
    headers === null ? null : h('thead', null, headers),
    h('tbody', null, ...rows))
}

/** A titled grouping surface. Grouping is what keeps a dense page readable. */
function card(title: ReactNode, body: ReactNode, aside?: ReactNode): ReactNode {
  return h('section', { className: 'agy-card' },
    h('div', { className: 'agy-card-head' },
      h('span', { className: 'agy-card-title' }, title),
      aside === undefined ? null : h('span', { className: 'agy-aside' }, aside)),
    h('div', { className: 'agy-card-body' }, body))
}

/** A metric strip inside a card. */
function metrics(cells: ReactNode[]): ReactNode {
  return h('div', { className: 'agy-metrics' }, ...cells)
}

/** One metric cell: a label, a large value, and an optional detail line. */
function metric(label: string, value: number | string, detail: string): ReactNode {
  const text = typeof value === 'number' ? tokenText(value) : value
  // Split a trailing unit so it can be typeset smaller, e.g. "1.2" + "M".
  const match = /^([\d.]+)([MK]?)$/.exec(text)
  return h('div', { className: 'agy-metric' },
    h('div', { className: 'agy-metric-k' }, label),
    h('div', { className: 'agy-metric-v' },
      match === null ? text : match[1],
      match !== null && match[2] !== '' ? h('small', null, match[2]) : null),
    h('div', { className: 'agy-metric-d' }, detail))
}

/** Definition rows: label/value pairs with hairline separators. */
function defs(rows: Array<[ReactNode, ReactNode]>): ReactNode {
  return h('dl', { className: 'agy-defs' },
    ...rows.flatMap(([label, value], index) => [
      h('dt', { key: `k${index}` }, label),
      h('dd', { key: `v${index}` }, value),
    ]))
}

// ─── Accounts tab ────────────────────────────────────────────────────────────

interface AccountHandlers {
  /** Localized copy, resolved per render so a language switch applies. */
  t: T
  onActivate: (index: number) => void
  onVerify: (index: number) => void
  onDelete: (index: number) => void
  onTest: (index: number) => void
  onExport: (index: number) => void
  onRegenerateFingerprint: (index: number) => void
  onSetProxy: (index: number, proxy: string) => void
  onTestProxy: (index: number) => void
}

/** One account's detail: identity, cumulative usage, proxy, and its actions. */
function AccountDetail(props: {
  account: AccountView
  busy: boolean
  handlers: AccountHandlers
  t: T
}): ReactNode {
  const { account, busy, handlers, t } = props
  const [proxyDraft, setProxyDraft] = useState('')
  const usage = account.usage
  // One clock reading per render, so every reset label agrees (as the quota list does).
  const now = Date.now()

  // The verification challenge, when the upstream raised one. The state badge
  // says the account is parked; THIS is the only place that says how to un-park
  // it, and the link exists nowhere else in the UI — dropping it left the appeal
  // URL reachable over the RPC but invisible to the person who has to act on it.
  const identityRows: Array<[ReactNode, ReactNode]> = [
    [t('fieldProject'), account.projectId ?? t('noProject')],
    [t('fieldProxy'), h('span', { className: 'agy-mono' }, account.proxy ?? t('proxyDirect'))],
    [t('fieldFingerprint'), account.fingerprint === null
      ? t('fingerprintNone')
      : t('fingerprintRegenerated', {
        count: account.fingerprintHistory,
        date: new Date(account.fingerprint.createdAt).toLocaleDateString(),
      })],
    // The age matters as much as the reason: "network error" alone reads the
    // same whether it happened seconds or days ago, which is exactly how a stale
    // value went unnoticed. The host clears expired state before rendering, so
    // this row and the state badge cannot disagree.
    [t('fieldCooldownReason'), account.cooldownReason === null
      ? t('noProject')
      : `${cooldownReasonLabel(account.cooldownReason, t)} · ${agoText(account.cooldownSetAt, t, now)}`],
    [t('fieldSources'), usage === null
      ? t('noProject')
      : t('sourcesSummary', {
        chat: usage.sources.chat,
        cli: usage.sources.cli,
        verify: usage.sources.verify,
        test: usage.sources.test,
      })],
    [t('fieldLatency'), usage === null
      ? t('noProject')
      : `${t('latencyAverage', { value: formatDuration(average(usage.totals.latencyMs, usage.totals.latencyN)) })}`
        + ` · ${t('latencyTtft', { value: formatDuration(average(usage.totals.ttftMs, usage.totals.ttftN)) })}`],
  ]
  if (account.verificationRequired) {
    identityRows.push([t('fieldVerification'), account.verificationUrl === null
      ? t('verificationNoUrl')
      : h('a', {
        className: 'agy-link',
        href: account.verificationUrl,
        // A new tab, because the Settings section is inside the host SPA:
        // navigating away would lose the panel the user is working in.
        target: '_blank',
        rel: 'noreferrer noopener',
      }, t('verificationOpen'))])
  }

  const identity = card(t('detailTitle'), defs(identityRows), account.email ?? `#${account.index}`)

  const actions = card(t('colActions'), h('div', { className: 'agy-actions' },
    button(t('actionTest'), () => { handlers.onTest(account.index) }, { disabled: busy }),
    button(t('actionExport'), () => { handlers.onExport(account.index) }, { disabled: busy }),
    button(t('actionRegenerateFingerprint'), () => { handlers.onRegenerateFingerprint(account.index) }, { disabled: busy })))

  /**
   * The 5-hour / weekly windows, placed ABOVE the cumulative usage card.
   *
   * Ordering is deliberate: these are the figures a user actually acts on
   * (the rolling budget still available), while cumulative usage is a
   * retrospective total that only grows. Putting the actionable number first is
   * the whole point of the panel.
   *
   * A window with no reported fraction renders its bar empty and its percentage
   * as an em dash — "unknown" must not look like "0% left". A null `limits` means
   * the account has not been measured YET, and says so rather than showing an
   * empty card. That is reachable at any pool size: `refreshLimits` runs for a
   * solo account too (unlike the scheduling quota refresh, which a pool of one
   * skips because measuring it could block the only account).
   */
  const limitsBlock = card(t('limitsTitle'),
    account.limits === null || account.limits.length === 0
      ? h('div', { className: 'agy-empty' }, t('limitsUnavailable'))
      // The snapshot's age is shown, not just its values. These windows come from
      // a TTL cache and a FAILED refresh keeps the previous numbers rather than
      // clearing them, so an unlabelled figure could be arbitrarily old with
      // nothing on screen to say so — the same trap as an undated cooldown reason.
      : h('div', { className: 'agy-limits' },
        account.limitsUpdatedAt === null
          ? null
          : h('div', { className: 'agy-limit-age' },
            t('limitsMeasured', { ago: agoText(new Date(account.limitsUpdatedAt).toISOString(), t, now) })),
        ...account.limits.map((group) => h('div', { className: 'agy-limit-group', key: group.name },
          h('div', { className: 'agy-limit-group-name' }, group.name),
          ...group.windows.map((window) => {
            const fraction = window.remainingFraction
            return h('div', { className: 'agy-limit-row', key: window.bucketId },
              h('span', { className: 'agy-limit-k' }, windowLabel(window.window, t)),
              h('span', { className: 'agy-limit-track' },
                fraction === null
                  ? null
                  : h('i', { style: { width: `${Math.round(fraction * 100)}%`, background: quotaColor(fraction) } })),
              // An unreported fraction is an em dash, never "0%": unknown
              // headroom and no headroom are opposite facts. A dedicated key
              // rather than reusing `noProject`, whose NAME would then be wrong
              // for the value it renders.
              h('span', { className: 'agy-limit-p' }, fraction === null ? t('valueUnknown') : `${Math.round(fraction * 100)}%`),
              h('span', { className: 'agy-limit-reset' },
                window.resetTime === null ? null : untilText(window.resetTime, t, now)))
          })))))

  const usageBlock = usage === null ? null : card(
    t('usageCumulative'),
    metrics([
      metric(t('kpiInput'), usage.totals.input, t('kpiInputDetail')),
      metric(t('kpiOutput'), usage.totals.output, t('kpiOutputDetail')),
      metric(t('kpiCacheRead'), usage.totals.cacheRead, t('kpiCacheHit', { percent: cacheHitPercent(usage.totals) ?? 0 })),
      metric(t('kpiRequests'), String(usage.totals.requests), t('kpiRequestsDetail', {
        succeeded: usage.totals.succeeded,
        failed: usage.totals.failed,
      })),
    ]),
  )

  // Saving only ever writes a non-empty draft: the empty string is the store's
  // "no proxy" sentinel (`delete account.proxy`), so a Save button that accepted
  // an empty field silently deleted the account's proxy. Clearing is an explicit
  // action with its own button, which is also what makes the destructive path
  // visible instead of sitting behind a placeholder hint.
  const saveProxy = (): void => {
    const value = proxyDraft.trim()
    if (value === '') return
    handlers.onSetProxy(account.index, value)
    setProxyDraft('')
  }

  const proxyBlock = card(t('fieldProxy'), h('div', { className: 'agy-actions' },
    h(Input, {
      value: proxyDraft,
      placeholder: t('proxyPlaceholder'),
      onChange: (event: { target: { value: string } }) => { setProxyDraft(event.target.value) },
    }),
    button(t('actionSave'), saveProxy, { disabled: busy || proxyDraft.trim() === '' }),
    button(t('actionClear'), () => {
      handlers.onSetProxy(account.index, '')
      setProxyDraft('')
    }, { disabled: busy || account.proxy === null }),
    button(t('actionTestProxy'), () => { handlers.onTestProxy(account.index) }, { disabled: busy })))

  return h('div', { className: 'agy-detail' }, identity, actions, limitsBlock, usageBlock, proxyBlock)
}

function AccountsTab(props: {
  accounts: AccountView[]
  busy: boolean
  handlers: AccountHandlers
  t: T
}): ReactNode {
  const { accounts, busy, handlers, t } = props
  const [selected, setSelected] = useState(0)

  if (accounts.length === 0) {
    return card(t('colAccount'), h('div', { className: 'agy-empty' }, t('emptyAccounts')))
  }
  // Clamp by index, not by re-deriving a "selected id": deletion renumbers every
  // row, so an id-based selection would have to be remapped anyway.
  const index = Math.min(selected, accounts.length - 1)
  const current = accounts[index]

  // A selectable row: a div with a real button role, so it is reachable and
  // operable from the keyboard. Wrapping the row in a <button> would nest the
  // action buttons inside it — invalid HTML — so the role, tab stop and key
  // handling are declared here instead.
  const rows = accounts.map((account, at) => h('div', {
    key: String(account.index),
    className: 'agy-rowitem',
    'data-clickable': 'true',
    'data-selected': at === index,
    role: 'button',
    tabIndex: 0,
    'aria-pressed': at === index,
    onClick: () => { setSelected(at) },
    onKeyDown: (event: { key: string, preventDefault: () => void }) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      // Space would otherwise scroll the settings panel.
      event.preventDefault()
      setSelected(at)
    },
  },
  h('div', { className: 'agy-rowmain' },
    h('div', { className: 'agy-rowtitle' },
      h('span', { className: 'agy-rowname' }, account.email ?? `#${account.index}`),
      account.active ? h(Tag, { tone: 'info' }, t('currentAccount')) : null),
    h('div', { className: 'agy-rowmeta' },
      (account.projectId ?? t('noProject')),
      account.usage === null || account.usage.totals.requests === 0
        ? null
        : ` · ${t('colRequests')} ${account.usage.totals.requests}`)),
  h('div', { className: 'agy-rowactions' },
    stateBadge(account.state, account.state === 'cooling'
      ? `${t('coolingUntil')} ${clockTime(account.cooldownUntil)}`
      : stateLabel(account.state, t)),
    account.active ? null : button(t('actionActivate'), () => { handlers.onActivate(account.index) },
      { size: 'sm', disabled: busy }),
    button(t('actionVerify'), () => { handlers.onVerify(account.index) }, { size: 'sm', disabled: busy }),
    button(t('actionDelete'), () => { handlers.onDelete(account.index) },
      { size: 'sm', variant: 'danger', disabled: busy }))))

  return h('div', { className: 'agy-root' },
    // The container-query wrapper the `.agy-split` breakpoint measures; see
    // styles.ts for why this is a container query rather than a viewport one.
    h('div', { className: 'agy-split-wrap' },
      h('div', { className: 'agy-split' },
        card(t('colAccount'), h('div', { className: 'agy-rows' }, ...rows),
          `${accounts.length}`),
        // `key` remounts the detail per account so its proxy draft cannot carry
        // over: without it React reuses the instance and a draft typed for one
        // account was still in the box after selecting another, one Save away
        // from writing A's proxy to B.
        current === undefined
          ? null
          : h(AccountDetail, { key: String(current.index), account: current, busy, handlers, t }))))
}

/**
 * Models tab: per-model visibility switches, plus the account's model quota in a
 * collapsible block.
 *
 * Quota lives here rather than in the account list because both answer the same
 * question — "which models can I use, and how much is left" — and the quota list
 * is long (20+ rows), so it must not push the account list off screen. The
 * disclosure keeps it one click away without spending the space by default.
 */
/**
 * Order models for display: enabled first, disabled sunk to the bottom.
 *
 * Exported for a direct unit test — the rule is pure and worth pinning, and the
 * client test harness does not render. Stable by construction: `Array.sort` is
 * stable per spec, so the host's own order survives inside each group. That is
 * what makes a toggle move exactly one row instead of reshuffling the list.
 * @param models - the host's list, in host order.
 * @returns a new array, enabled models first.
 */
export function orderModels(models: readonly ModelView[]): ModelView[] {
  return [...models].sort((a, b) => Number(a.disabled) - Number(b.disabled))
}

function ModelsTab(props: {
  models: ModelView[]
  account: string | null
  /** Model ids whose own toggle write is in flight; everything else stays live. */
  pending: ReadonlySet<string>
  /** Model ids whose own test call is in flight (see the per-row test button). */
  testing: ReadonlySet<string>
  onToggle: (modelId: string, disabled: boolean) => void
  /** Fire one test call against this exact model on the active account. */
  onTestModel: (modelId: string) => void
  /** RPC carrier for the thinking-budget block, which loads its own state. */
  rpc: AgyRpcClient
  t: T
}): ReactNode {
  const { models, account, pending, testing, onToggle, onTestModel, rpc, t } = props

  // Hooks MUST run unconditionally: an early `return` above any hook changes
  // this component's hook count between renders, and React's renderer state —
  // keyed by call order — desyncs and throws mid-render. The exception unmounts
  // the whole Settings tree: a white panel that no tab click can revive, only a
  // restart. This fired whenever `models.length` crossed the 0/non-0 boundary
  // between two renders (startup loads models async; a refresh that loses the
  // account empties it), which is why it looked like a random crash.
  const ordered = useMemo(() => orderModels(models), [models])

  if (models.length === 0) {
    return card(t('modelsTitle'), h('div', { className: 'agy-empty' }, t('emptyModels')))
  }
  const hidden = models.filter((model) => model.disabled).length

  // One normal row per model. A row is a plain grid, not a table: the switch is
  // the affordance and a table's column rules would fight the card's rhythm.
  // Each row carries its own test button: "does THIS model work" is the same
  // decision the visibility switch answers, so the two live side by side. The
  // old dashboard also had a "test all models" loop; deliberately not restored —
  // it fired one billed upstream call per model, serially, behind one confirm.
  const rows = ordered.map((model) => h('div', { className: 'agy-rowitem', key: model.id },
    h('div', { className: 'agy-rowmain' },
      h('div', { className: 'agy-rowtitle' },
        h('span', { className: 'agy-rowname' }, model.name)),
      model.name === model.id
        ? null
        : h('div', { className: 'agy-rowmeta agy-mono' }, model.id)),
    h('div', { className: 'agy-rowactions' },
      // The host `Button` at `ghost`, not a local class: this is a quiet action
      // (one per row of a long list, so a filled capsule would read as many
      // competing primary actions), and `ghost` is the host's own variant for
      // exactly that weight. Styling it locally meant our own colors, radius and
      // focus ring, which is how this row ended up looking unlike every other
      // button in the panel.
      button(testing.has(model.id) ? t('modelTesting') : t('actionTestModel'),
        () => { onTestModel(model.id) },
        { size: 'sm', variant: 'ghost', disabled: testing.has(model.id) }),
      h(Switch, {
        checked: !model.disabled,
        // Only THIS switch locks while its own write is in flight. The previous
        // global `busy` disabled every control on the page for the duration of
        // two network round trips, which is what made one toggle feel like the
        // whole panel froze.
        disabled: pending.has(model.id),
        label: t('modelToggleAria', { name: model.name }),
        onChange: () => { onToggle(model.id, !model.disabled) },
      }))))

  return h('div', { className: 'agy-root' },
    card(t('modelsTitle'), h('div', { className: 'agy-rows' }, ...rows),
      hidden > 0 ? t('modelsHiddenSuffix', { count: hidden }) : account ?? undefined),
    hint(t('modelsHelp')),
    h(ThinkingBudgetCard, { rpc, t }))
}

/**
 * The global reasoning-level token budgets.
 *
 * One row per level rather than per model: only `*-tiered` models send a
 * `thinkingConfig` at all, and the level itself is already chosen in DSH's model
 * selector. So this supplies the missing VALUE behind each level — the same three
 * numbers for every such model.
 *
 * An EMPTY input is the meaningful default: the request then sends
 * `thinkingLevel` and lets upstream pick, which is exactly the behaviour before
 * this setting existed. That is why the field is not a `number` input with a
 * zero fallback, and why clearing it is a real action rather than "set to 0"
 * (measured: `0` reduces thinking but does not reliably disable it).
 */
function ThinkingBudgetCard(props: { rpc: AgyRpcClient, t: T }): ReactNode {
  const { rpc, t } = props
  const [budgets, setBudgets] = useState<ThinkingBudgets>({})
  const [claudeBudget, setClaudeBudget] = useState<number | null>(null)
  const [claudeDraft, setClaudeDraft] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback((): void => {
    void (async () => {
      try {
        const result = await rpc.call('thinking.get', {})
        if (!alive.current) return
        setBudgets(result.budgets)
        setClaudeBudget(result.claudeBudget)
        setClaudeDraft(result.claudeBudget === null ? '' : String(result.claudeBudget))
        // Drafts mirror the stored values as strings, so an in-progress edit is
        // never clobbered by a reload and an empty box stays empty.
        setDrafts(Object.fromEntries(
          THINKING_LEVELS.map((level) => [level, result.budgets[level] === undefined ? '' : String(result.budgets[level])]),
        ))
        setError(undefined)
      } catch (caught) {
        if (!alive.current) return
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (alive.current) setLoaded(true)
      }
    })()
  }, [rpc])

  // Loaded on first open, not on mount: the Models tab renders on every visit to
  // the panel, and this is a settings read nobody needs until the block is shown.
  useEffect(() => {
    if (open && !loaded) load()
  }, [open, loaded, load])

  const save = (level: string, raw: string): void => {
    const trimmed = raw.trim()
    // An empty box means "no budget for this level", which the host clears.
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && !Number.isInteger(value)) {
      setError(t('thinkingInvalid'))
      return
    }
    void (async () => {
      try {
        const result = await rpc.call('thinking.set', { level, budget: value })
        if (!alive.current) return
        setBudgets(result.budgets)
        setError(undefined)
      } catch (caught) {
        // The host rejects an out-of-range value with the exact interval, so its
        // message is more useful than a generic one.
        if (!alive.current) return
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()
  }

  const saveClaude = (raw: string): void => {
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && !Number.isInteger(value)) {
      setError(t('thinkingInvalid'))
      return
    }
    void (async () => {
      try {
        const result = await rpc.call('thinking.setClaude', { budget: value })
        if (!alive.current) return
        setClaudeBudget(result.claudeBudget)
        setError(undefined)
      } catch (caught) {
        if (!alive.current) return
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()
  }

  const configured = THINKING_LEVELS.filter((level) => budgets[level] !== undefined).length
  const block = h('div', { className: 'agy-disclosure', 'data-open': open },
    h('button', {
      type: 'button',
      className: 'agy-disclosure-toggle',
      'aria-expanded': open,
      onClick: () => { setOpen(!open) },
    },
    h('span', { className: 'agy-caret' }),
    h('span', null, t('thinkingTitle')),
    h('span', { className: 'agy-disclosure-meta' },
      configured === 0 ? t('thinkingDefaultAll') : t('thinkingConfigured', { count: configured }))),
    open
      ? h('div', { className: 'agy-disclosure-body' },
        error === undefined ? null : h('div', { className: 'agy-error' }, error),
        ...THINKING_LEVELS.map((level) => h('div', { className: 'agy-thinking-row', key: level },
          h('span', { className: 'agy-thinking-k' }, levelLabel(level, t)),
          h(Input, {
            value: drafts[level] ?? '',
            // The placeholder states what EMPTY does, not a number: a grey `1000`
            // would read as "leaving this blank gives you 1000", which is the
            // opposite of the real behaviour.
            placeholder: t('thinkingAuto'),
            inputMode: 'numeric',
            onChange: (event: { target: { value: string } }) => {
              setDrafts((current) => ({ ...current, [level]: event.target.value }))
            },
            onBlur: (event: { target: { value: string } }) => {
              const next = event.target.value
              const stored = budgets[level] === undefined ? '' : String(budgets[level])
              if (next.trim() !== stored) save(level, next)
            },
          }),
          // The wire form for THIS level, right where the choice is made: the
          // whole point of the setting is what goes out on the wire, and that
          // differs per level once a budget is set.
          h('span', { className: 'agy-thinking-wire' },
            budgets[level] === undefined
              ? t('thinkingWireLevel', { level })
              : t('thinkingWireBudget', { budget: budgets[level] })))),
        // What each level does by default, and what the upstream default is.
        // Both are measured facts, not invented values: the official default is
        // the `thinkingBudget` upstream itself reports for these ids.
        h('div', { className: 'agy-thinking-notes' },
          h('p', { className: 'agy-hint' }, t('thinkingHint', { min: THINKING_BUDGET_MIN, max: THINKING_BUDGET_MAX })),
          h('p', { className: 'agy-hint' }, t('thinkingHintOfficial')),
          h('p', { className: 'agy-hint' }, t('thinkingHintMinus1'))),
        // Claude gets its own single field rather than three levels: the family is
        // id-bound (each capability is its own model id, e.g.
        // `claude-opus-4-6-thinking`), so there is no level to key by. Its
        // interval also differs — floor 1024, and the request needs `max_tokens`
        // strictly greater than the budget — which is why it validates separately.
        h('div', { className: 'agy-thinking-claude' },
          h('div', { className: 'agy-thinking-row' },
            h('span', { className: 'agy-thinking-k' }, t('thinkingClaudeLabel')),
            h(Input, {
              value: claudeDraft,
              placeholder: t('thinkingAuto'),
              inputMode: 'numeric',
              onChange: (event: { target: { value: string } }) => { setClaudeDraft(event.target.value) },
              onBlur: (event: { target: { value: string } }) => {
                const next = event.target.value
                const stored = claudeBudget === null ? '' : String(claudeBudget)
                if (next.trim() !== stored) saveClaude(next)
              },
            }),
            h('span', { className: 'agy-thinking-wire' },
              claudeBudget === null
                ? t('thinkingWireNone')
                : t('thinkingWireBudget', { budget: claudeBudget }))),
          h('p', { className: 'agy-hint' }, t('thinkingClaudeHint', { min: CLAUDE_BUDGET_MIN, max: CLAUDE_BUDGET_MAX }))))
      : null)

  return card(t('thinkingTitle'), block)
}

// ─── Usage tab ───────────────────────────────────────────────────────────────

type RangeId = 'today' | 'week' | 'month' | 'all'

const RANGE_IDS: readonly RangeId[] = ['today', 'week', 'month', 'all']

/** Localized label for one range chip. */
function rangeLabel(id: RangeId, t: T): string {
  switch (id) {
    case 'today': return t('rangeToday')
    case 'week': return t('rangeWeek')
    case 'month': return t('rangeMonth')
    case 'all': return t('rangeAll')
  }
}

/**
 * Fixed widths for the numeric columns, shared by BOTH breakdown tables.
 *
 * They must be identical across the two tables. `table-layout: fixed` gives the
 * auto-width first column whatever is left, so two different width sums put the
 * numeric columns of the two tables at different x positions — the by-account
 * table's numbers sat 48px right of the by-model table's, which is what made a
 * long account row look like it was shoving the figures sideways. Sharing one
 * vector keeps every numeric column vertically aligned down the page.
 *
 * Last entry is wider because it carries the share bar (by model) as well as a
 * plain count (by account, "rotations").
 */
const NUM_COL_WIDTHS = ['48px', '56px', '56px', '56px', '64px'] as const

/** One right-aligned numeric header cell at column position `index`. */
function numHeader(index: number, label: string): ReactNode {
  return h('th', { className: 'agy-num', style: { width: NUM_COL_WIDTHS[index] } }, label)
}

/**
 * The Token composition bar rows: cache read, uncached input, output.
 *
 * A plain-prefix cache makes the cache-read share dominate (it re-reads the whole
 * prefix every turn), which is correct but reads as impossible without a
 * breakdown — hence this bar, which shows the proportion rather than restating
 * the numbers.
 *
 * `labelKey` and `id` are SEPARATE fields on purpose. A single `key` field used
 * for both the i18n lookup and React's `key` prop is how the label position ended
 * up rendering the raw dictionary key (`kpiCacheRead`) to every user: the value
 * served React correctly, so nothing failed, and the same variable was then
 * handed to the label span. Two names make that mix-up impossible.
 */
function tokenComposition(counters: UsageCounters, t: T): ReactNode {
  const total = totalTokens(counters)
  const rows: Array<{ id: string, labelKey: AgyLocaleKey, value: number, tone: string }> = [
    { id: 'cacheRead', labelKey: 'kpiCacheRead', value: counters.cacheRead, tone: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)' },
    { id: 'input', labelKey: 'kpiInput', value: counters.input, tone: 'var(--dsw-static-neutral-bluish-700, #8b8f96)' },
    { id: 'output', labelKey: 'kpiOutput', value: counters.output, tone: 'var(--dsw-alias-state-success-primary, #22c55e)' },
  ]
  return h('div', { className: 'agy-compose' }, ...rows.map((row) => {
    const share = total > 0 ? (row.value / total) * 100 : 0
    return h('div', { className: 'agy-compose-row', key: row.id },
      h('span', { className: 'agy-compose-k' }, t(row.labelKey)),
      h('span', { className: 'agy-compose-track' },
        h('i', { style: { width: `${Math.max(share, row.value > 0 ? 1 : 0)}%`, background: row.tone } })),
      h('span', { className: 'agy-compose-v' }, tokenText(row.value)),
      h('span', { className: 'agy-compose-p' }, `${share.toFixed(1)}%`))
  }))
}

function UsageTab(props: { stats: StatsView | null, t: T }): ReactNode {
  const { t } = props
  const [range, setRange] = useState<RangeId>('today')
  const stats = props.stats
  if (stats === null) return h('div', { className: 'agy-empty' }, t('loading'))
  if (stats.all.counters.requests === 0) {
    return card(t('usageTitle'), h('div', { className: 'agy-empty' }, t('emptyUsage')))
  }

  // ONE selection drives the whole page: the headline strip AND both breakdown
  // tables read the same range. Previously the tables read all-time maps, so
  // "Today" showed 30 requests above a 164-request row.
  const view = range === 'today'
    ? stats.today
    : range === 'week'
      ? stats.week
      : range === 'month' ? stats.month : stats.all
  const counters = view.counters
  const hit = cacheHitPercent(counters)
  const total = totalTokens(counters)

  // The primitives catalog names `Pill` for view switchers and filters: it owns
  // the active/inactive fill pair, so no local chip skin is needed.
  const rangePicker = h('div', { className: 'agy-toolbar' },
    h('div', { className: 'agy-chips' }, ...RANGE_IDS.map((id) => h(Pill, {
      key: id,
      active: range === id,
      onClick: () => { setRange(id) },
    }, rangeLabel(id, t)))),
    h('span', { className: 'agy-grow' }),
    stats.since === null
      ? null
      : h('span', { className: 'agy-aside' }, t('since', { date: new Date(stats.since).toLocaleDateString() })))

  /**
   * The headline: total Token FIRST, then the three buckets that add up to it.
   *
   * The anchor is what makes the rest readable. Without it a reader sees "cache
   * read 25.8M" beside "input 11.1M" and has no way to know both are parts of
   * one quantity — and a cache read LARGER than the input looks like a bug
   * rather than the expected shape of a prefix cache. With the total stated, the
   * three figures are visibly a partition (their sum is checked by eye).
   */
  const summary = card(t('usageTitle'), h('div', null,
    metrics([
      metric(t('kpiTotalTokens'), total, t('kpiTotalDetail', {
        requests: counters.requests,
        failed: counters.failed,
      })),
      metric(t('kpiInput'), counters.input, t('kpiInputDetail')),
      metric(t('kpiCacheRead'), counters.cacheRead,
        hit === null ? t('kpiNoBilledInput') : t('kpiCacheHit', { percent: hit })),
      metric(t('kpiOutput'), counters.output, t('kpiOutputDetail')),
    ]),
    tokenComposition(counters, t)))

  const timing = card(t('fieldLatency'), defs([
    [t('fieldCacheWrite'), tokenText(counters.cacheWrite)],
    [t('fieldRateLimitRotation'), `${counters.rateLimited} / ${counters.rotations}`],
    [t('labelLatencyAverage'), formatDuration(average(counters.latencyMs, counters.latencyN))],
    [t('labelTtft'), formatDuration(average(counters.ttftMs, counters.ttftN))],
  ]))

  // Column headers carry the semantics that used to sit in a card-head aside:
  // "input" is the UNCACHED portion, so it is labelled as such rather than
  // explained in prose the reader has to find.
  const byModel = view.models.length === 0 ? null : card(
    t('byModel'),
    h('div', { className: 'agy-table-wrap' },
      table(
        h('tr', null,
          h('th', null, t('colModel')),
          numHeader(0, t('colRequests')),
          numHeader(1, t('colInputUncached')),
          numHeader(2, t('colCacheRead')),
          numHeader(3, t('colOutput')),
          numHeader(4, t('colTokenShare'))),
        view.models.map((row) => h('tr', { key: row.model },
          h('td', { className: 'agy-strong' }, h('span', { className: 'agy-mail' }, row.model)),
          h('td', { className: 'agy-num' }, String(row.counters.requests)),
          h('td', { className: 'agy-num' }, tokenText(row.counters.input)),
          h('td', { className: 'agy-num' }, tokenText(row.counters.cacheRead)),
          h('td', { className: 'agy-num' }, tokenText(row.counters.output)),
          // Token share, not request share: every neighbouring column is tokens,
          // and the old bar silently measured requests under a "share" header, so
          // the heaviest-REQUEST row led even when it moved few tokens.
          h('td', { className: 'agy-num' },
            h('span', { className: 'agy-bar' },
              h('span', { className: 'agy-track' },
                h('i', {
                  style: {
                    width: `${Math.round((totalTokens(row.counters) / Math.max(1, total)) * 100)}%`,
                  },
                })))))))),
    tokenShareNote(t))

  const byAccount = view.accounts.length === 0 ? null : card(t('byAccount'),
    h('div', { className: 'agy-table-wrap' },
      table(h('tr', null,
        h('th', null, t('colAccount')),
        numHeader(0, t('colRequests')),
        numHeader(1, t('colToken')),
        numHeader(2, t('colFailed')),
        numHeader(3, t('colRateLimited')),
        numHeader(4, t('colRotations'))),
      view.accounts.map((row) => h('tr', { key: row.account },
        h('td', { className: 'agy-strong' }, h('span', { className: 'agy-mail' }, row.account)),
        h('td', { className: 'agy-num' }, String(row.counters.requests)),
        h('td', { className: 'agy-num' }, tokenText(totalTokens(row.counters))),
        h('td', { className: 'agy-num' }, String(row.counters.failed)),
        h('td', { className: 'agy-num' }, String(row.counters.rateLimited)),
        h('td', { className: 'agy-num' }, String(row.counters.rotations))))),
    ),
  )

  return h('div', { className: 'agy-root' },
    rangePicker, summary, timing, byModel, byAccount)
}

/** The one-line footnote stating what the token columns count. */
function tokenShareNote(t: T): ReactNode {
  return h('p', { className: 'agy-hint agy-table-note' }, t('tokenColumnNote'))
}

// ─── Credentials tab ─────────────────────────────────────────────────────────

function CredentialsTab(props: {
  busy: boolean
  onImport: (kind: 'json' | 'blob', sources: string[]) => void
  onExportAll: () => void
  t: T
}): ReactNode {
  const { t } = props
  const [text, setText] = useState('')
  const sources = useMemo(
    () => text.split('\n').map((line) => line.trim()).filter((line) => line !== ''),
    [text],
  )
  const suffix = sources.length > 1 ? ` (${sources.length})` : ''
  return h('div', { className: 'agy-root' },
    subhead(t('importTitle')),
    hint(t('importHelp')),
    h('textarea', {
      className: 'agy-textarea',
      style: { marginTop: '8px' },
      value: text,
      placeholder: t('importPlaceholder'),
      onChange: (event: { target: { value: string } }) => { setText(event.target.value) },
    }),
    h('div', { className: 'agy-toolbar', style: { marginTop: '8px' } },
      // Both labels go through the dictionary: hardcoded Chinese showed up in
      // the English UI and bypassed the zh/en parity check.
      button(`${t('importJson')}${suffix}`, () => { props.onImport('json', sources) },
        { disabled: props.busy || sources.length === 0 }),
      button(`${t('importBlob')}${suffix}`, () => { props.onImport('blob', sources) },
        { disabled: props.busy || sources.length === 0 }),
      h('span', { className: 'agy-grow' }),
      button(t('exportAll'), () => { props.onExportAll() }, { disabled: props.busy })))
}

// ─── root ────────────────────────────────────────────────────────────────────

/** The Settings section body. */
export function AgySettings(props: { rpc: AgyRpcClient, t: T }): ReactNode {
  const { rpc, t } = props
  const [tab, setTab] = useState<TabId>('accounts')
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [models, setModels] = useState<ModelView[]>([])
  const [modelAccount, setModelAccount] = useState<string | null>(null)
  /** Model-discovery failure, shown on the Models tab only (see loadModels). */
  const [modelError, setModelError] = useState<string | undefined>(undefined)
  /** Model ids whose own visibility write is in flight (see the toggle handler). */
  const [toggling, setToggling] = useState<ReadonlySet<string>>(() => new Set())
  /** Model ids whose own test call is in flight (see the per-row test button). */
  const [modelTesting, setModelTesting] = useState<ReadonlySet<string>>(() => new Set())
  const [stats, setStats] = useState<StatsView | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  /** A non-fatal outcome worth reporting (e.g. a partial credential import). */
  const [notice, setNoticeState] = useState<string | undefined>(undefined)

  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  /** Guards state updates after the section unmounts mid-request. */
  const alive = useRef(true)

  /**
   * Show a transient notice, then clear it.
   *
   * A notice that never clears is indistinguishable from a stuck UI: the model
   * test's "X is working." stayed on screen forever, through every later action.
   * The deleted dashboard's toasts auto-dismissed after 3.5s for the same
   * reason; this keeps that behaviour, and a newer notice simply replaces the
   * pending timer.
   */
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setNotice = useCallback((text: string | undefined) => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    noticeTimer.current = undefined
    setNoticeState(text)
    if (text === undefined) return
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = undefined
      if (alive.current) setNoticeState(undefined)
    }, 3_500)
  }, [])

  // Cancel a pending dismissal when the section unmounts.
  useEffect(() => () => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
  }, [])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const refresh = useCallback(async () => {
    // Deliberately NOT `Promise.all` on both calls. `account.list` can be slow
    // (it reaches upstream for quota discovery), while `stats.get` is a pure
    // local file read that cannot be — pairing them meant one slow call blanked
    // BOTH views, showing "no accounts" and a permanent spinner for data that
    // was never in doubt. Each settles on its own, so the usage tab renders
    // even if accounts lag.
    const [accountOutcome, statsOutcome] = await Promise.allSettled([
      rpc.call('account.list', {}),
      rpc.call('stats.get', {}),
    ])
    if (!alive.current) return
    if (accountOutcome.status === 'fulfilled') setAccounts(accountOutcome.value.accounts)
    if (statsOutcome.status === 'fulfilled') setStats(statsOutcome.value)
    // Surface a failure, but only after committing the successful halves, so a
    // partial failure still renders everything it can.
    const failed = [accountOutcome, statsOutcome].find((outcome) => outcome.status === 'rejected')
    if (failed?.status === 'rejected') {
      const caught: unknown = failed.reason
      setError(caught instanceof Error ? caught.message : String(caught))
    } else {
      setError(undefined)
    }
    if (alive.current) setLoaded(true)
  }, [rpc])

  /**
   * Refresh the 5h/weekly windows and merge them into the account rows.
   *
   * A separate call from `account.list` because that reply is deliberately
   * probe-free — folding an upstream call into it once made the whole view wait
   * on the network. Here the rows render immediately from `account.list` and the
   * windows fill in when they arrive, so a slow probe costs a placeholder.
   *
   * It also works for a pool of ANY size: the scheduling quota refresh is skipped
   * for a single enabled account (measuring that one could block the only
   * account), so this endpoint is the only thing that fills `cachedLimits` there.
   */
  const loadLimits = useCallback(async () => {
    try {
      const result = await rpc.call('account.limits', {})
      if (!alive.current) return
      const byIndex = new Map(result.limits.map((entry) => [entry.index, entry]))
      setAccounts((current) => current.map((account) => {
        const entry = byIndex.get(account.index)
        // Leave the row untouched when this refresh learned nothing, so a failed
        // probe cannot erase windows that were already showing.
        if (entry === undefined || entry.groups === null) return account
        return { ...account, limits: entry.groups, limitsUpdatedAt: entry.updatedAt }
      }))
    } catch {
      // Display-only: a failed refresh leaves the existing windows in place and
      // must never surface as an error banner over the accounts list.
    }
  }, [rpc])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    // Only on the tab that shows them, and after the rows exist so the merge has
    // something to write into.
    if (tab === 'accounts' && accounts.length > 0) void loadLimits()
  }, [tab, accounts.length, loadLimits])

  /**
   * The model list loads separately: it is the one call that may reach upstream
   * (model discovery), so the page must render even when it is slow or fails.
   *
   * Its failure is kept out of the shared error banner. The list is loaded
   * eagerly (the tab badge needs it), and "no account configured yet" is a
   * perfectly ordinary startup state for an accounts-first page — putting that
   * in the banner would greet every new user with an error.
   */
  const loadModels = useCallback(async () => {
    try {
      const result = await rpc.call('model.list', {})
      if (!alive.current) return
      setModels(result.models)
      setModelAccount(result.account)
      setModelError(undefined)
    } catch (caught) {
      if (!alive.current) return
      setModelError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [rpc])

  // Models load up front, not on first visit to the Models tab: the tab badge is
  // rendered from this list, so lazy loading made the count appear only after
  // the user had already been there, and left it stale after account changes.
  // The call is not awaited by `refresh`, so a slow model discovery still does
  // not hold up the accounts view.
  useEffect(() => { void loadModels() }, [loadModels])
  useEffect(() => {
    // Retry when the Models tab is opened and the initial load failed (e.g. no
    // account existed yet at mount, and one was added afterwards).
    if (tab === 'models' && models.length === 0) void loadModels()
  }, [tab, models.length, loadModels])
  /** Run one mutating call, then reload; failures land in the banner. */
  const act = useCallback(async (run: () => Promise<unknown>) => {
    setBusy(true)
    // A fresh action supersedes the previous outcome; a stale notice next to a
    // new error would read as if both were current.
    setNotice(undefined)
    try {
      await run()
      await refresh()
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [refresh])

  const startLogin = useCallback(() => {
    setBusy(true)
    rpc.call('auth.url', {}).then((result) => {
      window.open(result.url, 'agy-oauth', 'width=520,height=680')
      setError(undefined)
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    }).finally(() => {
      if (alive.current) setBusy(false)
    })
  }, [rpc])

  // The callback page posts this once the exchange succeeds.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      // Check the ORIGIN, not just the payload: the callback page is served from
      // this same web server, so a matching origin is what distinguishes it from
      // any other page that can reach this window. Without the check, an
      // unrelated opener could trigger a refresh by posting the same shape.
      if (event.origin !== window.location.origin) return
      if ((event.data as { type?: string } | null)?.type === 'agy_login_success') void refresh()
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [refresh])

  const copyText = useCallback(async (text: string) => {
    await navigator.clipboard?.writeText(text)
  }, [])

  const handlers: AccountHandlers = useMemo(() => ({
    t,
    onActivate: (index) => { void act(() => rpc.call('account.activate', { index })) },
    onVerify: (index) => { void act(() => rpc.call('account.verify', { index })) },
    onDelete: (index) => {
      if (!window.confirm(t('confirmDelete'))) return
      void act(() => rpc.call('account.delete', { index }))
    },
    onTest: (index) => {
      // Test needs a model id; discover the first visible one rather than
      // guessing, and report clearly when there is none.
      void act(async () => {
        const listed = models.length > 0 ? models : (await rpc.call('model.list', {})).models
        const target = listed.find((entry) => !entry.disabled)?.id
        if (target === undefined) throw new Error(t('noModelToTest'))
        // Carry the clicked row's index: without it the host tested whichever
        // account affinity picked and reported that result here.
        await rpc.call('account.test', { model: target, index })
      })
    },
    onExport: (index) => {
      void act(async () => {
        const result = await rpc.call('account.export', { index })
        if (result.blob === undefined) throw new Error(result.error ?? t('exportFailed'))
        await copyText(result.blob)
      })
    },
    onRegenerateFingerprint: (index) => {
      void act(() => rpc.call('account.fingerprint', { index, action: 'regenerate' }))
    },
    onSetProxy: (index, proxy) => { void act(() => rpc.call('account.proxy', { index, proxy })) },
    onTestProxy: (index) => { void act(() => rpc.call('account.proxyTest', { index })) },
  }), [act, copyText, models, rpc, t])

  const tabButton = (id: TabId, label: string, count?: number): ReactNode =>
    h('button', {
      key: id,
      type: 'button',
      className: 'agy-tab',
      'data-active': tab === id,
      onClick: () => { setTab(id) },
    }, label, count === undefined ? null : h('span', { className: 'agy-count' }, String(count)))

  const body = tab === 'accounts'
    ? h(AccountsTab, { accounts, busy, handlers, t })
    : tab === 'models'
      ? modelError === undefined
        ? h(ModelsTab, {
          models,
          account: modelAccount,
          // The quota panel answers the same question as the visibility list
          // ("which models can I use, how much is left"), so it lives here. It is
          // read from the active account's row, which is the only one the host
          // queries (see management.ts listAccounts).
          pending: toggling,
          testing: modelTesting,
          rpc,
          t,
          /**
           * Optimistic, per-model toggle.
           *
           * The old handler ran the write AND a full `model.list` reload through
           * `act()`, so a click cost two network round trips (the reload reaches
           * upstream model discovery) while a single global `busy` flag disabled
           * every control on the page — hence "it hangs, everything is disabled,
           * then it switches". The write is authoritative and its result is
           * already known, so the list is updated from the response and no
           * reload is needed: the switch reflects exactly what the host stored.
           */
          onToggle: (modelId: string, disabled: boolean) => {
            setToggling((current) => new Set(current).add(modelId))
            void (async () => {
              try {
                const result = await rpc.call('model.setDisabled', { modelId, disabled })
                if (!alive.current) return
                setModels((current) => current.map((model) => (model.id === result.modelId
                  ? { ...model, disabled: result.disabled }
                  : model)))
                setError(undefined)
              } catch (caught) {
                if (!alive.current) return
                setError(caught instanceof Error ? caught.message : String(caught))
              } finally {
                if (alive.current) {
                  setToggling((current) => {
                    const next = new Set(current)
                    next.delete(modelId)
                    return next
                  })
                }
              }
            })()
          },
          /**
           * One billed test call against exactly this model, reported in the
           * shared notice line (OK) or error banner (failure). The result must
           * not be silent: a test that shows nothing looks like nothing ran.
           */
          onTestModel: (modelId: string) => {
            setError(undefined)
            setNotice(undefined)
            setModelTesting((current) => new Set(current).add(modelId))
            void (async () => {
              try {
                // The active account serves the test, which is the account whose
                // quota this list describes; passing no index keeps that contract.
                const result = await rpc.call('account.test', { model: modelId })
                if (!alive.current) return
                if (result.ok) {
                  setNotice(t('modelTestOk', { model: modelId }))
                } else {
                  setError(t('modelTestFail', { model: modelId }) + (result.error ? `\n${result.error}` : ''))
                }
              } catch (caught) {
                if (!alive.current) return
                setError(caught instanceof Error ? caught.message : String(caught))
              } finally {
                if (alive.current) {
                  setModelTesting((current) => {
                    const next = new Set(current)
                    next.delete(modelId)
                    return next
                  })
                }
              }
            })()
          },
        })
        : h('div', { className: 'agy-root' },
          h('div', { className: 'agy-error' }, modelError),
          button(t('refresh'), () => { void loadModels() }, { size: 'sm' }))
      : tab === 'usage'
        ? h(UsageTab, { stats, t })
        : h(CredentialsTab, {
          busy,
          t,
          onImport: (kind: 'json' | 'blob', sources: string[]) => {
            void act(async () => {
              const result = await rpc.call('account.import', { kind, sources })
              // A batch with failures is a partial success, so it must not be
              // reported through the error path — and it must not be silent
              // either, which is what discarding this result used to be.
              if (result.errors.length > 0) {
                setNotice(`${t('importPartial', {
                  imported: result.imported,
                  replaced: result.replaced,
                  failed: result.errors.length,
                })}\n${result.errors.join('\n')}`)
              } else {
                setNotice(t('importResult', {
                  imported: result.imported,
                  replaced: result.replaced,
                }))
              }
            })
          },
          onExportAll: () => {
            void act(async () => {
              const { blobs } = await rpc.call('account.exportAll', {})
              await copyText(blobs.map((entry) => entry.blob).join('\n'))
            })
          },
        })

  return h('div', { className: 'agy-root' },
    h('div', { className: 'agy-head' },
      h('div', null,
        h('div', { className: 'agy-title' }, 'Antigravity'),
        h('div', { className: 'agy-sub' }, t('subtitle'))),
      h('div', { className: 'agy-toolbar' },
        // Both header actions use the host's `outline` variant — the same one
        // Refresh already used. They are equal-weight utility actions, so they
        // must look identical; an earlier pass gave Login `toolbar` (a filled
        // variant) to avoid the near-white `primary` slab, which fixed that
        // button but left the pair visibly mismatched. Copying Refresh is the
        // correct answer: `outline` is a bordered transparent capsule that reads
        // correctly in both themes, and it needs no token reasoning of ours.
        button(t('refresh'), () => { void refresh() }, { size: 'sm', disabled: busy }),
        button(t('login'), startLogin, { size: 'sm', disabled: busy }))),
    h('div', { className: 'agy-tabs' },
      tabButton('accounts', t('tabAccounts'), accounts.length),
      tabButton('models', t('tabModels'), models.length > 0 ? models.length : undefined),
      tabButton('usage', t('tabUsage')),
      tabButton('credentials', t('tabCredentials'))),
    error === undefined ? null : h('div', { className: 'agy-error' }, error),
    notice === undefined ? null : h('div', { className: 'agy-notice' }, notice),
    body,
    loaded || error !== undefined ? null : h('div', { className: 'agy-empty' }, t('loading')))
}

/**
 * Register the Antigravity Settings section while this client plugin is active.
 * @param ctx - Client Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => installAgyStyles(), 'dsh-agy: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-agy: dictionaries')
  const connection = ctx.get('connection') as ConnectionLike | undefined
  if (connection === undefined) {
    ctx.logger.warn('[dsh-agy] connection service unavailable — Antigravity settings not registered')
    return
  }
  const rpc = createRpc(connection)
  // Bound once from the host's locale service: the slot content is re-created on
  // a language switch (the locale plugin bumps the ledger), so `t` stays current.
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agy',
    order: 30,
    locale: NS,
    label: () => t('title'),
  }, () => h(AgySettings, { rpc, t }))), 'dsh-agy: Settings section')
}
