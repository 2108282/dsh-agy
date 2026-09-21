/**
 * Master-key management and AES-256-GCM secret codec for the account store.
 *
 * The master key lives in the DSH credentials document (`~/.dsh/.credentials.yaml`,
 * 0600) under `AGY_MASTER_KEY` so both the in-harness plugin (via
 * `ctx.credentials`) and the standalone `dsh-agy` CLI (direct file read) can
 * encrypt and decrypt the same account store.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { Document, isMap, isScalar, parseDocument, type YAMLMap } from 'yaml'

export const MASTER_KEY_REF = 'AGY_MASTER_KEY'

/** Encrypt/decrypt secrets at rest. */
export interface SecretCodec {
  encrypt(plaintext: string): string
  decrypt(payload: string): string
}

const ENC_PREFIX = 'enc:v1:'

/** AES-256-GCM codec; ciphertext format `enc:v1:<iv-b64>:<tag-b64>:<data-b64>`. */
export function createAesGcmCodec(key: Buffer): SecretCodec {
  if (key.length !== 32) {
    throw new Error(`createAesGcmCodec: master key must be 32 bytes, got ${key.length}`)
  }
  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return `${ENC_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${data.toString('base64url')}`
    },
    decrypt(payload: string): string {
      if (!payload.startsWith(ENC_PREFIX)) {
        throw new Error('decrypt: payload is not in encrypted format')
      }
      const [, , ivB64 = '', tagB64 = '', dataB64 = ''] = payload.split(':')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
      const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()])
      return plain.toString('utf8')
    },
  }
}

/** Derive a 32-byte key from an arbitrary master-key string (SHA-256). */
export function deriveKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey, 'utf8').digest()
}

/** Default DSH home (`~/.dsh`), honoring `$DSH_HOME`. */
export function resolveDshHome(): string {
  return process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}

function homedir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '.'
}

/** A credentials reference name must be a POSIX-style identifier. */
const REF_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** The document's non-reference sections. */
const SECTION_KEYS = ['version', 'records'] as const

/** Every top-level key DSH's credentials provider admits; anything else is rejected. */
const DOCUMENT_TOP_LEVEL = new Set<string>([...SECTION_KEYS, 'refs'])

/**
 * Describe one YAML parse failure without quoting the source, which holds
 * secrets. The parser's own message embeds the offending line.
 */
function describeYamlError(error: { code?: string; linePos?: { line: number; col: number }[] }): string {
  const at = error.linePos?.[0]
  return `${error.code ?? 'parse-error'}${at ? ` at line ${at.line}, column ${at.col}` : ''}`
}

/** One parsed credentials document, with the shape this build understands. */
interface CredentialsDocument {
  /** The mutable tree, for editing before re-serialization. */
  document: Document
  /** The root mapping. */
  root: YAMLMap
  /** The `refs` mapping, or undefined when absent, null, or not a mapping. */
  refs: YAMLMap | undefined
  /** True for a pre-release document: no `version` stamp, refs at top level. */
  flat: boolean
}

/**
 * Parse the credentials document and locate its `refs` section.
 *
 * The document is owned by DSH's credentials provider, which serializes it with
 * the `yaml` package. Values are folded across physical lines (a long
 * single-quoted scalar folds at whitespace) and `records` payloads nest
 * arbitrary keys, so this MUST be a real parse rather than a line scan: a
 * line-based reader cannot represent folding, and it lets a `records` payload
 * shadow a real top-level reference.
 *
 * Deliberately permissive: it validates only the shape it consumes, so the read
 * path keeps working on a document written by an older build. What may be
 * rewritten is enforced separately, in the writer.
 */
function parseCredentialsDocument(text: string, file: string, context: string): CredentialsDocument {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    throw new Error(
      `${context}: cannot parse ${file}: ` + document.errors.map(describeYamlError).join('; '),
    )
  }
  const root = document.contents
  if (!isMap(root)) throw new Error(`${context}: ${file} must be a mapping`)

  const refs = root.get('refs')
  // The provider treats an absent or null section as empty.
  if (refs !== undefined && refs !== null && !isMap(refs)) {
    throw new Error(`${context}: "refs" in ${file} must be a mapping`)
  }
  // The pre-release layout is identified by the absence of the version stamp,
  // not by a missing `refs:` — a valid version-1 document may simply not have
  // written a `refs:` section yet.
  return { document, root, refs: isMap(refs) ? refs : undefined, flat: !root.has('version') }
}

