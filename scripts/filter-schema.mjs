// Re-apply the CS:GO filter to an existing data/inventory.*.json cache.
// Useful after pulling a cache fetched before the filter existed, and
// idempotent. Writes one `.pre-csgo.bak` per file before changing it.
import fs from 'node:fs'
import path from 'node:path'
import { filterInventory, filterSource, loadWhitelist } from './lib/csgo-schema.mjs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DRY = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'
const whitelist = loadWhitelist()

const files = fs.existsSync(DATA_DIR)
  ? fs.readdirSync(DATA_DIR).filter((name) => /^inventory\..*\.json$/.test(name))
  : []
if (!files.length) {
  console.error('no data/inventory.*.json found - run npm run fetch-schema first')
  process.exit(1)
}

console.log(`csgo filter: ${whitelist.sets.paint.size} paint kits, ${whitelist.sets.items.size} items, ${whitelist.sets.stickers.size} sticker kits, ${whitelist.sets.music.size} music kits`)

let lastStats = null
for (const name of files) {
  const file = path.join(DATA_DIR, name)
  const before = JSON.parse(fs.readFileSync(file, 'utf8'))
  const { inventory, stats } = filterInventory(before, whitelist)
  lastStats = stats
  const skinsCount = Object.values(inventory.skins || {}).reduce((a, m) => a + Object.keys(m).length, 0)
  console.log(`${name}: ${skinsCount} skins (kept ${stats.skins.kept}, dropped ${stats.skins.dropped}, vanilla ${stats.skins.vanilla})`)

  if (DRY) continue
  const backup = `${file}.pre-csgo.bak`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, JSON.stringify(inventory))
}

const metaPath = path.join(DATA_DIR, 'meta.json')
if (!DRY && lastStats && fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  const enFile = path.join(DATA_DIR, 'inventory.en.json')
  const current = fs.existsSync(enFile) ? JSON.parse(fs.readFileSync(enFile, 'utf8')) : null
  if (current) {
    meta.skins_weapons = Object.keys(current.skins || {}).length
    meta.skins_total = Object.values(current.skins || {}).reduce((a, m) => a + Object.keys(m).length, 0)
    meta.categories = Object.fromEntries(Object.keys(current).map((key) => [key, key === 'skins' ? Object.keys(current.skins || {}).length : Object.keys(current[key] || {}).length]))
  }
  meta.filter = { ...filterSource(whitelist.meta), ...lastStats, applied_at: new Date().toISOString() }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

if (DRY) console.log('dry run: nothing written')
else console.log('done: filtered cache written, .pre-csgo.bak backups kept')
