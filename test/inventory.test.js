import test from 'node:test'
import assert from 'node:assert/strict'
import fs, { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseInventory, serializeInventory, validateInventory, writeInventoryAtomic, listInventoryBackups, countInventoryBackup, MAX_BACKUPS } from '../server/inventory.js'
import { parseVdf, serializeVdf } from '../server/vdf.js'

const FIXTURE = `\uFEFF"format_version"\t\t"1"
"player_state"
{
\t"level"\t\t"39"
\t"xp"\t\t"4999"
}
"custom_section"
{
\t"keep"\t\t"me"
}
"items"
{
\t"1"
\t{
\t\t"inventory"\t\t"1"
\t\t"def_index"\t\t"7"
\t\t"level"\t\t"1"
\t\t"quality"\t\t"4"
\t\t"flags"\t\t"0"
\t\t"origin"\t\t"24"
\t\t"in_use"\t\t"0"
\t\t"rarity"\t\t"6"
\t\t"custom_name"\t\t"naïve"
\t\t"attributes"
\t\t{
\t\t\t"6"\t\t"44.000000"
\t\t\t"7"\t\t"661"
\t\t\t"8"\t\t"0.150000"
\t\t\t"111"\t\t"Blue Gem"
\t\t\t"113"\t\t"37"
\t\t}
\t\t"equipped_state"
\t\t{
\t\t\t"2"\t\t"1"
\t\t}
\t}
\t"2"
\t{
\t\t"inventory"\t\t"2"
\t\t"def_index"\t\t"9"
\t\t"level"\t\t"1"
\t\t"quality"\t\t"9"
\t\t"flags"\t\t"0"
\t\t"origin"\t\t"24"
\t\t"in_use"\t\t"0"
\t\t"rarity"\t\t"6"
\t\t"attributes"
\t\t{
\t\t\t"6"\t\t"344.000000"
\t\t\t"7"\t\t"42"
\t\t\t"8"\t\t"0.010000"
\t\t\t"80"\t\t"404"
\t\t\t"81"\t\t"1"
\t\t}
\t\t"equipped_state"
\t\t{
\t\t}
\t}
}
"default_equips"
{
\t"1"
\t{
\t\t"class_id"\t\t"3"
\t\t"slot_id"\t\t"15"
\t}
}
`

test('parseInventory strips a BOM and reads scalars, attributes, and equipped_state', () => {
  const inv = parseInventory(FIXTURE)
  assert.equal(inv.items.length, 2)
  assert.equal(inv.items[0].custom_name, 'naïve')
  assert.equal(inv.items[0].attributes['111'], 'Blue Gem')
  assert.equal(inv.items[0].attributes['113'], '37')
  assert.equal(inv.items[0].equipped_state['2'], '1')
  assert.equal(inv.items[1].attributes['80'], '404')
  assert.deepEqual(inv.default_equips, { '1': { class_id: 3, slot_id: 15 } })
})

test('serializeInventory preserves top-level scalars and unknown sections', () => {
  const inv = parseInventory(FIXTURE)
  const root = parseVdf(serializeInventory(inv, FIXTURE))
  assert.equal(root.format_version, '1')
  assert.deepEqual(root.player_state, { level: '39', xp: '4999' })
  assert.deepEqual(root.custom_section, { keep: 'me' })
})

test('serializeInventory preserves per-item attributes and equipped_state', () => {
  const inv = parseInventory(FIXTURE)
  const root = parseVdf(serializeInventory(inv, FIXTURE))
  assert.equal(root.items['1'].custom_name, 'naïve')
  assert.equal(root.items['1'].attributes['111'], 'Blue Gem')
  assert.deepEqual(root.items['1'].equipped_state, { '2': '1' })
  assert.deepEqual(root.default_equips, { '1': { class_id: '3', slot_id: '15' } })
})

test('an items save removes only the omitted item', () => {
  const inv = parseInventory(FIXTURE)
  const remaining = inv.items.filter((item) => item.id !== 2)
  const root = parseVdf(serializeInventory({ items: remaining, default_equips: inv.default_equips }, FIXTURE))
  assert.deepEqual(Object.keys(root.items), ['1'])
  assert.equal(root.items['2'], undefined)
  assert.equal(root.items['1'].def_index, '7')
})

