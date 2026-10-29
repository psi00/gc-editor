// fetch-once schema cache. run manually when online, then stay offline.
// keeps full bymykel inventory.json categories, trimmed to name/rarity/image only.
//
// bymykel tracks CS2 today, so the result is filtered down to the ids that
// exist in the final CS:GO build (scripts/csgo-whitelist.json). pass
// `--no-filter` only when inspecting raw upstream data.
import fs from 'node:fs'
import path from 'node:path'
import { filterInventory, filterSource, loadWhitelist } from './lib/csgo-schema.mjs'

const LANGS = (process.env.LANGS || 'en').split(',').map((s) => s.trim())
const OUT_DIR = path.join(process.cwd(), 'data')
const BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/refs/heads/main/public/api'
const APPLY_FILTER = !process.argv.includes('--no-filter') && process.env.NO_CSGO_FILTER !== '1'

const KEEP_KEYS = ['skins', 'crates', 'collectibles', 'stickers', 'graffiti', 'music_kits', 'keychains', 'agents', 'patches', 'keys', 'tools', 'sticker_slabs', 'highlights']

function trimEntry(v = {}) {
  return { name: v.name || '', rarity: v.rarity || null, image: v.image || null, marketable: v.marketable ?? null }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'gc-editor' } })
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`)
  return r.json()
}

const whitelist = APPLY_FILTER ? loadWhitelist() : null
if (whitelist) {
  console.log(`csgo filter: ${whitelist.sets.paint.size} paint kits, ${whitelist.sets.items.size} items, ${whitelist.sets.stickers.size} sticker kits, ${whitelist.sets.music.size} music kits`)
} else {
  console.warn('csgo filter disabled: the cache will include CS2 items (--no-filter)')
}

for (const lang of LANGS) {
  const code = lang === 'zh-Hans' ? 'zh-CN' : lang
  const url = `${BASE}/${code}/inventory.json`
  console.log(`fetching ${url}`)
  const full = await fetchJson(url)
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

  const { inventory: output, stats } = whitelist
    ? filterInventory(trimmed, whitelist)
    : { inventory: trimmed, stats: null }

  const skinsCount = Object.values(output.skins || {}).reduce((a, m) => a + Object.keys(m).length, 0)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, `inventory.${lang}.json`), JSON.stringify(output))
  if (lang === 'en') fs.writeFileSync(path.join(OUT_DIR, 'inventory.en.json'), JSON.stringify(output))
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({
    source: url, lang, fetched_at: new Date().toISOString(),
    skins_weapons: Object.keys(output.skins || {}).length, skins_total: skinsCount,
    categories: Object.fromEntries(KEEP_KEYS.filter((k) => output[k]).map((k) => [k, Object.keys(output[k] || {}).length])),
    filter: whitelist ? { ...filterSource(whitelist.meta), ...stats } : { skipped: true },
    note: 'fetch-once cache, offline after this. refresh manually only. filtered to the CS:GO item set.',
  }, null, 2))
  console.log(`wrote data/inventory.${lang}.json (${skinsCount} skins)`)
  if (stats) {
    console.log(`  skins kept ${stats.skins.kept}, dropped ${stats.skins.dropped} CS2 rows; vanilla ${stats.skins.vanilla}`)
    const dropped = Object.entries(stats.categories).filter(([, v]) => v.dropped > 0)
    if (dropped.length) console.log('  categories dropped:', dropped.map(([k, v]) => `${k} -${v.dropped}`).join(', '))
  }
}