/**
 * Read the references from the DSH credentials document.
 *
 * Only `refs` holds references, and a `records` payload must never be able to
 * shadow one. Two compatibility cases matter:
 *
 * - A pre-release "flat" document keeps its references at the top level; the
 *   provider still reads that layout, so we do too.
 * - Version 0.2.7 of this plugin appended the master key as a *top-level* key.
 *   The provider rejects such a document, but the key still decrypts an
 *   existing account store, so it is read as a fallback. Dropping it would
 *   silently mint a new master key and strand those accounts.
 *
 * Non-string and empty values are skipped, mirroring the provider.
 */
export function readCredentialsDocument(file: string): Map<string, string> {
  const entries = new Map<string, string>()
  if (!existsSync(file)) return entries
  const text = readFileSync(file, 'utf8')
  if (text.trim().length === 0) return entries
  const { root, refs, flat } = parseCredentialsDocument(text, file, 'readCredentialsDocument')

  const section = flat ? root : refs
  if (section) {
    for (const item of section.items) {
      if (!isScalar(item.key) || !isScalar(item.value)) continue
      const key = item.key.value
      const value = item.value.value
      if (typeof key !== 'string' || !REF_NAME.test(key)) continue
      // In the flat layout, `version`/`records` are sections, not references.
      if (flat && SECTION_KEYS.includes(key as (typeof SECTION_KEYS)[number])) continue
      if (typeof value !== 'string' || value.length === 0) continue
      entries.set(key, value)
    }
  }
  // The 0.2.7 top-level master key, only when `refs` does not already supply one.
  if (!flat && !entries.has(MASTER_KEY_REF)) {
    // Without `keepScalar`, a scalar node is unwrapped to its plain value.
    const legacy = root.get(MASTER_KEY_REF)
    if (typeof legacy === 'string' && legacy.length > 0) entries.set(MASTER_KEY_REF, legacy)
  }
  return entries
}

/**
 * POSIX owner-only enforcement. Windows mode bits never report 0600 (and
 * chmod is a no-op there), so the check is skipped on win32; the encrypted
 * account file and credentials document remain the only defense-in-depth
 * layer on that platform.
 */
export function assertOwnerOnly(file: string): void {
  if (process.platform === 'win32') return
  const mode = statSync(file).mode & 0o777
  if (mode !== 0o600) {
    throw new Error(
      `dsh-agy: ${file} is readable beyond its owner (mode ${mode.toString(8)}); ` +
        'run "chmod 600" before starting again',
    )
  }
}

/**
 * Load the master key from the DSH credentials document. Returns undefined when
 * the document or the reference is absent.
 */
export function loadMasterKey(dshHome: string): string | undefined {
  const file = join(dshHome, '.credentials.yaml')
  if (!existsSync(file)) return undefined
  assertOwnerOnly(file)
  return readCredentialsDocument(file).get(MASTER_KEY_REF)
}

/** Top-level keys DSH's credentials provider admits; anything else is rejected. */
/**
 * Render the version-1 layout for a pre-release "flat" document — a non-empty
 * top-level mapping of reference names to non-empty string scalars, with no
 * `version` key and no document directives. The original lines are nested
 * verbatim under `refs:`, so comments, blank lines, and each value's spelling
 * survive byte for byte. Returns undefined for anything the recognizer
 * declines, which the caller must then refuse to rewrite.
 *
 * Nesting whole lines is safe for block scalars: an explicit indent indicator
 * (`|2`) is absolute and the implied one is detected relative to the key, so
 * shifting every line by the same two spaces preserves the parsed value.
 */
function renderFlatLayoutMigration(text: string): string | undefined {
  for (const line of text.split('\n')) if (/^(%|---|\.\.\.)/.test(line)) return undefined
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) return undefined
  const flat = document.contents
  if (!isMap(flat) || flat.items.length === 0) return undefined
  for (const pair of flat.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string') return undefined
    if (DOCUMENT_TOP_LEVEL.has(pair.key.value) || !REF_NAME.test(pair.key.value)) return undefined
    if (!isScalar(pair.value) || typeof pair.value.value !== 'string') return undefined
    if (pair.value.value.length === 0) return undefined
  }
  const indented = text
    .split('\n')
    .map((line) => (line.length === 0 ? line : `  ${line}`))
    .join('\n')
  return `version: 1\nrefs:\n${indented}${text.endsWith('\n') ? '' : '\n'}`
}

