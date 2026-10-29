// schema cache: bundled data/inventory.en.json (fetch-once) + local fallback.
// shape mirrors bymykel inventory.json trimmed to name/rarity/image per entry.
import fs from 'node:fs'
import path from 'node:path'

let cache = null
let cachePath = null
let cases = {}
let collections = {}

export function loadSchema(schemaPath) {
  cachePath = schemaPath
  try {
    if (!fs.existsSync(schemaPath)) { cache = null; cases = {}; collections = {}; return null }
    cache = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  } catch {
    cache = null
    cases = {}
    collections = {}
    return null
  }
  // optional side-car written by `npm run build-cases`: "<def>:<paint>" -> case
  // or collection name.
  try {
    const casesPath = path.join(path.dirname(schemaPath), 'cases.json')
    const raw = fs.existsSync(casesPath) ? JSON.parse(fs.readFileSync(casesPath, 'utf8')) : null
    cases = raw && typeof raw.cases === 'object' ? raw.cases : {}
    collections = raw && typeof raw.collections === 'object' ? raw.collections : {}
  } catch {
    cases = {}
    collections = {}
  }
  return cache
}

export function caseForSkin(weaponId, paint) {
  return cases[`${weaponId}:${paint}`] ?? null
}

export function collectionForSkin(weaponId, paint) {
  return collections[`${weaponId}:${paint}`] ?? null
}

export function getSchema() { return cache }

export const CATEGORIES = ['skins', 'crates', 'stickers', 'agents', 'keys', 'music_kits', 'graffiti', 'patches', 'collectibles', 'tools', 'keychains', 'highlights', 'sticker_slabs']

function allSkins() {
  if (!cache || !cache.skins) return []
  const out = []
  for (const [weaponId, paints] of Object.entries(cache.skins)) {
    for (const [paintIdx, s] of Object.entries(paints)) {
      const paint = paintIdx === 'null' ? 0 : Number(paintIdx)
      out.push({ weaponId: Number(weaponId), paint, ...s, case: caseForSkin(Number(weaponId), paint), collection: collectionForSkin(Number(weaponId), paint) })
    }
  }
  return out
}

export function searchSkins(q, limit = 50) {
  const needle = String(q || '').toLowerCase()
  if (!needle) return []
  return allSkins()
    .filter((s) => s.name && s.name.toLowerCase().includes(needle))
    .slice(0, limit)
}

export function skinsForWeapon(weaponId) {
  if (!cache || !cache.skins) return []
  const m = cache.skins[String(weaponId)] || {}
  return Object.entries(m)
    .map(([paintIdx, s]) => {
      const paint = paintIdx === 'null' ? 0 : Number(paintIdx)
      return { paint, ...s, case: caseForSkin(Number(weaponId), paint), collection: collectionForSkin(Number(weaponId), paint) }
    })
    .sort((a, b) => a.paint - b.paint)
}

export function listWeapons(limit = 300) {
  if (!cache || !cache.skins) return []
  const ids = Object.keys(cache.skins).map(Number).sort((a, b) => a - b)
  return ids.slice(0, limit).map((id) => {
    const paints = cache.skins[String(id)]
    const keys = Object.keys(paints || {})
    const firstKey = keys.includes('null') ? 'null' : keys.sort((a, b) => Number(a === 'null' ? 0 : a) - Number(b === 'null' ? 0 : b))[0]
    const first = firstKey != null ? paints[firstKey] : null
    const full = first ? first.name : `weapon ${id}`
    const weapon = full.includes(' | ') ? full.split(' | ')[0] : full
    const paint = firstKey === 'null' ? 0 : Number(firstKey)
    return { def_index: id, name: weapon, thumb: `/imgs/skins/${id}_${paint}.png` }
  })
}

export function listCategory(cat, limit = 500, q = '') {
  if (!cache || !cache[cat]) return []
  const needle = String(q || '').toLowerCase()
  let arr = Object.entries(cache[cat])
    .map(([id, v]) => ({ def_index: id, ...v }))
  if (needle) arr = arr.filter((it) => String(it.name || '').toLowerCase().includes(needle) || String(it.def_index).includes(needle))
  return arr
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
}

export function searchAll(q, limit = 50) {
  const needle = String(q || '').toLowerCase()
  if (!needle || !cache) return []
  const out = []
  out.push(...allSkins().filter((s) => s.name?.toLowerCase().includes(needle)).map((s) => ({ kind: 'skin', ...s })))
  for (const cat of CATEGORIES) {
    if (cat === 'skins' || !cache[cat]) continue
    for (const [id, v] of Object.entries(cache[cat])) {
      if (v?.name?.toLowerCase().includes(needle)) {
        out.push({ kind: cat, def_index: id, ...v })
        if (out.length >= limit) return out
      }
    }
  }
  return out.slice(0, limit)
}

export function categoryCounts() {
  if (!cache) return {}
  const out = {}
  for (const cat of CATEGORIES) {
    if (!cache[cat]) continue
    out[cat] = cat === 'skins'
      ? Object.values(cache.skins).reduce((a, m) => a + Object.keys(m).length, 0)
      : Object.keys(cache[cat]).length
  }
  return out
}

export function imageFor(weaponId, paint) {
  const key = paint === 0 ? 'null' : String(paint)
  const entry = cache?.skins?.[String(weaponId)]?.[key]
  return entry?.image || null
}
