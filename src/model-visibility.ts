/**
 * Model visibility: a per-provider blacklist of model ids hidden from the DSH
 * model selector.
 *
 * Mechanism: DSH's selector reads `session.modelCatalog`, which calls
 * `ctx.llm.listModels(provider)` -> `AgyAdapter.listModels()`. Filtering inside
 * the adapter is therefore sufficient to hide a model from the picker without
 * touching DSH — no host patch, no new RPC.
 *
 * Two deliberate choices:
 *
 * - Blacklist, not whitelist. Only explicitly-disabled models are hidden, so a
 *   model the server adds later still shows up. A whitelist would silently hide
 *   every new model until the user re-enabled it.
 * - Persisted to agy's own file rather than a `ctx.settings` namespace. The
 *   settings service requires a `@deepseek-ai/schemastery` schema, and the
 *   standalone CLI must not import any `@deepseek-ai/*` package at runtime
 *   (AGENTS.md invariant). agy already owns plain JSON state with the same
 *   atomic-write pattern (`agy-accounts.json`), so this stays consistent and
 *   lets the CLI read the same blacklist.
 *
 * Only `true` counts as disabled; an id maps to `true` or is absent. Enabling
 * deletes the key, so the file holds just the hidden set and cannot grow with
 * every toggle.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from './store/keyring.ts'

export const MODELS_VERSION = 1

/** `provider -> modelId -> true`. */
export type DisabledModelMap = Record<string, Record<string, true>>

export interface ModelVisibilityDocument {
  version: number
  disabled: DisabledModelMap
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

/** Keep only well-formed `provider -> { modelId: true }` entries (tolerates hand edits). */
export function sanitizeDisabledModels(raw: unknown): DisabledModelMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: DisabledModelMap = {}
  for (const [provider, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const perProvider: Record<string, true> = {}
    for (const [modelId, flag] of Object.entries(value as Record<string, unknown>)) {
      if (flag === true) perProvider[modelId] = true
    }
    if (Object.keys(perProvider).length > 0) out[provider] = perProvider
  }
  return out
}

export function parseModelVisibility(text: string): ModelVisibilityDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { version: MODELS_VERSION, disabled: {} }
  }
  const disabled = typeof raw === 'object' && raw !== null
    ? sanitizeDisabledModels((raw as Record<string, unknown>).disabled)
    : {}
  return { version: MODELS_VERSION, disabled }
}

export interface ModelVisibilityOptions {
  /** Defaults to `$DSH_HOME/agy-models.json`. */
  file?: string
}

/**
 * In-memory authoritative copy of the blacklist, backed by a JSON file.
 *
 * The adapter calls `disabledFor()` on every `listModels()`, so that read is a
 * pure in-memory lookup: a toggle takes effect on the next catalog refresh
 * without rebuilding the adapter or restarting the host. Writes go through the
 * file immediately (toggles are rare, user-initiated).
 *
 * `disabledFor()` also revalidates against the file's mtime and reloads when it
 * moved. Two instances of this class routinely coexist in ONE process — the
 * main plugin entry and the web entry each build their own runtime — and a
 * toggle is written by the web instance while the model selector reads the main
 * instance. Without the mtime check the selector would keep serving its stale
 * in-memory copy, so switching a model off appeared to do nothing until the
 * host restarted (the `llm/adapters-updated` notification fires, the picker
 * refreshes, and the model is still listed). The same check is what lets a CLI
 * toggle be seen by a running server.
 */
export class ModelVisibility {
  private readonly file: string
  private disabled: DisabledModelMap
  /** Reusable frozen empty set, so the common "nothing disabled" read allocates nothing. */
  private readonly sets = new Map<string, ReadonlySet<string>>()
  /** mtime of the file as last read, or null when it was absent (or unreadable). */
  private loadedMtimeMs: number | null

  constructor(options: ModelVisibilityOptions = {}) {
    this.file = options.file ?? join(resolveDshHome(), 'agy-models.json')
    const initial = this.readWithMtime()
    this.disabled = initial.disabled
    this.loadedMtimeMs = initial.mtimeMs
  }

  /** Path of the backing file. */
  get path(): string {
    return this.file
  }

  /** mtime of the backing file, or null when it does not exist / cannot be statted. */
  private statMtime(): number | null {
    try {
      return statSync(this.file).mtimeMs
    } catch {
      return null
    }
  }