/**
 * Render the credentials document with {@link MASTER_KEY_REF} added under `refs`.
 *
 * The key MUST be nested under `refs`: DSH's credentials provider rejects any
 * other top-level key, and a document it rejects makes *every* credential in
 * the file unreadable, not just ours. Editing the parsed document keeps the
 * comments and formatting of every untouched entry; a document this build
 * cannot prove it understands is never rewritten.
 */
function renderWithMasterKey(existingText: string, masterKey: string, file: string): string {
  const fresh = (): string => new Document({ version: 1, refs: { [MASTER_KEY_REF]: masterKey } }).toString()
  if (existingText.trim().length === 0) return fresh()
  const { document, root, refs, flat } = parseCredentialsDocument(existingText, file, 'persistMasterKey')

  if (flat) {
    const migrated = renderFlatLayoutMigration(existingText)
    if (migrated === undefined) {
      throw new Error(
        `persistMasterKey: ${file} is not a credentials document this build can prove it ` +
          'understands; refusing to rewrite it',
      )
    }
    const next = parseDocument(migrated)
    next.setIn(['refs', MASTER_KEY_REF], masterKey)
    return next.toString()
  }

  for (const key of root.items) {
    if (!isScalar(key.key) || typeof key.key.value !== 'string') continue
    if (!DOCUMENT_TOP_LEVEL.has(key.key.value)) {
      throw new Error(
        `persistMasterKey: ${file} has unknown top-level key "${key.key.value}"; refusing to rewrite it`,
      )
    }
  }
  // Never bump or downgrade the version stamp: the provider rejects any value
  // but 1 ("this build reads version 1"), so rewriting a future version to 1
  // would silently corrupt a document this build does not understand.
  const version = root.get('version')
  if (version !== 1) {
    throw new Error(
      `persistMasterKey: ${file} declares version ${JSON.stringify(version)}; refusing to rewrite it`,
    )
  }
  // An empty `refs:` parses to a null scalar, which `setIn` cannot descend
  // into; replacing the node materializes the map in place.
  if (refs) document.setIn(['refs', MASTER_KEY_REF], masterKey)
  else document.set('refs', { [MASTER_KEY_REF]: masterKey })
  return document.toString()
}

/**
 * Generate and persist a fresh master key (0600) in the DSH credentials document.
 *
 * The key is added under `refs` by editing the parsed document, then written
 * with an atomic tmp+rename, so every other credential — and the comments and
 * formatting DSH services rely on — survives. Never rewrite the whole file from
 * a rebuilt view: that would silently drop entries this build does not model.
 */
export function persistMasterKey(dshHome: string, masterKey: string): void {
  const file = join(dshHome, '.credentials.yaml')
  mkdirSync(dirname(file), { recursive: true })
  const existingText = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (existingText.length > 0 && readCredentialsDocument(file).has(MASTER_KEY_REF)) {
    throw new Error(`persistMasterKey: ${MASTER_KEY_REF} already exists in ${file}`)
  }
  const next = renderWithMasterKey(existingText, masterKey, file)
  const tmp = `${file}.tmp-masterkey`
  writeFileSync(tmp, next, { mode: 0o600 })
  renameSync(tmp, file)
}

/**
 * Resolve (load or create) the master key for a dsh home, then build the codec.
 * Creating a key writes the credentials document; read-only setups should call
 * {@link loadMasterKey} first and surface a friendly error instead.
 */
export function resolveMasterKeyCodec(dshHome: string): { codec: SecretCodec; created: boolean } {
  let masterKey = loadMasterKey(dshHome)
  let created = false
  if (!masterKey) {
    masterKey = randomBytes(32).toString('hex')
    persistMasterKey(dshHome, masterKey)
    created = true
  }
  return { codec: createAesGcmCodec(deriveKey(masterKey)), created }
}
