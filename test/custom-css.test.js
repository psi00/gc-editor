import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CUSTOM_CSS_LIMIT, STARTER, ensureCustomCss, readCustomCss, writeCustomCss } from '../server/custom-css.js'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-css-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('ensureCustomCss seeds the starter once', (t) => {
  const file = path.join(tempDir(t), 'custom.css')
  assert.equal(ensureCustomCss(file), true)
  assert.equal(fs.readFileSync(file, 'utf8'), STARTER)
  assert.equal(ensureCustomCss(file), false)
})

test('readCustomCss reports a missing file as an empty sheet', (t) => {
  const read = readCustomCss(path.join(tempDir(t), 'custom.css'))
  assert.equal(read.exists, false)
  assert.equal(read.css, '')
  assert.equal(read.size, 0)
  assert.equal(read.updatedAt, null)
})

test('writeCustomCss round-trips and keeps the previous content as a .bak', (t) => {
  const file = path.join(tempDir(t), 'nested', 'custom.css')
  writeCustomCss(file, ':root { --primary: 280 90% 62%; }')
  const saved = writeCustomCss(file, ':root { --primary: 0 100% 50%; }')

  const read = readCustomCss(file)
  assert.equal(read.exists, true)
  assert.equal(read.css, ':root { --primary: 0 100% 50%; }')
  assert.ok(saved.backup)
  assert.equal(fs.readFileSync(saved.backup, 'utf8'), ':root { --primary: 280 90% 62%; }')
  assert.equal(fs.existsSync(`${file}.tmp`), false)
})

test('writeCustomCss rejects oversized sheets without touching the file', (t) => {
  const file = path.join(tempDir(t), 'custom.css')
  assert.throws(() => writeCustomCss(file, 'a'.repeat(CUSTOM_CSS_LIMIT + 1)), /limit/)
  assert.equal(fs.existsSync(file), false)
})

test('writeCustomCss rejects non-strings', (t) => {
  const file = path.join(tempDir(t), 'custom.css')
  assert.throws(() => writeCustomCss(file, null), /string/)
})
