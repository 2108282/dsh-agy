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
// Usage:
//   pnpm run verify:version-freshness                 # against the real feeds
//   pnpm run verify:version-freshness --fallback 1.19.0   # red-capability check
//
// Exit codes: 0 fresh, 1 drift, 2 unmeasurable (feeds unreachable). The workflow
// treats 1 and 2 alike — both need a human — but says which one it was.

import { readFileSync } from 'node:fs'
import { AGY_VERSION_FALLBACK } from '../src/oauth/constants.ts'
import { resolveObservedAgyVersion } from '../src/runtime/version.ts'

interface FingerprintDataShape {
  versionPool?: unknown
}

const args = process.argv.slice(2)
const fallbackFlagIndex = args.indexOf('--fallback')
const declaredFallback = fallbackFlagIndex === -1
  ? AGY_VERSION_FALLBACK
  : args[fallbackFlagIndex + 1]

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

console.log(`live feed: ${observed}`)
console.log(`compiled fallback: ${declaredFallback}`)
console.log(`versionPool: ${poolVersions.join(', ')}`)

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
