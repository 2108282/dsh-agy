/**
 * Re-measure that `src/` still compiles against EVERY supported dsh-llm line.
 *
 * Why this exists: the plugin claims two release lines in its peer range
 * (`^0.1.5-rc.1 || ^0.2.0-rc.1`), and only ONE of them can be installed in
 * `node_modules` at a time. A claim like that rots silently — when 0.2.0 moved
 * the tool result from a `tool-result` content block to a `tool`-role message,
 * `pnpm run typecheck` stayed green purely because the checkout still held
 * 0.1.5.
 *
 * `tests/dsh-view.test.ts` pins the RUNTIME half of the contract (both message
 * shapes are projected on every test run). This script pins the TYPE half: for
 * one version per claimed line it installs that exact `@deepseek-ai/dsh-llm`
 * into a scratch project and typechecks this repo's `src/` against its
 * published declarations.
 *
 * Exit codes: 0 = every checked line compiles, 1 = a line fails to compile,
 * 2 = could not measure (registry, install, or an unsupported range shape).
 * Network-requiring and therefore not part of CI, like the other `scripts/`
 * tools.
 *
 *   pnpm run verify:dsh-llm-compat
 *   pnpm run verify:dsh-llm-compat -- --versions 0.1.5-rc.2,0.2.0-rc.1
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compareVersions, newestPerLine, satisfiesCaretRange } from './dsh-llm-range.mts'

interface RegistryDoc {
  versions: Record<string, { peerDependencies?: Record<string, string> }>
}

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh-llm'

function installedVersion(): string | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/@deepseek-ai/dsh-llm/package.json'), 'utf8'),
    ) as { version?: string }
    return manifest.version
  } catch {
    return undefined
  }
}

/** Typecheck one installed dsh-llm copy against this repo's `src/`, reporting its output. */
function typecheckAgainst(scratch: string, version: string): void {
  const packageDir = join(scratch, 'node_modules/@deepseek-ai/dsh-llm')
  const tsconfigPath = join(scratch, 'tsconfig.json')
  writeFileSync(tsconfigPath, JSON.stringify({
    extends: join(ROOT, 'tsconfig.json'),
    compilerOptions: {
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      // Absolute typeRoots: the scratch tsconfig lives outside the repo, so the
      // default upward `@types` walk would not find this repo's node_modules.
      typeRoots: [join(ROOT, 'node_modules/@types')],
      baseUrl: ROOT,
      paths: {
        '@deepseek-ai/dsh-llm': [packageDir],
        '@deepseek-ai/dsh-llm/*': [join(packageDir, 'lib/types/*')],
        // Pinned to the scratch copy so dsh-llm's own `declare module` block
        // augments the SAME cordis this repo's `src/` imports. Mapping only
        // dsh-llm left `Context.llm` unresolvable from inside the package and
        // reported two phantom errors.
        '@deepseek-ai/cordis': [join(scratch, 'node_modules/@deepseek-ai/cordis')],
      },
    },
    include: [join(ROOT, 'src')],
    exclude: [join(ROOT, 'src/client')],
  }, null, 2))

  // Via `process.execPath` + the package's bin script: `node_modules/.bin/tsc`
  // is a POSIX shell shim that `execFileSync` cannot spawn on Windows.
  execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', tsconfigPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  void version
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const at = args.indexOf('--versions')
  const explicit = at >= 0 ? (args[at + 1] ?? '').split(',').map((v) => v.trim()).filter(Boolean) : []

  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    peerDependencies?: Record<string, string>
  }
  const range = manifest.peerDependencies?.['@deepseek-ai/dsh-llm']
  if (range === undefined) {
    console.error('package.json declares no @deepseek-ai/dsh-llm peer range')
    return 2
  }

  const current = installedVersion()
  if (current !== undefined && !satisfiesCaretRange(range, current)) {
    // The checkout itself would be unusable, so this is a broken install rather
    // than a plugin defect; say so instead of measuring against it.
    console.error(`the installed @deepseek-ai/dsh-llm@${current} is outside the declared range ${range}`)
    return 2
  }

  let registry: RegistryDoc
  try {
    const response = await fetch(REGISTRY_URL)
    if (!response.ok) throw new Error(`registry answered ${response.status}`)
    registry = await response.json() as RegistryDoc
  } catch (error) {
    console.error(`could not read the registry: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  let candidates: string[]
  try {
    candidates = explicit.length > 0
      ? explicit
      : [...new Set([
        ...(current === undefined ? [] : [current]),
        ...newestPerLine(range, Object.keys(registry.versions)),
      ])].sort(compareVersions)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  console.log(`dsh-llm peer range: ${range}`)
  console.log(`checking: ${candidates.join(', ')}${current === undefined ? '' : ` (installed: ${current})`}`)

  let failed = 0
  for (const version of candidates) {
    const scratch = mkdtempSync(join(tmpdir(), 'agy-dsh-llm-compat-'))
    try {
      // The cordis peer is read from the registry manifest rather than guessed:
      // 0.1.5 wants ~4.0.2 and 0.2.0 wants ~4.0.4, and installing the wrong one
      // makes the augmentation land nowhere.
      const cordis = registry.versions[version]?.peerDependencies?.['@deepseek-ai/cordis'] ?? '*'
      writeFileSync(join(scratch, 'package.json'), JSON.stringify({
        name: 'agy-dsh-llm-compat',
        private: true,
        version: '0.0.0',
        type: 'module',
        dependencies: { '@deepseek-ai/dsh-llm': version, '@deepseek-ai/cordis': cordis },
      }, null, 2))

      execFileSync('pnpm', ['install', '--ignore-scripts', '--reporter=silent'], {
        cwd: scratch,
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      try {
        typecheckAgainst(scratch, version)
        console.log(`  ok    ${version}`)
      } catch (error) {
        failed++
        const failure = error as { stdout?: Buffer; stderr?: Buffer }
        console.error(`  FAIL  ${version}`)
        console.error(String(failure.stdout ?? '').trim() || String(failure.stderr ?? '').trim())
      }
    } catch (error) {
      failed++
      console.error(`  FAIL  ${version} (could not install: ${error instanceof Error ? error.message : String(error)})`)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${candidates.length} dsh-llm line(s) do not compile.`)
    return 1
  }
  console.log(`\nall ${candidates.length} checked dsh-llm line(s) compile.`)
  return 0
}

process.exit(await main())
