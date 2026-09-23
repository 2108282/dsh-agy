import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeBlobFile } from '../src/cli/index.ts'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agy-cli-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('dsh-agy export blob file', () => {
  it('writes the blob owner-only', () => {
    // A blob carries a live access+refresh token in plain base64. Without an
    // explicit mode the file lands at the umask default (0644), i.e. readable by
    // every user on the machine. Asserting the group/other bits rather than the
    // literal 0o600 keeps the test honest under a restrictive umask: umask can
    // only clear bits, and clearing owner bits is not a leak.
    const file = join(tempDir(), 'dsh-agy-0.blob')
    writeBlobFile(file, 'AGY-BLOB-PAYLOAD')

    const mode = statSync(file).mode & 0o777
    expect(mode & 0o077, `mode ${mode.toString(8)} is group/other accessible`).toBe(0)
    expect(mode & 0o400).toBe(0o400)
  })

  it('terminates the blob with a newline so `--out` files paste as one line', () => {
    const file = join(tempDir(), 'dsh-agy-1.blob')
    writeBlobFile(file, 'AGY-BLOB-PAYLOAD')
    expect(readFileSync(file, 'utf8')).toBe('AGY-BLOB-PAYLOAD\n')
  })
})
