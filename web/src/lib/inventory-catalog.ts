// Maps inventory items (def_index + paint/music attributes) to human names and
// local artwork. This is display-only: nothing here is written back to disk.
//
// The schema cache is keyed in three different ways, so resolution order matters:
//   1. skins     -> keyed by weapon def_index, then paint
//   2. music     -> keyed by music id (def 1314 stores the id in attribute 166)
//   3. categories-> keyed by their own def_index / sticker id namespace
// Category ids can collide across categories (a sticker id can equal another
// item's def_index), so the first category in CATEGORY_ORDER wins and skins are
// always resolved first.

import { api } from './api'
import { categoryImage, isGloveDef, skinImage, type Rarity, type Weapon } from './catalog'
import type { InvItem } from './app-types'

export type ResolvedInventory = {
  name: string
  image: string | null
  rarity?: Rarity
  category?: string
  paint?: number
  isSkin: boolean
  isWeapon: boolean
  isGlove: boolean
  isMusic: boolean
}

type SkinEntry = { name: string; rarity?: Rarity }
type CategoryEntry = { name: string; rarity?: Rarity; cat: string }
type CategoryIndex = { byDef: Map<string, CategoryEntry>; music: Map<string, CategoryEntry> }

const CATEGORY_ORDER = ['agents', 'collectibles', 'tools', 'crates', 'keys', 'patches', 'stickers', 'graffiti']

const skinCache = new Map<number, Promise<Map<string, SkinEntry>>>()
let categoryCache: Promise<CategoryIndex> | null = null

function loadSkins(defIndex: number) {
  let pending = skinCache.get(defIndex)
  if (!pending) {
    pending = api(`/api/schema/skins/${defIndex}`)
      .then((response) => {
        const map = new Map<string, SkinEntry>()
        for (const skin of Array.isArray(response.skins) ? response.skins : []) {
          map.set(String(skin.paint), { name: String(skin.name), rarity: skin.rarity })
        }
        return map
      })
      .catch(() => new Map<string, SkinEntry>())
    skinCache.set(defIndex, pending)
  }
  return pending
}

function loadCategories(): Promise<CategoryIndex> {
  if (!categoryCache) {
    const cats = [...CATEGORY_ORDER, 'music_kits']
    categoryCache = Promise.all(cats.map(async (cat) => {
      try {
        const response = await api(`/api/schema/category/${cat}?limit=500`)
        return { cat, items: Array.isArray(response.items) ? response.items : [] }
      } catch {
        return { cat, items: [] as { def_index: string; name: string; rarity?: Rarity }[] }
      }
    })).then((results) => {
      const byDef = new Map<string, CategoryEntry>()
      const music = new Map<string, CategoryEntry>()
      for (const { cat, items } of results) {
        for (const item of items) {
          const entry: CategoryEntry = { name: String(item.name), rarity: item.rarity, cat }
          if (cat === 'music_kits') music.set(String(item.def_index), entry)
          else if (!byDef.has(String(item.def_index))) byDef.set(String(item.def_index), entry)
        }
      }
      return { byDef, music }
    })
  }
  return categoryCache
}

/** Exact lookup for ids the capped bulk category fetch did not include. */
async function searchExact(defIndex: number): Promise<CategoryEntry | null> {
  const hits = await Promise.all(CATEGORY_ORDER.map(async (cat) => {
    try {
      const response = await api(`/api/schema/category/${cat}?limit=20&q=${defIndex}`)
      const item = (Array.isArray(response.items) ? response.items : [])
        .find((entry: { def_index: string }) => String(entry.def_index) === String(defIndex))
      return item ? { name: String(item.name), rarity: item.rarity, cat } : null
    } catch {
      return null
    }
  }))
  return hits.find(Boolean) ?? null
}

export function itemKey(item: InvItem) {
  const paint = item.attributes?.['6'] != null ? String(Math.trunc(Number(item.attributes['6']))) : ''
  const music = item.attributes?.['166'] ?? ''
  return `${item.def_index}:${paint}:${music}`
}

export function itemPaint(item: InvItem) {
  const raw = item.attributes?.['6']
  if (raw == null || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * The GC writes a name tag as attribute 111; older/other formats may use the
 * item-level `custom_name` field. Prefer the field when present.
 */
export function itemNameTag(item: InvItem) {
  const field = item.custom_name?.trim()
  if (field) return field
  return item.attributes?.['111']?.trim() ?? ''
}

export async function resolveInventory(items: InvItem[], weapons: Weapon[]) {
  const weaponDefs = new Set(weapons.map((weapon) => weapon.def_index))
  const needsSkins = new Set<number>()
  for (const item of items) {
    if (weaponDefs.has(item.def_index) || isGloveDef(item.def_index) || item.attributes?.['6'] != null) {
      needsSkins.add(item.def_index)
    }
  }

  const defs = [...needsSkins]
  const [categories, ...skinMaps] = await Promise.all([loadCategories(), ...defs.map(loadSkins)])
  const skinsByDef = new Map<number, Map<string, SkinEntry>>()
  defs.forEach((def, index) => skinsByDef.set(def, skinMaps[index]))

  const resolved = new Map<string, ResolvedInventory>()
  const unresolved: InvItem[] = []

  for (const item of items) {
    const key = itemKey(item)
    if (resolved.has(key)) continue

    const paint = itemPaint(item)
    const musicId = item.attributes?.['166']
    let entry: ResolvedInventory | null = null

    if (item.def_index === 1314 && musicId) {
      const music = categories.music.get(String(musicId))
      if (music) {
        entry = {
          name: music.name,
          image: `/imgs/music_kits/${musicId}.png`,
          rarity: music.rarity,
          category: 'music_kits',
          isSkin: false,
          isWeapon: false,
          isGlove: false,
          isMusic: true,
        }
      }
    }

    if (!entry) {
      const skins = skinsByDef.get(item.def_index)
      const skin = paint != null ? skins?.get(String(paint)) : skins?.get('0')
      if (skin) {
        entry = {
          name: skin.name,
          image: skinImage(item.def_index, paint ?? 0),
          rarity: skin.rarity,
          paint: paint ?? 0,
          isSkin: paint != null && paint > 0,
          isWeapon: weaponDefs.has(item.def_index) || isGloveDef(item.def_index) || paint != null,
          isGlove: isGloveDef(item.def_index),
          isMusic: false,
        }
      }
    }

    if (!entry) {
      const category = categories.byDef.get(String(item.def_index))
      if (category) {
        entry = {
          name: category.name,
          image: categoryImage(category.cat, item.def_index),
          rarity: category.rarity,
          category: category.cat,
          isSkin: false,
          isWeapon: weaponDefs.has(item.def_index),
          isGlove: isGloveDef(item.def_index),
          isMusic: false,
        }
      }
    }

    if (entry) resolved.set(key, entry)
    else unresolved.push(item)
  }

  if (unresolved.length > 0) {
    const missingDefs = [...new Set(unresolved.map((item) => item.def_index))]
    const found = new Map<number, CategoryEntry | null>()
    await Promise.all(missingDefs.map(async (def) => { found.set(def, await searchExact(def)) }))
    for (const item of unresolved) {
      const key = itemKey(item)
      if (resolved.has(key)) continue
      const category = found.get(item.def_index)
      if (category) {
        resolved.set(key, {
          name: category.name,
          image: categoryImage(category.cat, item.def_index),
          rarity: category.rarity,
          category: category.cat,
          isSkin: false,
          isWeapon: false,
          isGlove: isGloveDef(item.def_index),
          isMusic: false,
        })
      }
    }
  }

  return resolved
}
