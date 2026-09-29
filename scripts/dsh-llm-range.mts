/**
 * The slice of semver this package's peer range needs — and nothing more.
 *
 * WHY NOT `semver`. It is not a dependency of this package (it is only a
 * transitive one), so importing it from a `scripts/` tool couples the gate to
 * whatever happens to be hoisted. Adding it as a devDependency to read one
 * string is a poor trade: this range vocabulary is tiny and fixed.
 *
 * WHY FAIL LOUD. The range decides WHICH dsh-llm lines `verify:dsh-llm-compat`
 * measures. A matcher that quietly mis-parses (`^0.1.5-rc.1` read as
 * `>=0.1.5-rc.1 <1.0.0`, say) would make the gate pass while checking the wrong
 * thing — worse than no gate. Every clause shape the parser does not understand
 * therefore throws, and the caller reports "could not measure" instead of
 * "verified".
 *
 * Supported clause vocabulary: `^major.minor.patch` with an optional
 * `-prerelease` suffix, joined by `||`. That is the entire grammar this
 * package's `peerDependencies` uses, and caret-on-`0.x` semantics are the
 * load-bearing part: `^0.1.5-rc.1` means `>=0.1.5-rc.1 <0.2.0`, NOT `<1.0.0`,
 * which is exactly why the 0.2.0 line is a separate clause in the range.
 */

/** One `^major.minor.patch[-prerelease]` clause. */
export interface CaretClause {
  major: number
  minor: number
  patch: number
  /** Dot-separated prerelease identifiers, or `''` for a release version. */
  prerelease: string
}

const CLAUSE = /^\^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** Parse a `||`-joined caret range, throwing on any clause this module cannot evaluate. */
export function parseCaretRange(range: string): CaretClause[] {
  const clauses = range.split('||').map((part) => part.trim()).filter((part) => part !== '')
  if (clauses.length === 0) throw new Error(`empty version range: ${JSON.stringify(range)}`)
  return clauses.map((clause) => {
    const match = CLAUSE.exec(clause)
    if (!match) {
      throw new Error(
        `unsupported version range clause ${JSON.stringify(clause)}: this module understands `
        + "'^major.minor.patch[-prerelease]' clauses joined by '||'",
      )
    }
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] ?? '',
    }
  })
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string
}

function parseVersion(version: string): ParsedVersion {
  const match = VERSION.exec(version.trim())
  if (!match) throw new Error(`unsupported version ${JSON.stringify(version)}`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? '',
  }
}

/** Semver prerelease precedence: numeric identifiers rank below alphanumeric ones. */
function comparePrerelease(left: string, right: string): number {
  // A release version outranks any prerelease of the same numeric triple.
  if (left === right) return 0
  if (left === '') return 1
  if (right === '') return -1
  const a = left.split('.')
  const b = right.split('.')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff
    } else if (nx !== ny) {
      return nx ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** Standard semver precedence for the version shapes this module accepts. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch'] as const) {
    const diff = a[key] - b[key]
    if (diff !== 0) return diff
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/** The exclusive upper bound a caret clause implies. */
function caretUpperBound(clause: CaretClause): string {
  // Caret on 0.x is the minor that is fixed, which is why `^0.1.5-rc.1` does not
  // admit 0.2.0: matching that release line needs its own clause.
  if (clause.major > 0) return `${clause.major + 1}.0.0`
  if (clause.minor > 0) return `0.${clause.minor + 1}.0`
  return `0.0.${clause.patch + 1}`
}

function upperBoundOf(range: string, version: string): CaretClause | undefined {
  return parseCaretRange(range).find((clause) => {
    const base = `${clause.major}.${clause.minor}.${clause.patch}${clause.prerelease === '' ? '' : `-${clause.prerelease}`}`
    if (compareVersions(version, base) < 0) return false
    return compareVersions(version, caretUpperBound(clause)) < 0
  })
}

/** Whether `version` is admitted by the `||`-joined caret `range`. */
export function satisfiesCaretRange(range: string, version: string): boolean {
  return upperBoundOf(range, version) !== undefined
}

/** The distinct `major.minor` release lines a range names, in declaration order. */
export function rangeLines(range: string): string[] {
  const lines: string[] = []
  for (const clause of parseCaretRange(range)) {
    const line = `${clause.major}.${clause.minor}`
    if (!lines.includes(line)) lines.push(line)
  }
  return lines
}

/**
 * One version per release line the range names: the highest published version
 * in that line.
 *
 * Per LINE rather than "lowest and highest overall", because the point is to
 * measure every vocabulary the range admits: picking extremes of the whole set
 * would check the same 0.2.x line twice the day a 0.2.1 ships and silently stop
 * measuring 0.1.x.
 *
 * @throws when a line has no published version, rather than skipping it: a
 *   claimed line nothing satisfies is a broken range, not a passing check.
 */
export function newestPerLine(range: string, published: readonly string[]): string[] {
  return rangeLines(range).map((line) => {
    const candidates = published.filter((version) => {
      const parsed = VERSION.exec(version.trim())
      if (!parsed) return false
      return `${parsed[1]}.${parsed[2]}` === line && satisfiesCaretRange(range, version)
    })
    if (candidates.length === 0) {
      throw new Error(`no published version satisfies the ${line} clause of ${JSON.stringify(range)}`)
    }
    return candidates.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best))
  })
}