test('an empty default_equips removes the section', () => {
  const inv = parseInventory(FIXTURE)
  const root = parseVdf(serializeInventory({ items: inv.items, default_equips: {} }, FIXTURE))
  assert.equal(root.default_equips, undefined)
})

test('serializeVdf keeps top-level scalars scalar', () => {
  const root = parseVdf(serializeVdf({ format_version: '1', player_state: { level: '1' } }))
  assert.equal(root.format_version, '1')
  assert.deepEqual(root.player_state, { level: '1' })
})

test('validateInventory reports duplicate slots, bad keys, and empty attributes', () => {
  const warnings = validateInventory({
    items: [
      { id: 1, inventory: 1, def_index: 7, attributes: { '6': '44', x: '1' } },
      { id: 2, inventory: 1, def_index: 9, attributes: { '7': '' } },
    ],
  })
  assert.ok(warnings.some((warning) => warning.includes('duplicate inventory slot')))
  assert.ok(warnings.some((warning) => warning.includes('bad attribute key')))
  assert.ok(warnings.some((warning) => warning.includes('empty attribute')))
})

const roundtripFixture = readFileSync(new URL('./fixtures/inventory-roundtrip.txt', import.meta.url), 'utf8')
const unknownFixture = readFileSync(new URL('./fixtures/inventory-unknown.txt', import.meta.url), 'utf8')
const corruptFixture = readFileSync(new URL('./fixtures/inventory-corrupt.txt', import.meta.url), 'utf8')

test('inventory fixture round-trips byte-identically', () => {
  const inv = parseInventory(roundtripFixture)
  assert.equal(serializeInventory(inv, roundtripFixture), roundtripFixture)
})

test('inventory fixture with unknown fields round-trips byte-identically', () => {
  const inv = parseInventory(unknownFixture)
  const serialized = serializeInventory(inv, unknownFixture)
  assert.equal(serialized, unknownFixture)
  const root = parseVdf(serialized)
  assert.equal(root.format_version, '1')
  assert.deepEqual(root.player_state, { level: '39', xp: '4999' })
  assert.deepEqual(root.unknown_section, { keep: 'me' })
  assert.equal(root.items['1'].future_field, 'keep me')
})

test('corrupt input reports skipped lines and a save warning', () => {
  const inv = parseInventory(corruptFixture)
  assert.ok(inv.skipped > 0)
  const warnings = validateInventory(inv)
  assert.ok(warnings.some((warning) => warning.includes('could not be parsed')))
})

test('an items save keeps unknown fields from the existing file', () => {
  const inv = parseInventory(unknownFixture)
  const stripped = inv.items.map(({ __raw, ...item }) => item)
  const serialized = serializeInventory({ items: stripped, default_equips: inv.default_equips }, unknownFixture)
  assert.equal(serialized, unknownFixture)
  assert.equal(parseVdf(serialized).items['1'].future_field, 'keep me')
})

test('serializeVdf escapes newlines and tabs', () => {
  const text = serializeVdf({ note: 'a\nb\tc' })
  assert.equal(text, '"note"\t\t"a\\nb\\tc"\n')
  assert.deepEqual(parseVdf(text), { note: 'a\nb\tc' })
})

test('saving rotates backups and lists counts lazily', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-editor-bak-'))
  const file = path.join(dir, 'inventory.txt')
  const content = '"items"\n{\n}\n'
  try {
    fs.writeFileSync(file, content, 'utf8')
    for (let index = 0; index < 50; index += 1) {
      writeInventoryAtomic(file, content)
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    const backups = listInventoryBackups(file, 100)
    assert.equal(backups.length, MAX_BACKUPS)
    assert.equal(backups[0].count, null)
    assert.ok(backups.every((backup) => backup.size === Buffer.byteLength(content)))
    assert.equal(countInventoryBackup(backups[0].file), 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a failed rename leaves the original inventory intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-editor-crash-'))
  const file = path.join(dir, 'inventory.txt')
  try {
    fs.writeFileSync(file, 'old inventory', 'utf8')
    const rename = fs.renameSync
    fs.renameSync = () => { throw new Error('simulated crash') }
    try {
      assert.throws(() => writeInventoryAtomic(file, 'new inventory'), /simulated crash/)
    } finally {
      fs.renameSync = rename
    }
    assert.equal(readFileSync(file, 'utf8'), 'old inventory')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

