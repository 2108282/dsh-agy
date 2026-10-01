/**
 * The `agy` data folder: every data file this plugin creates lives under
 * `$DSH_HOME/agy/` instead of scattered across the DSH home.
 *
 * Why one folder: agy owned five JSON files sitting directly in `$DSH_HOME`
 * (accounts, stats, models, thinking, fingerprint override) next to the host's
 * own files. A folder is the boundary a user can see, back up, or delete whole.
 *
 * Migration is a ONE-SHOT ATOMIC RENAME, not a read-merge with lazy fallback:
 *
 * - `agy/` sits on the same filesystem as `$DSH_HOME`, so `rename` is atomic
 *   and preserves the 0600 mode.
 * - A read-merge would need every store to carry two paths, two file locks,
 *   and per-store merge logic — and the merge itself can still lose updates
 *   (accounts mutate, stats counts).
 * - A lazy fallback reads the old path forever, which defeats the point: the
 *   old file would never leave the home directory.
 *
 * Version-skew window contract: after a migration an OLD build recreates its
 * legacy file, and its writes are invisible to the new layout — the both-files
 * warning in `migrateToAgyDir` is the detector for exactly that (it fires when
 * a later process finds both files present). Local SOP re-syncs all profiles at
 * once, so the window is one app restart; npm users restart every dsh surface
 * per the release note. Accounts logged in by an old CLI during skew need one
 * re-login — enumerable, one-time, accepted in exchange for zero merge code.
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from './keyring.ts'

/** The directory under `$DSH_HOME` holding every agy data file. */
export function agyDataDir(dshHome: string = resolveDshHome()): string {
  return join(dshHome, 'agy')
}

/** A data file inside the agy directory. */
export function agyDataFile(name: string, dshHome: string = resolveDshHome()): string {
  return join(agyDataDir(dshHome), name)
}

export interface AgyMigrationResult {
  /** The path callers must use from now on. */
  file: string
  /**
   * True when the legacy file was moved this call. The caller MAY log it; most
   * callers should stay silent — a migration is not news after it happened.
   */
  migrated: boolean
  /** Set when the old build's file still exists next to the new one (skew). */
  skew: boolean
}

/**
 * One-time legacy -> `agy/` migration for one data file.
 *
 * 1. New file already present: warn-once (via `skew`) when the legacy file is
 *    ALSO present — an old-version process is still writing the old path.
 *    Return the new path regardless: the new layout wins once it exists.
 * 2. No legacy file: fresh install (or already migrated), nothing to do.
 * 3. Otherwise create the directory and rename. On ANY failure (`agy/` cannot
 *    be created, EXDEV, permissions, a locked target on Windows) fall back to
 *    the LEGACY path for this process: for accounts, the old layout with the
 *    real pool beats a new empty one, and `skew` surfaces the reason instead
 *    of hiding it.
 *
 * The caller decides what `skew` becomes; `plugin-common.ts` and the CLI log
 * it once per process at most.
 */
export function migrateToAgyDir(name: string, dshHome: string = resolveDshHome()): AgyMigrationResult {
  const legacy = join(dshHome, name)
  const file = agyDataFile(name, dshHome)
  if (existsSync(file)) {
    return { file, migrated: false, skew: existsSync(legacy) }
  }
  if (!existsSync(legacy)) {
    return { file, migrated: false, skew: false }
  }
  try {
    mkdirSync(agyDataDir(dshHome), { recursive: true })
    renameSync(legacy, file)
    return { file, migrated: true, skew: false }
  } catch {
    return { file: legacy, migrated: false, skew: true }
  }
}
