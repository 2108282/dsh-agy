// Version-freshness gate: the compiled fallback must not trail the live
// Antigravity release feed by more than one minor.
//
// Why this exists as a SCHEDULED check rather than a PR check: agy ships without
// a PR here, so drift appears between releases of THIS package. A stale client
// version is the most detectable fingerprint anomaly (the whole reason
// `version.ts` resolves the version at runtime), and the fallback is what every
// User-Agent uses when the feed is unreachable — offline, firewalled, or before
// the first resolve. Nothing else notices when it rots.
//
// SECOND SOURCE, WARNING ONLY. The same GCP project publishes another updater
// line (the `antigravity-hub` manifest, e.g. 2.15.1 while the IDE feed above says
// 2.0.0). Two product lines, one shared `antigravity/<version>` User-Agent slot,
// and another implementation reports the hub line as the client version — with an
// explicit note that Cloud Code rejects newer models for clients below 2.9.0.
// That claim is unproven here and a hard failure would block releases on it, so a
// divergence is printed loudly and does NOT fail the gate. Crossing it with the
// other line is still the only way anyone would ever notice the two disagreeing.
//
// Usage:
//   pnpm run verify:version-freshness                     # against the real feeds
//   pnpm run verify:version-freshness --fallback 1.19.0    # red-capability check
//   pnpm run verify:version-freshness --hub 3.0.0          # warning-path check
//
// Exit codes: 0 fresh, 1 drift, 2 unmeasurable (feeds unreachable). The workflow
// treats 1 and 2 alike — both need a human — but says which one it was.

import { readFileSync } from 'node:fs'
import { AGY_VERSION_FALLBACK } from '../src/oauth/constants.ts'
import { resolveObservedAgyVersion } from '../src/runtime/version.ts'

/**
 * The `antigravity-hub` updater manifest — a DIFFERENT product line from the IDE
 * feed `version.ts` reads, published by the same GCP project. Used only as a
 * cross-check (see the header).
 */
const HUB_MANIFEST_URL =
  'https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml'

interface FingerprintDataShape {
  versionPool?: unknown
}

const args = process.argv.slice(2)

function flagValue(name: string): string | undefined {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

const declaredFallback = flagValue('--fallback') ?? AGY_VERSION_FALLBACK
const declaredHub = flagValue('--hub')

if (typeof declaredFallback !== 'string' || !/^\d+\.\d+\.\d+$/.test(declaredFallback)) {
  console.error(`--fallback needs a x.y.z version (got ${String(declaredFallback)})`)
  process.exit(1)
}

function parse(version: string): [number, number, number] {
  const parts = version.split('.').map((n) => Number(n))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** Semver distance in minors: 0 for the same minor, negative when behind. */
function minorDistance(candidate: string, reference: string): number {
  const [cMajor, cMinor] = parse(candidate)
  const [rMajor, rMinor] = parse(reference)
  return (cMajor - rMajor) * 100 + (cMinor - rMinor)
}

const pool = JSON.parse(
  readFileSync(new URL('../src/runtime/fingerprint-data.json', import.meta.url), 'utf8'),
) as FingerprintDataShape

const poolVersions = Array.isArray(pool.versionPool)
  ? pool.versionPool.filter((v): v is string => typeof v === 'string')
  : []
if (poolVersions.length === 0) {
  console.error('FAIL fingerprint-data.json has no usable versionPool')
  process.exit(1)
}

let observed: string | undefined
try {
  // The OBSERVED value, not `resolveAntigravityVersion`: that one substitutes the
  // pinned fallback, which is the very value under test here — and when the live
  // version happens to equal the fallback (the healthy case!) the two are
  // indistinguishable, so the gate would report "unmeasurable" on a good day.
  observed = await resolveObservedAgyVersion()
} catch (error) {
  console.error(`UNMEASURABLE version feeds unreachable: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

if (observed === undefined) {
  console.error('UNMEASURABLE both feeds yielded nothing (unreachable, or their payload shape changed)')
  process.exit(2)
}

console.log(`live feed (ide line): ${observed}`)
console.log(`compiled fallback: ${declaredFallback}`)
console.log(`versionPool: ${poolVersions.join(', ')}`)

/** The other updater line, or `undefined` when it could not be read. */
async function readHubVersion(): Promise<string | undefined> {
  if (declaredHub !== undefined) return declaredHub
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(HUB_MANIFEST_URL, { signal: controller.signal })
      if (!response.ok) return undefined
      const match = (await response.text()).match(/^version:\s*(\d+\.\d+\.\d+)\s*$/m)
      return match?.[1]
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return undefined
  }
}

const hub = await readHubVersion()
if (hub === undefined) {
  console.log('hub line: unreadable (cross-check skipped)')
} else {
  console.log(`hub line: ${hub}`)
  // Warning, never a failure: which line the backend validates is unproven, and
  // this gate must not block a release on another implementation's claim.
  if (minorDistance(declaredFallback, hub) < -1) {
    console.warn(
      `\nWARN the hub line reports ${hub} while this client advertises ${declaredFallback}. `
      + 'If that line is the one the backend validates, every User-Agent here is stale — '
      + 'see the UA-version A/B measurement before changing anything.',
    )
  }
}

const problems: string[] = []

const distance = minorDistance(declaredFallback, observed)
if (distance < -1) {
  problems.push(`fallback ${declaredFallback} trails the live feed ${observed} by more than one minor`)
}

// The pool is the offline identity's version source, so its newest entry is held
// to the same tolerance; an old entry is the "stale client" signal again.
const newestPool = poolVersions.reduce((best, v) => (minorDistance(v, best) > 0 ? v : best), poolVersions[0]!)
if (minorDistance(newestPool, observed) < -1) {
  problems.push(`newest versionPool entry ${newestPool} trails the live feed ${observed} by more than one minor`)
}

if (problems.length > 0) {
  console.error(`\nFAIL ${problems.join('; ')}`)
  console.error('Bump AGY_VERSION_FALLBACK (src/oauth/constants.ts) and versionPool '
    + '(src/runtime/fingerprint-data.json) to the live release.')
  process.exit(1)
}

console.log(`\nPASS fallback and pool are within one minor of ${observed}`)