  private read(): DisabledModelMap {
    try {
      return parseModelVisibility(readFileSync(this.file, 'utf8')).disabled
    } catch {
      // A missing or unreadable file means "nothing disabled".
      return {}
    }
  }

  /**
   * Read the map together with the mtime the read is valid for.
   *
   * The stat is taken BEFORE the read on purpose. Stat-after-read records the
   * mtime of a write that landed mid-read while holding the older content, so
   * the next `reloadIfChanged()` sees an equal mtime and serves stale data
   * forever. Stat-before-read can only be too old, which costs one redundant
   * re-read and is self-correcting.
   */
  private readWithMtime(): { disabled: DisabledModelMap, mtimeMs: number | null } {
    const mtimeMs = this.statMtime()
    return { disabled: this.read(), mtimeMs }
  }

  private write(next: DisabledModelMap): void {
    const doc: ModelVisibilityDocument = { version: MODELS_VERSION, disabled: next }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  /**
   * Disabled model ids for one provider. Cheap enough for every catalog refresh:
   * one `stat` plus an in-memory map lookup, and the stat is what keeps two
   * same-process instances (and a CLI writer) in agreement.
   */
  disabledFor(provider: string): ReadonlySet<string> {
    this.reloadIfChanged()
    const cacheKey = provider
    const cached = this.sets.get(cacheKey)
    if (cached !== undefined) return cached
    const perProvider = this.disabled[provider]
    if (perProvider === undefined) return EMPTY_SET
    const ids = Object.keys(perProvider)
    if (ids.length === 0) return EMPTY_SET
    const set: ReadonlySet<string> = new Set(ids)
    this.sets.set(cacheKey, set)
    return set
  }

  /** Whether one model is currently hidden. Also revalidates, for the same reason. */
  isDisabled(provider: string, modelId: string): boolean {
    this.reloadIfChanged()
    return this.disabled[provider]?.[modelId] === true
  }

  /** The raw map, for the settings UI. */
  all(): DisabledModelMap {
    const out: DisabledModelMap = {}
    for (const [provider, models] of Object.entries(this.disabled)) out[provider] = { ...models }
    return out
  }

  /**
   * Hide or show one model. Persists immediately.
   *
   * The edit is applied to a freshly re-read map, not to this instance's copy:
   * with two instances in one process (main plugin + web entry) and a CLI in
   * another, editing the stale copy would silently drop whatever the other
   * writer had toggled since this instance last read. Toggles are rare and
   * user-initiated, so a read-modify-write costs nothing here — unlike the
   * ledger, this is not a hot path.
   *
   * Not locked: a simultaneous toggle from two processes can still lose one of
   * the two updates. The write itself is atomic (tmp + rename), so the file is
   * never corrupt — losing one toggle under a genuine race is an acceptable
   * trade for not introducing a lock file into a settings toggle.
   */
  setDisabled(provider: string, modelId: string, disabled: boolean): void {
    if (modelId === '') throw new Error('setDisabled: modelId must not be empty')
    this.reload()
    const next: DisabledModelMap = {}
    for (const [key, models] of Object.entries(this.disabled)) next[key] = { ...models }
    const perProvider = { ...(next[provider] ?? {}) }
    if (disabled) perProvider[modelId] = true
    else delete perProvider[modelId]
    if (Object.keys(perProvider).length === 0) delete next[provider]
    else next[provider] = perProvider
    this.write(next)
    this.disabled = next
    this.loadedMtimeMs = this.statMtime()
    // Drop the memoized set for this provider so the next read reflects the write.
    this.sets.delete(provider)
  }

  /** Re-read the file (multi-process: another writer may have toggled a model). */
  reload(): void {
    const fresh = this.readWithMtime()
    this.disabled = fresh.disabled
    this.loadedMtimeMs = fresh.mtimeMs
    this.sets.clear()
  }

  /**
   * Reload only when the file moved since the last read.
   *
   * Deliberately silent on a stat failure: a transient filesystem error must
   * not be treated as "the file changed", or every catalog refresh would pay a
   * read. A genuinely deleted file changes the mtime to null, which differs
   * from a numeric mtime and therefore does reload.
   */
  private reloadIfChanged(): void {
    if (this.statMtime() === this.loadedMtimeMs) return
    this.reload()
  }
}
