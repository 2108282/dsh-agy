// Temporary local workaround for dsh-agy 0.2.7, whose credentials reader is
// line-based and cannot parse a YAML value folded across physical lines.
//
// Two repairs, both driven by the same document edit:
//
// 1. Unfold long scalars (`lineWidth: 0`), so the 0.2.7 reader sees each value
//    on one line. The document is parsed into a `Document` and re-rendered, so
//    comments and the formatting of untouched entries survive; only the line
//    breaks inside long scalars disappear.
// 2. Move a top-level `AGY_MASTER_KEY` back under `refs`. Version 0.2.7 writes
//    it at the top level, which DSH's credentials provider rejects — a rejected
//    document makes every credential in it unreadable.
//
// Values are never altered, and the rewrite is validated before it is
// committed. Only run this against the already-published 0.2.7 build; a fixed
// build performs repair 2 itself on its next write.
import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMap, parseDocument } from 'yaml'

const REF = 'AGY_MASTER_KEY'
const home = process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(process.env.HOME, '.dsh')
const file = join(home, '.credentials.yaml')
const document = parseDocument(readFileSync(file, 'utf8'), { prettyErrors: true, uniqueKeys: true })
if (document.errors.length > 0) throw new Error(`refusing: ${file} does not parse as YAML`)

const root = document.contents
if (!isMap(root) || !root.has('refs') || root.get('version') !== 1) {
  throw new Error(`refusing: ${file} is not a version-1 credentials document with a refs section`)
}
for (const key of root.items) {
  const name = key.key?.value
  if (name !== 'version' && name !== 'refs' && name !== 'records' && name !== REF) {
    throw new Error(`refusing: ${file} has unexpected top-level key "${String(name)}"`)
  }
}

// Repair 2: relocate the 0.2.7 stray top-level key under `refs`.
const stray = root.get(REF)
const refs = root.get('refs')
let relocated = false
if (typeof stray === 'string' && stray.length > 0 && isMap(refs) && refs.get(REF) === undefined) {
  document.setIn(['refs', REF], stray)
  document.delete(REF)
  relocated = true
}

const next = document.toString({ lineWidth: 0 })

// Guard: the rewrite must preserve every credential value. Repair 2 deliberately
// moves one key, so compare the value maps rather than the whole document.
const before = parseDocument(readFileSync(file, 'utf8')).toJS() ?? {}
const after = parseDocument(next).toJS() ?? {}
const flatValues = (doc) => Object.fromEntries(
  [...Object.entries(doc.refs ?? {}), ...(typeof doc[REF] === 'string' ? [[REF, doc[REF]]] : [])],
)
const preserved = JSON.stringify(flatValues(before)) === JSON.stringify(flatValues(after)) &&
  JSON.stringify(before.records ?? {}) === JSON.stringify(after.records ?? {}) &&
  after.version === 1
if (!preserved) throw new Error('refusing: rewrite would change the document contents')

copyFileSync(file, `${file}.bak`)
const tmp = `${file}.tmp-unfold`
writeFileSync(tmp, next, { mode: 0o600 })
renameSync(tmp, file)
console.log(`rewrote ${file}${relocated ? ` (moved top-level ${REF} under refs)` : ''} (backup at ${file}.bak)`)
