// fetch-once schema cache. run manually when online, then stay offline.
// keeps full bymykel inventory.json categories, trimmed to name/rarity/image only.
//
// bymykel tracks CS2 today. CS2 therefore uses the upstream data unchanged and
// lands in data/cs2/. CS:GO keeps the original data/ layout and is filtered down
// to the ids that exist in the final CS:GO build (scripts/csgo-whitelist.json).
// pass `--no-filter` only when inspecting raw upstream data.
//
// usage: npm run fetch-schema [-- --game=csgo|cs2]
import fs from 'node:fs'
import path from 'node:path'
import { filterInventory, filterSource, loadWhitelist } from './lib/csgo-schema.mjs'
import { GAMES, normalizeGame } from '../server/games.js'

const LANGS = (process.env.LANGS || 'en').split(',').map((s) => s.trim())
const OUT_DIR = path.join(process.cwd(), 'data')
const BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/refs/heads/main/public/api'
const APPLY_FILTER = !process.argv.includes('--no-filter') && process.env.NO_CSGO_FILTER !== '1'
const gameArg = (process.argv.find((a) => a.startsWith('--game=')) || '').split('=')[1]
const GAMES_TO_FETCH = gameArg ? [normalizeGame(gameArg)] : GAMES

const KEEP_KEYS = ['skins', 'crates', 'collectibles', 'stickers', 'graffiti', 'music_kits', 'keychains', 'agents', 'patches', 'keys', 'tools', 'sticker_slabs', 'highlights']

function trimEntry(v = {}) {
  return { name: v.name || '', rarity: v.rarity || null, image: v.image || null, marketable: v.marketable ?? null }
}

function trimInventory(full) {
  const trimmed = {}
  for (const k of KEEP_KEYS) {
    const section = full[k] || {}
    if (k === 'skins') {
      trimmed.skins = {}
      for (const [weaponId, paints] of Object.entries(section)) {
        trimmed.skins[weaponId] = {}
        for (const [paintIdx, v] of Object.entries(paints)) {
          trimmed.skins[weaponId][paintIdx] = trimEntry(v)
        }
      }
    } else {
      trimmed[k] = {}
      for (const [id, v] of Object.entries(section)) {
        trimmed[k][id] = trimEntry(v)
      }
    }
  }
  return trimmed
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'gc-editor' } })
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`)
  return r.json()
}

function dataDirFor(game) {
  return game === 'csgo' ? OUT_DIR : path.join(OUT_DIR, game)
}

function writeMeta(game, meta) {
  const dir = dataDirFor(game)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
}

// CS2 ships items_game.txt inside pak01 VPKs, so case membership comes from the
// upstream crates/collections endpoints instead. Trim them to what build-cases
// needs: the display label and the skins each one contains.
function trimCrateSource(list) {
  return (Array.isArray(list) ? list : []).map((crate) => ({
    name: crate.name || '',
    contains: (crate.contains || []).map((entry) => ({ name: entry.name || '', paint_index: entry.paint_index ?? null })),
    contains_rare: (crate.contains_rare || []).map((entry) => ({ name: entry.name || '', paint_index: entry.paint_index ?? null })),
  }))
}

function trimCollectionSource(list) {
  return (Array.isArray(list) ? list : []).map((collection) => ({
    name: collection.name || '',
    contains: (collection.contains || []).map((entry) => ({ name: entry.name || '', paint_index: entry.paint_index ?? null })),
  }))
}

async function fetchCaseSources() {
  const dir = path.join(dataDirFor('cs2'), 'upstream')
  fs.mkdirSync(dir, { recursive: true })
  const [crates, collections] = await Promise.all([
    fetchJson(`${BASE}/en/crates.json`),
    fetchJson(`${BASE}/en/collections.json`),
  ])
  fs.writeFileSync(path.join(dir, 'crates.json'), JSON.stringify(trimCrateSource(crates)))
  fs.writeFileSync(path.join(dir, 'collections.json'), JSON.stringify(trimCollectionSource(collections)))
  console.log(`wrote data/cs2/upstream: ${crates.length} crates, ${collections.length} collections`)
}

const whitelist = APPLY_FILTER ? loadWhitelist() : null
if (whitelist) {
  console.log(`csgo filter: ${whitelist.sets.paint.size} paint kits, ${whitelist.sets.items.size} items, ${whitelist.sets.stickers.size} sticker kits, ${whitelist.sets.music.size} music kits`)
} else {
  console.warn('csgo filter disabled: the cache will include CS2 items (--no-filter)')
}
console.log(`games: ${GAMES_TO_FETCH.join(', ')}`)

for (const lang of LANGS) {
  const code = lang === 'zh-Hans' ? 'zh-CN' : lang
  const url = `${BASE}/${code}/inventory.json`
  console.log(`fetching ${url}`)
  const full = await fetchJson(url)
  const trimmed = trimInventory(full)

  for (const game of GAMES_TO_FETCH) {
    const csgo = game === 'csgo'
    const { inventory: output, stats } = csgo && whitelist
      ? filterInventory(trimmed, whitelist)
      : { inventory: trimmed, stats: null }
    const dir = dataDirFor(game)
    const skinsCount = Object.values(output.skins || {}).reduce((a, m) => a + Object.keys(m).length, 0)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `inventory.${lang}.json`), JSON.stringify(output))
    if (lang === 'en') fs.writeFileSync(path.join(dir, 'inventory.en.json'), JSON.stringify(output))

    // only the first language writes the shared meta file
    if (lang === LANGS[0]) {
      writeMeta(game, {
        game,
        source: url, lang, fetched_at: new Date().toISOString(),
        skins_weapons: Object.keys(output.skins || {}).length, skins_total: skinsCount,
        categories: Object.fromEntries(KEEP_KEYS.filter((k) => output[k]).map((k) => [k, Object.keys(output[k] || {}).length])),
        filter: stats ? { ...filterSource(whitelist.meta), ...stats } : { skipped: true, reason: 'CS2 is the upstream catalogue' },
        note: csgo
          ? 'fetch-once cache, offline after this. refresh manually only. filtered to the CS:GO item set.'
          : 'fetch-once CS2 cache, offline after this. refresh manually only. upstream catalogue as-is.',
      })
    }
    console.log(`wrote data/${game === 'csgo' ? '' : `${game}/`}inventory.${lang}.json (${skinsCount} skins)`)
    if (stats) {
      console.log(`  skins kept ${stats.skins.kept}, dropped ${stats.skins.dropped} CS2 rows; vanilla ${stats.skins.vanilla}`)
      const dropped = Object.entries(stats.categories).filter(([, v]) => v.dropped > 0)
      if (dropped.length) console.log('  categories dropped:', dropped.map(([k, v]) => `${k} -${v.dropped}`).join(', '))
    }
  }
}

if (GAMES_TO_FETCH.includes('cs2')) {
  console.log('fetching CS2 case + collection contents')
  await fetchCaseSources()
}
