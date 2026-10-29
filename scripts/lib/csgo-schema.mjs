// CS:GO item boundary for the schema cache.
//
// The catalog is fetched from ByMykel/CSGO-API, which tracks CS2 today. This
// whitelist keeps only ids that exist in the final CS:GO build, using the
// archived items_game.txt from SteamDatabase/GameTracking-CSGO (2023-08-18,
// the last snapshot that still shipped the file) plus two final-build
// supplements verified against the local legacy install.
//
// The whitelist is committed so `fetch-schema` does not need the game
// installed. Regenerate scripts/csgo-whitelist.json only if the source
// changes; CS:GO is frozen.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WHITELIST_PATH = path.join(here, '..', 'csgo-whitelist.json')

const ITEM_CATEGORIES = ['crates', 'collectibles', 'keys', 'agents', 'patches']
const STICKER_CATEGORIES = ['stickers']
const MUSIC_CATEGORIES = ['music_kits']
const TOOL_CATEGORY = 'tools'

export function loadWhitelist(file = WHITELIST_PATH) {
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
  const sets = {
    paint: new Set((meta.paint_kits || []).map(Number)),
    items: new Set((meta.items || []).map(Number)),
    stickers: new Set((meta.sticker_kits || []).map(Number)),
    music: new Set((meta.music_defs || []).map(Number)),
    tools: new Set((meta.tools || []).map(Number)),
  }

  const targetFor = (section) => ({
    paint_kits: sets.paint,
    items: sets.items,
    sticker_kits: sets.stickers,
    music_defs: sets.music,
  })[section]

  for (const supplement of meta.supplements || []) {
    const target = targetFor(supplement.section)
    if (target) target.add(Number(supplement.id))
  }

  return { meta, sets }
}

export function filterInventory(inventory, whitelist) {
  const { meta, sets } = whitelist
  const drop = new Set(meta.drop_categories || [])
  const stats = {
    skins: { weaponsBefore: 0, weaponsAfter: 0, kept: 0, dropped: 0, vanilla: 0 },
    categories: {},
    droppedCategories: [...drop],
  }
  const out = {}

  for (const [key, value] of Object.entries(inventory)) {
    if (key === 'skins') {
      const skins = {}
      const weaponsBefore = Object.keys(value || {}).length
      for (const [weaponId, paints] of Object.entries(value || {})) {
        const keptPaints = {}
        for (const [paintId, skin] of Object.entries(paints || {})) {
          if (paintId === 'null') { keptPaints[paintId] = skin; stats.skins.vanilla++; stats.skins.kept++; continue }
          if (sets.paint.has(Number(paintId))) { keptPaints[paintId] = skin; stats.skins.kept++ }
          else stats.skins.dropped++
        }
        if (Object.keys(keptPaints).length) skins[weaponId] = keptPaints
      }
      stats.skins.weaponsBefore = weaponsBefore
      stats.skins.weaponsAfter = Object.keys(skins).length
      out.skins = skins
      continue
    }

    if (drop.has(key)) {
      stats.categories[key] = { before: Object.keys(value || {}).length, after: 0, dropped: Object.keys(value || {}).length, reason: 'CS2-only category' }
      continue
    }

    const set = ITEM_CATEGORIES.includes(key) ? sets.items
      : STICKER_CATEGORIES.includes(key) ? sets.stickers
        : MUSIC_CATEGORIES.includes(key) ? sets.music
          : key === TOOL_CATEGORY ? sets.tools
            : null

    if (!set) {
      out[key] = value
      const count = Object.keys(value || {}).length
      stats.categories[key] = { before: count, after: count, dropped: 0, reason: 'not filtered (no CS:GO id namespace)' }
      continue
    }

    const kept = {}
    for (const [id, entry] of Object.entries(value || {})) {
      if (set.has(Number(id))) kept[id] = entry
    }
    out[key] = kept
    stats.categories[key] = {
      before: Object.keys(value || {}).length,
      after: Object.keys(kept).length,
      dropped: Object.keys(value || {}).length - Object.keys(kept).length,
    }
  }

  return { inventory: out, stats }
}

export function filterSource(meta) {
  return {
    source: meta.source,
    commit: meta.commit,
    commit_date: meta.commit_date,
    sha256: meta.sha256,
  }
}
