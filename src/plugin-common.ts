/**
 * Shared runtime construction for the in-harness plugin entries: master-key
 * codec resolution (credentials seam first, credentials document fallback),
 * account store, session manager, and adapter. Used by the main plugin
 * (adapter registration) and the web plugin (route registration) so both
 * entries operate on the same store.
 */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { AgyAdapter } from './adapter/adapter.ts'
import type { AgyAttachmentStore } from './adapter/adapter.ts'
import { AGY_PROVIDER } from './adapter/models.ts'
import { ModelVisibility } from './model-visibility.ts'
import { ThinkingBudgetStore } from './thinking-budget.ts'
import { UsageStats } from './stats.ts'
import { probeFetch, proxiedFetch } from './proxy.ts'
import { pickProbeProxyUrl } from './runtime/rotation.ts'
import { resolveAntigravityVersion } from './runtime/version.ts'
import type { FetchLike } from './runtime/version.ts'
import { AgySessionManager } from './session.ts'
import { JsonAccountStore } from './store/accounts.ts'
import type { AccountStore } from './store/accounts.ts'
import {
  MASTER_KEY_REF,
  createAesGcmCodec,
  deriveKey,
  loadMasterKey,
  persistMasterKey,
  resolveDshHome,
  resolveMasterKeyCodec,
} from './store/keyring.ts'
import type { SecretCodec } from './store/keyring.ts'

export interface CredentialsSeam {
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
}

function codecFrom(masterKey: string): SecretCodec {
  return createAesGcmCodec(deriveKey(masterKey))
}

/** Resolve or create the master key, preferring the credentials seam when available. */
export async function resolveCodec(ctx: Context): Promise<{ codec: SecretCodec; created: boolean }> {
  const dshHome = resolveDshHome()
  const credentials = ctx.get('credentials') as CredentialsSeam | undefined

  if (credentials) {
    const resolved = await credentials.resolve(MASTER_KEY_REF)
    if (resolved) return { codec: codecFrom(resolved.value), created: false }
    const fileKey = loadMasterKey(dshHome)
    if (fileKey) return { codec: codecFrom(fileKey), created: false }
    const fresh = randomBytes(32).toString('hex')
    try {
      await credentials.set(MASTER_KEY_REF, fresh)
      return { codec: codecFrom(fresh), created: true }
    } catch {
      // Read-only shadowing: persist to the credentials document directly.
      persistMasterKey(dshHome, fresh)
      return { codec: codecFrom(fresh), created: true }
    }
  }

  return resolveMasterKeyCodec(dshHome)
}

/**
 * Fire-and-forget version warm-up so fingerprint generation inside the
 * rate-limit path never waits on a cold feed.
 *
 * Routed through `pickProbeProxyUrl`: the release feeds are not account-scoped,
 * but the host IP is exactly what a per-account-proxy user asked to hide, and a
 * bare `proxiedFetch` sends this boot-time request directly. Never throws — an
 * unreadable store or a dead feed must not be the reason plugin boot fails.
 */
async function warmVersionCache(store: AccountStore): Promise<void> {
  let fetchImpl: FetchLike = proxiedFetch
  try {
    const storage = await store.load()
    const proxyUrl = pickProbeProxyUrl(storage.accounts, storage.activeIndex)
    fetchImpl = probeFetch(proxyUrl)
  } catch {
    // Fall through to the env/direct route.
  }
  await resolveAntigravityVersion(fetchImpl).catch(() => {})
}

/** Build the store, session manager, and adapter for one plugin entry. */
export async function createAgyRuntime(ctx: Context): Promise<{
  store: AccountStore
  sessions: AgySessionManager
  adapter: AgyAdapter
  stats: UsageStats
  modelVisibility: ModelVisibility
  thinkingBudget: ThinkingBudgetStore
}> {
  const { codec } = await resolveCodec(ctx)
  const dshHome = resolveDshHome()
  const store = new JsonAccountStore({ file: `${dshHome}/agy-accounts.json`, codec })
  void warmVersionCache(store)
  // The ledger reports the first failure of a run, once. Without it a ledger
  // that cannot be written (read-only $DSH_HOME, ENOSPC) simply stops counting
  // with nothing anywhere to explain why — the failure mode this whole
  // soft-fail design otherwise hides.
  const stats = new UsageStats({
    onFlushError: (error) => {
      ctx.logger.warn(
        `[dsh-agy] usage ledger could not be written (${stats.path}): `
        + `${error instanceof Error ? error.message : String(error)} — counts are buffered and will retry`,
      )
    },
  })
  const modelVisibility = new ModelVisibility()
  const thinkingBudget = new ThinkingBudgetStore()
  const sessions = new AgySessionManager({
    store,
    recordUsage: (record) => { stats.record(record) },
  })
  // Optional background health probe (DSH_AGY_HEALTH_INTERVAL_MS), off by default.
  const healthIntervalMs = Number(process.env.DSH_AGY_HEALTH_INTERVAL_MS ?? 0)
  if (Number.isFinite(healthIntervalMs) && healthIntervalMs > 0) {
    sessions.startHealthProbe(healthIntervalMs)
  }
  const adapter = new AgyAdapter({
    getSession: (model, conversationKey) => sessions.getSession(model, undefined, conversationKey),
    reportFailure: (kind, session, info) => sessions.reportFailure(kind, session, info),
    markSuccess: (session) => sessions.markSuccess(session),
    resolveAttachments: () => ctx.get('attachments') as AgyAttachmentStore | undefined,
    noteRequestStarted: (account) => sessions.noteRequestStarted(account),
    noteRequestSettled: (account) => sessions.noteRequestSettled(account),
    modelVisibility,
    thinkingBudgetFor: (level) => thinkingBudget.budgetFor(level),
    recordUsage: (record) => { stats.record({ ...record, source: 'chat' }) },
  })
  // Persist the ledger on normal termination. `exit` covers both a graceful
  // shutdown and the CLI's explicit `process.exit` calls.
  //
  // Deliberately NO signal handlers: installing a SIGINT/SIGTERM listener
  // replaces Node's default terminate behavior, so it must flush and then
  // re-raise or Ctrl-C stops working — a real bug for the sake of at most one
  // throttle window (5s) of counts on an interrupted process. The timer in
  // UsageStats already bounds that loss, and statistics are diagnostics.
  process.once('exit', () => { stats.flushSync() })
  return { store, sessions, adapter, stats, modelVisibility, thinkingBudget }
}

export { AGY_PROVIDER }
