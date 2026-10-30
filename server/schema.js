// schema cache: bundled data/inventory.en.json (fetch-once) + local fallback.
// shape mirrors bymykel inventory.json trimmed to name/rarity/image per entry.
//
// Both games are loaded at once and namespaced by game id. Query helpers take
// an explicit game so a client can read CS:GO while the server default is CS2
// (Live is always CS:GO; the Gallery chooses).
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_GAME, normalizeGame } from './games.js'

const state = new Map()
let activeGame = DEFAULT_GAME

function emptyState(schemaPath) {
  return { path: schemaPath, cache: null, cases: {}, collections: {} }
}

function stateFor(game) {
  return state.get(normalizeGame(game)) || emptyState(null)
}

// Accept the old single-argument form (CS:GO path) so callers that predate the
// game split keep working.
export function loadSchema(gameOrPath, maybePath) {
  const game = maybePath == null ? DEFAULT_GAME : normalizeGame(gameOrPath)
  const schemaPath = maybePath == null ? gameOrPath : maybePath
  const entry = emptyState(schemaPath)
  try {
    if (fs.existsSync(schemaPath)) entry.cache = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  } catch {
    entry.cache = null
  }
  // optional side-car written by `npm run build-cases`: "<def>:<paint>" -> case
  // or collection name.
  try {
    const casesPath = path.join(path.dirname(schemaPath), 'cases.json')
    const raw = fs.existsSync(casesPath) ? JSON.parse(fs.readFileSync(casesPath, 'utf8')) : null
    entry.cases = raw && typeof raw.cases === 'object' ? raw.cases : {}
    entry.collections = raw && typeof raw.collections === 'object' ? raw.collections : {}
  } catch {
    entry.cases = {}
    entry.collections = {}
  }
  state.set(game, entry)
  return entry.cache
}

export function setGame(game) {
  activeGame = normalizeGame(game)
  return activeGame
}

export function getGame() { return activeGame }

export function caseForSkin(game, weaponId, paint) {
  return stateFor(game).cases[`${weaponId}:${paint}`] ?? null
}

export function collectionForSkin(game, weaponId, paint) {
  return stateFor(game).collections[`${weaponId}:${paint}`] ?? null
}

export function getSchema(game = activeGame) { return stateFor(game).cache }

export const CATEGORIES = ['skins', 'crates', 'stickers', 'agents', 'keys', 'music_kits', 'graffiti', 'patches', 'collectibles', 'tools', 'keychains', 'highlights', 'sticker_slabs']

function imagePrefix(game) {
  const key = normalizeGame(game)
  return key === 'csgo' ? '/imgs' : `/imgs/${key}`
}

function allSkins(game) {
  const cache = getSchema(game)
  if (!cache || !cache.skins) return []
  const out = []
  for (const [weaponId, paints] of Object.entries(cache.skins)) {
    for (const [paintIdx, s] of Object.entries(paints)) {
      const paint = paintIdx === 'null' ? 0 : Number(paintIdx)
      out.push({ weaponId: Number(weaponId), paint, ...s, case: caseForSkin(game, Number(weaponId), paint), collection: collectionForSkin(game, Number(weaponId), paint) })
    }
  }
  return out
}

export function searchSkins(game, q, limit = 50) {
  const needle = String(q || '').toLowerCase()
  if (!needle) return []
  return allSkins(game)
    .filter((s) => s.name && s.name.toLowerCase().includes(needle))
    .slice(0, limit)
}

export function skinsForWeapon(game, weaponId) {
  const cache = getSchema(game)
  if (!cache || !cache.skins) return []
  const m = cache.skins[String(weaponId)] || {}
  return Object.entries(m)
    .map(([paintIdx, s]) => {
      const paint = paintIdx === 'null' ? 0 : Number(paintIdx)
      return { paint, ...s, case: caseForSkin(game, Number(weaponId), paint), collection: collectionForSkin(game, Number(weaponId), paint) }
    })
    .sort((a, b) => a.paint - b.paint)
}

export function listWeapons(game, limit = 300) {
  const cache = getSchema(game)
  if (!cache || !cache.skins) return []
  const prefix = imagePrefix(game)
  const ids = Object.keys(cache.skins).map(Number).sort((a, b) => a - b)
  return ids.slice(0, limit).map((id) => {
    const paints = cache.skins[String(id)]
    const keys = Object.keys(paints || {})
    const firstKey = keys.includes('null') ? 'null' : keys.sort((a, b) => Number(a === 'null' ? 0 : a) - Number(b === 'null' ? 0 : b))[0]
    const first = firstKey != null ? paints[firstKey] : null
    const full = first ? first.name : `weapon ${id}`
    const weapon = full.includes(' | ') ? full.split(' | ')[0] : full
    const paint = firstKey === 'null' ? 0 : Number(firstKey)
    return { def_index: id, name: weapon, thumb: `${prefix}/skins/${id}_${paint}.png` }
  })
}

export function listCategory(game, cat, limit = 500, q = '') {
  const cache = getSchema(game)
  if (!cache || !cache[cat]) return []
  const needle = String(q || '').toLowerCase()
  let arr = Object.entries(cache[cat])
    .map(([id, v]) => ({ def_index: id, ...v }))
  if (needle) arr = arr.filter((it) => String(it.name || '').toLowerCase().includes(needle) || String(it.def_index).includes(needle))
  return arr
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
}

export function searchAll(game, q, limit = 50) {
  const cache = getSchema(game)
  const needle = String(q || '').toLowerCase()
  if (!needle || !cache) return []
  const out = []
  out.push(...allSkins(game).filter((s) => s.name?.toLowerCase().includes(needle)).map((s) => ({ kind: 'skin', ...s })))
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

export function categoryCounts(game) {
  const cache = getSchema(game)
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

export function imageFor(game, weaponId, paint) {
  const key = paint === 0 ? 'null' : String(paint)
  const entry = getSchema(game)?.skins?.[String(weaponId)]?.[key]
  return entry?.image || null
}
