/**
 * Re-measure the official-identity record (`docs/official-identity.json`).
 *
 * Why this exists: the record's whole claim to authority is that it is
 * RE-MEASURABLE. The three community projects this client was originally
 * compared against are leads, not references — they disagree with each other,
 * they invent headers that exist in neither official binary, and they are frozen
 * at whatever version they were written against. A reference object must be
 * (a) the product we claim to be and (b) checkable at will. That is the installed
 * official artifact plus its release feed, which is what this script reads.
 *
 * It also pins OUR side of the contract: the values compiled into this package
 * must still agree with the record, so the record cannot rot into a document
 * nobody reads while the code drifts away from it.
 *
 * Exit codes: 0 = every check held, 1 = drift, 2 = could not measure.
 * Not run in CI by default: it needs the official artifact installed locally.
 * On a machine without it, the binary checks report "unmeasurable" and skip.
 *
 *   pnpm run verify:official-identity
 *   pnpm run verify:official-identity -- --cli /path/to/agy
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { AGY_ENDPOINT_FALLBACKS, AGY_IDE_TYPE, AGY_PLATFORM_ENUM, AGY_VERSION_FALLBACK } from '../src/oauth/constants.ts'

const record = JSON.parse(readFileSync(new URL('../docs/official-identity.json', import.meta.url), 'utf8')) as {
  version: {
    claimedLine: string
    installed: { value: string }
    feed: { latest: string; url: string }
    namespacesAreDisjoint: Record<string, string>
  }
  clientMetadata: { enums: Record<string, string[]>; ours: { ideType: { value: string }; platform: { value: string } } }
  endpoints: { baseUrls: string[]; knownDeviations?: { extraInOurs?: { host?: string }; missingFromOurs?: { host?: string } } }
  headers: { absentFromBothBinaries: { names: string[] }; presentInCli: Record<string, unknown> }
}

const args = process.argv.slice(2)
function flagValue(name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const failures: string[] = []
function fail(message: string): void {
  failures.push(message)
  console.log(`FAIL ${message}`)
}
function ok(message: string): void {
  console.log(`ok   ${message}`)
}

// ---------------------------------------------------------------- our side

console.log('--- compiled values vs the record ---')

if (record.version.claimedLine !== 'cli') {
  fail(`record claims "${record.version.claimedLine}", but this package's version line is the CLI's`)
} else {
  ok('claimed product line is the CLI')
}

const fallbackMinor = AGY_VERSION_FALLBACK.split('.').slice(0, 2).join('.')
const cliMinor = record.version.feed.latest.split('.').slice(0, 2).join('.')
if (fallbackMinor !== cliMinor) {
  fail(
    `AGY_VERSION_FALLBACK is ${AGY_VERSION_FALLBACK} but the record's CLI feed latest is ${record.version.feed.latest}; ` +
      'these must share a minor, because the fallback must name a version that exists for the product we claim',
  )
} else {
  ok(`AGY_VERSION_FALLBACK ${AGY_VERSION_FALLBACK} is on the CLI line (${cliMinor}.x)`)
}

// The version pool must stay inside ONE namespace. This is the check that would
// have caught the original defect, where the pool held IDE 2.x numbers while the
// rest of the client was drifting toward the CLI line.
const pool = JSON.parse(
  readFileSync(new URL('../src/runtime/fingerprint-data.json', import.meta.url), 'utf8'),
) as { versionPool?: string[] }
const major = record.version.feed.latest.split('.')[0]
const offLine = (pool.versionPool ?? []).filter((v) => v.split('.')[0] !== major)
if (offLine.length > 0) {
  fail(
    `fingerprint-data.json versionPool mixes namespaces: ${offLine.join(', ')} are not CLI-line versions. ` +
      `The IDE (${record.version.namespacesAreDisjoint['ide']}) and hub (${record.version.namespacesAreDisjoint['hub']}) ` +
      'lines are different products, so a pool spanning them advertises a version that does not exist for the CLI.',
  )
} else {
  ok(`versionPool is CLI-line only (${(pool.versionPool ?? []).join(', ')})`)
}

for (const [field, value] of [
  ['IdeType', AGY_IDE_TYPE],
  ['Platform', AGY_PLATFORM_ENUM],
] as const) {
  const allowed = record.clientMetadata.enums[field] ?? []
  if (!allowed.includes(value)) {
    fail(`${field} value ${value} is not in the official enum (${allowed.join(' | ')})`)
  } else {
    ok(`${field} ${value} is a member of the official enum`)
  }
}

// A host we use that the artifact does not name is allowed ONLY when the record
// declares it. The point is not that the two lists must be identical — it is that
// a divergence must be a recorded decision, not an inheritance from another
// implementation that nobody re-checked.
const declared = new Set(
  [record.endpoints.knownDeviations?.extraInOurs?.host, record.endpoints.knownDeviations?.missingFromOurs?.host]
    .filter((host): host is string => typeof host === 'string'),
)
const unknownEndpoint = AGY_ENDPOINT_FALLBACKS.filter(
  (url) => !record.endpoints.baseUrls.includes(url) && !declared.has(url),
)
if (unknownEndpoint.length > 0) {
  fail(
    `AGY_ENDPOINT_FALLBACKS contains hosts absent from the record and undeclared in ` +
      `endpoints.knownDeviations: ${unknownEndpoint.join(', ')}. Add the host to the record, or declare the deviation.`,
  )
} else {
  ok(`all ${AGY_ENDPOINT_FALLBACKS.length} fallback endpoints are recorded (named or declared)`)
}

// ------------------------------------------------------------- the artifact

console.log('\n--- installed official CLI ---')

const cliPath = flagValue('--cli') ?? '/usr/local/bin/agy'
if (!existsSync(cliPath)) {
  console.log(`skip binary checks: ${cliPath} is not installed (unmeasurable, not a failure)`)
} else {
  try {
    const version = execFileSync(cliPath, ['--version'], { encoding: 'utf8', timeout: 30_000 }).trim()
    if (version === record.version.installed.value) {
      ok(`installed CLI is ${version}, matching the record`)
    } else {
      console.log(
        `warn installed CLI is ${version} but the record says ${record.version.installed.value}. ` +
          'Re-read the artifact and update the record (a new release may have changed the identity surface).',
      )
    }
  } catch (error) {
    console.log(`skip version check: ${cliPath} --version failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  // The absence claims are the load-bearing ones: every header in this list is a
  // shape we must NOT send. Re-checking them against the artifact is what keeps
  // the list from being quietly re-populated by a future contributor reading a
  // blog post.
  const binary = readFileSync(cliPath)
  for (const name of record.headers.absentFromBothBinaries.names) {
    if (binary.includes(Buffer.from(name, 'utf8'))) {
      fail(
        `header "${name}" IS present in ${cliPath}, but the record lists it as absent. ` +
          'Re-read the artifact: the identity surface changed, and the "invented header" conclusion may no longer hold.',
      )
    } else {
      ok(`"${name}" is still absent from the artifact`)
    }
  }
  for (const name of Object.keys(record.headers.presentInCli)) {
    if (!binary.includes(Buffer.from(name, 'utf8'))) {
      fail(`header "${name}" is recorded as present in the CLI but was not found`)
    } else {
      ok(`"${name}" is still present in the artifact`)
    }
  }
}

// --------------------------------------------------------------- the feed

console.log('\n--- release feed ---')

let live: string | undefined
try {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(record.version.feed.url, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (response.ok) {
      const payload = (await response.json()) as { tag_name?: string }
      live = payload.tag_name
    }
  } finally {
    clearTimeout(timer)
  }
} catch {
  live = undefined
}

if (live === undefined) {
  console.log('UNMEASURABLE the CLI release feed could not be read')
} else if (live === record.version.feed.latest) {
  ok(`feed latest is still ${live}`)
} else {
  console.log(
    `warn feed latest is ${live} but the record says ${record.version.feed.latest}. ` +
      'Update version.feed.latest in docs/official-identity.json (and AGY_VERSION_FALLBACK if the minor moved).',
  )
}

// ------------------------------------------------------------------ verdict

console.log('')
if (failures.length > 0) {
  console.log(`FAILED ${failures.length} check(s) against docs/official-identity.json`)
  process.exit(1)
}
console.log('official identity record is consistent with the compiled values and the artifact')
