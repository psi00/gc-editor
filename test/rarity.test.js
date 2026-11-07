import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rarityTier } from '../shared/rarity.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const caches = [
  path.join(root, 'data', 'inventory.en.json'),
  path.join(root, 'data', 'cs2', 'inventory.en.json'),
]

function collectRarities(node, found) {
  if (!node || typeof node !== 'object') return
  if (node.rarity?.name) found.set(`${node.rarity.name}\0${node.rarity.id}`, node.rarity)
  for (const value of Object.values(node)) collectRarities(value, found)
}

test('rarityTier covers every rarity in both schema caches', { skip: !caches.every(fs.existsSync) }, () => {
  const found = new Map()
  for (const file of caches) collectRarities(JSON.parse(fs.readFileSync(file, 'utf8')), found)
  assert.ok(found.size > 0)
  for (const rarity of found.values()) {
    assert.notEqual(
      rarityTier(rarity.name, rarity.id),
      null,
      `unmapped schema rarity: ${rarity.name} (${rarity.id})`,
    )
  }
})

test('rarityTier matches the GT-610 Rarity enum', () => {
  const expected = [
    ['Default', 'rarity_default', 0],
    ['Consumer Grade', 'rarity_common_weapon', 1],
    ['Base Grade', 'rarity_common', 1],
    ['Highlight Base Grade', 'rarity_common_highlight', 1],
    ['Industrial Grade', 'rarity_uncommon_weapon', 2],
    ['Mil-Spec Grade', 'rarity_rare_weapon', 3],
    ['High Grade', 'rarity_rare', 3],
    ['Distinguished', 'rarity_rare_character', 3],
    ['Restricted', 'rarity_mythical_weapon', 4],
    ['Remarkable', 'rarity_mythical', 4],
    ['Exceptional', 'rarity_mythical_character', 4],
    ['Classified', 'rarity_legendary_weapon', 5],
    ['Exotic', 'rarity_legendary', 5],
    ['Superior', 'rarity_legendary_character', 5],
    ['Covert', 'rarity_ancient_weapon', 6],
    ['Extraordinary', 'rarity_ancient', 6],
    ['Master', 'rarity_ancient_character', 6],
    ['Contraband', 'rarity_contraband', 7],
    ['Contraband', 'rarity_contraband_weapon', 7],
    ['Unusual', 'rarity_unusual', 99],
  ]
  for (const [name, id, tier] of expected) {
    assert.equal(rarityTier(name, id), tier, `${name} (${id})`)
  }
  assert.equal(rarityTier('Covert'), 6)
  assert.equal(rarityTier(undefined, 'rarity_ancient_weapon'), 6)
  assert.equal(rarityTier('Not a real rarity', 'rarity_unknown'), null)
})
