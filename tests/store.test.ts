import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENT_STORAGE_VERSION,
  InMemoryAccountStore,
  JsonAccountStore,
  deduplicateAccountsByEmail,
  migrateStorage,
  noopFileLock,
  resolveActiveAccount,
} from '../src/store/accounts.ts'
import { createAesGcmCodec, deriveKey, loadMasterKey, persistMasterKey, readCredentialsDocument, type SecretCodec } from '../src/store/keyring.ts'
import type { ManagedAccount } from '../src/types.ts'

const codec: SecretCodec = createAesGcmCodec(deriveKey('test-master-key-000000000000000000000000'))

function account(email: string, refresh = `rt-${email}|proj`): ManagedAccount {
  return {
    email,
    refresh,
    addedAt: Date.now(),
    lastUsed: Date.now(),
  }
}

describe('migrations', () => {
  it('migrates V1 to current version preserving fields', () => {
    const v1 = {
      version: 1 as const,
      activeIndex: 0,
      accounts: [
        {
          email: 'a@b.c',
          refreshToken: 'rt1',
          projectId: 'p1',
          addedAt: 1,
          lastUsed: 2,
          isRateLimited: true,
          rateLimitResetTime: 12345,
        },
      ],
    }
    const migrated = migrateStorage(v1)
    expect(migrated.version).toBe(CURRENT_STORAGE_VERSION)
    expect(migrated.accounts[0]?.email).toBe('a@b.c')
    expect(migrated.accounts[0]?.refresh).toBe('rt1|p1|')
    expect(migrated.accounts[0]?.rateLimitResetTimes).toEqual({ default: 12345 })
  })

  it('rejects unknown versions loudly', () => {
    expect(() => migrateStorage({ version: 99 } as never)).toThrow(/unsupported storage version/)
  })
})

