// Turns a give_item description into inventory.txt items. This is the offline
// counterpart of `buildGiveCommand` in server/rcon.js: keep the attribute ids in
// sync with the domain notes in AGENTS.md.

import type { GiveItem, InvItem } from './app-types'

const STICKER_BASE = 113
const DEFAULT_QUALITY = 4

export function buildInventoryItems(give: GiveItem, existing: InvItem[]): InvItem[] {
  const count = Math.max(1, Math.trunc(give.count ?? 1))
  let nextId = existing.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let nextSlot = existing.reduce((max, item) => Math.max(max, item.inventory), 0) + 1

  const attributes: Record<string, string> = {}
  if (give.paint != null) attributes['6'] = String(Math.trunc(give.paint))
  if (give.seed != null) attributes['7'] = String(Math.trunc(give.seed))
  if (give.wear != null) attributes['8'] = Number(give.wear).toFixed(6)
  if (give.stattrak != null) {
    attributes['80'] = String(Math.trunc(give.stattrak))
    attributes['81'] = '1'
  }
  if (give.name?.trim()) attributes['111'] = give.name
  if (give.music != null) attributes['166'] = String(Math.trunc(give.music))
  if (give.keychain != null) {
    attributes['299'] = String(Math.trunc(give.keychain))
    attributes['300'] = '0.000000'
    attributes['301'] = '0.000000'
    attributes['302'] = '0.000000'
  }
  give.stickers?.forEach((sticker, index) => {
    if (!sticker) return
    const base = STICKER_BASE + index * 4
    attributes[String(base)] = String(Math.trunc(sticker.id))
    if (sticker.wear != null) attributes[String(base + 1)] = String(sticker.wear)
    if (sticker.scale != null) attributes[String(base + 2)] = String(sticker.scale)
    if (sticker.rotation != null) attributes[String(base + 3)] = String(sticker.rotation)
  })

  const quality = give.quality ?? (give.stattrak != null ? 9 : DEFAULT_QUALITY)

  return Array.from({ length: count }, () => ({
    id: nextId++,
    inventory: nextSlot++,
    def_index: give.def_index,
    level: 1,
    quality,
    flags: 0,
    origin: 24,
    in_use: 0,
    rarity: give.rarity ?? 1,
    attributes: { ...attributes },
    equipped_state: {},
  }))
}