describe('encryption round trip', () => {
  it('encrypts refresh on save and decrypts on load', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'agy-accounts.json')
    const store = new JsonAccountStore({ file, codec, lock: noopFileLock })

    await store.mutate((s) => {
      s.accounts.push(account('a@b.c', 'secret-refresh'))
    })

    const raw = readFileSync(file, 'utf8')
    expect(raw).not.toContain('secret-refresh')
    expect(raw).toContain('enc:v1:')

    const loaded = await store.load()
    expect(loaded.accounts[0]?.refresh).toBe('secret-refresh')

    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips through mutate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'agy-accounts.json')
    const store = new JsonAccountStore({ file, codec, lock: noopFileLock })

    const count = await store.mutate((s) => {
      s.accounts.push(account('x@y.z'))
      return s.accounts.length
    })
    expect(count).toBe(1)
    const reloaded = await store.load()
    expect(reloaded.accounts[0]?.email).toBe('x@y.z')
    rmSync(dir, { recursive: true, force: true })
  })

  // POSIX owner-only enforcement is skipped on win32 by design (keyring.ts);
  // Windows mode bits never report 0600, so the rejection cannot happen there.
  it.skipIf(process.platform === 'win32')('fails loud when the file mode is not 0600', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'agy-accounts.json')
    writeFileSync(file, '{"version":4,"accounts":[],"activeIndex":0}\n', { mode: 0o644 })
    const store = new JsonAccountStore({ file, codec, lock: noopFileLock })
    await expect(store.load()).rejects.toThrow(/readable beyond its owner/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('treats missing file as an empty store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const store = new JsonAccountStore({ file: join(dir, 'nope.json'), codec, lock: noopFileLock })
    const storage = await store.load()
    expect(storage.accounts).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('mutate works when the file does not exist yet (real lockfile path)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'fresh.json')
    const store = new JsonAccountStore({ file, codec }) // real proper-lockfile
    await store.mutate((s) => {
      s.accounts.push(account('first@x'))
    })
    const storage = await store.load()
    expect(storage.accounts[0]?.email).toBe('first@x')
    // file must be owner-only (POSIX only; skipped on win32 by design)
    if (process.platform !== 'win32') {
      const mode = (await import('node:fs')).statSync(file).mode & 0o777
      expect(mode).toBe(0o600)
    }
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('keyring persistMasterKey', () => {
  it('adds the key to a pre-release flat document without touching existing content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, '# a comment\nSOME_KEY: "existing-value"\n', { mode: 0o600 })
    persistMasterKey(dir, 'mast3r')
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('# a comment')
    expect(text).toContain('SOME_KEY: "existing-value"')
    expect(text).toContain('AGY_MASTER_KEY: mast3r')
    expect(loadMasterKey(dir)).toBe('mast3r')
    // refuses to overwrite an existing key
    expect(() => persistMasterKey(dir, 'other')).toThrow(/already exists/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('never rewrites a version stamp it does not implement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'version: 2\nrefs:\n  K: "v"\n', { mode: 0o600 })
    const before = readFileSync(file, 'utf8')
    // Downgrading the stamp would silently corrupt a document this build does
    // not understand, so the write must refuse and leave the file untouched.
    expect(() => persistMasterKey(dir, 'm')).toThrow(/declares version 2/)
    expect(readFileSync(file, 'utf8')).toBe(before)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads but never overwrites a top-level master key left by 0.2.7', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    // 0.2.7 appended the key at the top level, which the provider rejects. The
    // key still decrypts an existing store, so it must remain readable rather
    // than being replaced by a fresh one (which would strand those accounts).
    writeFileSync(file, 'version: 1\nrefs:\n  K: "v"\nAGY_MASTER_KEY: "legacy"\n', { mode: 0o600 })
    expect(loadMasterKey(dir)).toBe('legacy')
    expect(() => persistMasterKey(dir, 'fresh')).toThrow(/already exists/)
    expect(loadMasterKey(dir)).toBe('legacy')
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a refs section in a version-1 document that has only records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'version: 1\nrecords:\n  a/b:\n    kind: grant\n    payload:\n      x: 1\n', { mode: 0o600 })
    persistMasterKey(dir, 'm')
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('records:')
    expect(text).toContain('kind: grant')
    expect(text).toMatch(/^refs:\n {2}AGY_MASTER_KEY: m$/m)
    expect(loadMasterKey(dir)).toBe('m')
    rmSync(dir, { recursive: true, force: true })
  })

  it('populates an empty refs section in place', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'version: 1\nrefs:\n', { mode: 0o600 })
    persistMasterKey(dir, 'm')
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('version: 1')
    expect(loadMasterKey(dir)).toBe('m')
    expect(readCredentialsDocument(file).get('AGY_MASTER_KEY')).toBe('m')
    rmSync(dir, { recursive: true, force: true })
  })

  it('nests the master key under refs in a version-1 document', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'version: 1\nrefs:\n  SOME_KEY: "existing-value"\nrecords:\n  a/b:\n    kind: grant\n    payload:\n      version: 1\n', { mode: 0o600 })
    persistMasterKey(dir, 'm')
    const text = readFileSync(file, 'utf8')
    // The host rejects any top-level key other than version/refs/records, and a
    // rejected document loses every credential in it — so the key must nest.
    expect(text).toMatch(/^refs:\n(?:.*\n)*? {2}AGY_MASTER_KEY: m$/m)
    expect(text).toContain('records:')
    expect(text).toContain('kind: grant')
    expect(loadMasterKey(dir)).toBe('m')
    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves comments and untouched entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, '# top comment\nversion: 1\nrefs:\n  K: "v" # trailing\n  L: plain\n', { mode: 0o600 })
    persistMasterKey(dir, 'm')
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('# top comment')
    expect(text).toContain('# trailing')
    expect(text).toContain('K: "v"')
    expect(text).toContain('L: plain')
    expect(loadMasterKey(dir)).toBe('m')
    rmSync(dir, { recursive: true, force: true })
  })

  it('nests a pre-release flat document under refs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'SOME_KEY: "existing-value"\n', { mode: 0o600 })
    persistMasterKey(dir, 'm')
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('version: 1')
    expect(text).toMatch(/^refs:\n {2}SOME_KEY: "existing-value"/m)
    expect(loadMasterKey(dir)).toBe('m')
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses to rewrite a document it cannot prove it understands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'version: 1\nrefs:\n  K: "v"\nUNKNOWN_TOP: "x"\n', { mode: 0o600 })
    const before = readFileSync(file, 'utf8')
    expect(() => persistMasterKey(dir, 'm')).toThrow(/unknown top-level key/)
    // A refused write must leave the document byte-identical.
    expect(readFileSync(file, 'utf8')).toBe(before)
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates the document when absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    persistMasterKey(dir, 'k1')
    expect(loadMasterKey(dir)).toBe('k1')
    if (process.platform !== 'win32') {
      const mode = (await import('node:fs')).statSync(join(dir, '.credentials.yaml')).mode & 0o777
      expect(mode).toBe(0o600)
    }
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('keyring readCredentialsDocument', () => {
  it('reads refs in a version-1 document with folded multi-line scalars', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    // The host's `yaml` serializer folds a long scalar at whitespace; the
    // reader must fold it back (line break -> space), not treat it as the end.
    const scope = 'openid profile offline_access email'
    const payload = JSON.stringify({ access_token: 'a'.repeat(200), scope })
    const folded = payload.replace(/'/g, "''").replace(/,/g, ',\n    ')
    writeFileSync(
      file,
      `version: 1\nrefs:\n  AGY_MASTER_KEY: "mk"\n  FOLDED_ACCOUNT: '${folded}'\n`,
      { mode: 0o600 },
    )
    const entries = readCredentialsDocument(file)
    expect(entries.get('AGY_MASTER_KEY')).toBe('mk')
    expect(JSON.parse(entries.get('FOLDED_ACCOUNT') ?? '').scope).toBe(scope)
    rmSync(dir, { recursive: true, force: true })
  })

  it('ignores nested keys so a records payload cannot shadow a real reference', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(
      file,
      [
        'version: 1',
        'refs:',
        '  AGY_MASTER_KEY: "real-key"',
        'records:',
        '  client-connection/browser-session:',
        '    kind: grant',
        '    payload:',
        '      version: 1',
        '      AGY_MASTER_KEY: "shadow"',
        '',
      ].join('\n'),
      { mode: 0o600 },
    )
    const entries = readCredentialsDocument(file)
    expect(entries.get('AGY_MASTER_KEY')).toBe('real-key')
    expect(entries.has('records')).toBe(false)
    expect(entries.has('version')).toBe(false)
    expect(loadMasterKey(dir)).toBe('real-key')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads a pre-release flat document', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, 'AGY_MASTER_KEY: "flat-key"\n', { mode: 0o600 })
    expect(readCredentialsDocument(file).get('AGY_MASTER_KEY')).toBe('flat-key')
    expect(loadMasterKey(dir)).toBe('flat-key')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty for an absent or blank document', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    expect(readCredentialsDocument(join(dir, '.credentials.yaml')).size).toBe(0)
    const file = join(dir, '.credentials.yaml')
    writeFileSync(file, '   \n', { mode: 0o600 })
    expect(readCredentialsDocument(file).size).toBe(0)
    // A null section reads as empty, matching the provider.
    writeFileSync(file, 'version: 1\nrefs:\nrecords:\n', { mode: 0o600 })
    expect(readCredentialsDocument(file).size).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('in-memory store', () => {
  it('behaves like the file store for pool logic', async () => {
    const store = new InMemoryAccountStore()
    await store.mutate((s) => {
      s.accounts.push(account('a@b.c'))
      s.accounts.push(account('a@b.c', 'rt-dup')) // duplicate email
    })
    const loaded = await store.load()
    expect(deduplicateAccountsByEmail(loaded.accounts)).toHaveLength(1)
    expect(resolveActiveAccount(loaded)?.account.email).toBe('a@b.c')
  })

  it('materializes missing UUIDs and persists them across loads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'agy-accounts.json')
    // Write raw legacy json without IDs
    writeFileSync(file, JSON.stringify({
      version: CURRENT_STORAGE_VERSION,
      activeIndex: 0,
      accounts: [
        { email: 'legacy@x', refresh: 'rt-1', addedAt: 1, lastUsed: 1 },
      ],
    }, null, 2) + '\n', { mode: 0o600 })

    const store = new JsonAccountStore({ file, codec, lock: noopFileLock })
    const firstLoad = await store.load()
    expect(firstLoad.accounts[0]?.id).toBeDefined()
    const id1 = firstLoad.accounts[0]!.id

    // Second load from fresh store instance must return the EXACT same materialized ID
    const store2 = new JsonAccountStore({ file, codec, lock: noopFileLock })
    const secondLoad = await store2.load()
    expect(secondLoad.accounts[0]?.id).toBe(id1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('deduplicates duplicate IDs in stored JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-'))
    const file = join(dir, 'agy-accounts.json')
    // Write json with identical duplicate IDs
    writeFileSync(file, JSON.stringify({
      version: CURRENT_STORAGE_VERSION,
      activeIndex: 0,
      accounts: [
        { id: 'duplicate-id-1', email: 'a@x', refresh: 'rt-a', addedAt: 1, lastUsed: 1 },
        { id: 'duplicate-id-1', email: 'b@x', refresh: 'rt-b', addedAt: 1, lastUsed: 1 },
      ],
    }, null, 2) + '\n', { mode: 0o600 })

    const store = new JsonAccountStore({ file, codec, lock: noopFileLock })
    const loaded = await store.load()
    expect(loaded.accounts[0]!.id).toBe('duplicate-id-1')
    expect(loaded.accounts[1]!.id).not.toBe('duplicate-id-1')
    expect(loaded.accounts[1]!.id).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('serializes concurrent mutate operations without losing updates', async () => {
    const store = new InMemoryAccountStore()
    const p1 = store.mutate(async (s) => {
      await new Promise((r) => setTimeout(r, 20))
      s.accounts.push(account('p1@x'))
    })
    const p2 = store.mutate(async (s) => {
      await new Promise((r) => setTimeout(r, 10))
      s.accounts.push(account('p2@x'))
    })
    await Promise.all([p1, p2])
    const loaded = await store.load()
    expect(loaded.accounts).toHaveLength(2)
    expect(loaded.accounts.map((a) => a.email).sort()).toEqual(['p1@x', 'p2@x'])
  })
})
describe('pool helpers', () => {
  it('resolves active account with enabled fallback', () => {
    const storage = {
      version: CURRENT_STORAGE_VERSION as const,
      activeIndex: 0,
      accounts: [
        { ...account('disabled@x'), enabled: false },
        { ...account('ok@x') },
      ],
    }
    const resolved = resolveActiveAccount(storage)
    expect(resolved?.account.email).toBe('ok@x')
    expect(resolved?.index).toBe(1)
  })

  it('returns undefined for an empty pool', () => {
    expect(resolveActiveAccount({ version: CURRENT_STORAGE_VERSION, accounts: [], activeIndex: 0 })).toBeUndefined()
  })
})
