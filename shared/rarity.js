// Maps BYMyKel schema rarity names/ids to the GT-610 csgo_gc Rarity enum.
// Keep this in sync with csgo_gc/item_schema.h and item_schema.cpp.
const ID_TIERS = {
  default: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  mythical: 4,
  legendary: 5,
  ancient: 6,
  immortal: 7,
  contraband: 7,
  unusual: 99,
}

const NAME_TIERS = {
  Default: 0,
  'Consumer Grade': 1,
  'Base Grade': 1,
  'Highlight Base Grade': 1,
  'Industrial Grade': 2,
  'Mil-Spec Grade': 3,
  'High Grade': 3,
  Distinguished: 3,
  Restricted: 4,
  Remarkable: 4,
  Exceptional: 4,
  Classified: 5,
  Exotic: 5,
  Superior: 5,
  Covert: 6,
  Extraordinary: 6,
  Master: 6,
  Contraband: 7,
  Unusual: 99,
}

const CATEGORY_SUFFIXES = ['_weapon', '_character', '_highlight']

/**
 * Returns the GT-610 Rarity tier, or null when the rarity is unknown.
 * Callers should fall back to 1 rather than hiding an unmapped schema rarity.
 */
export function rarityTier(name, id) {
  const rawId = typeof id === 'string' ? id.trim().toLowerCase() : ''
  if (rawId) {
    let key = rawId.startsWith('rarity_') ? rawId.slice('rarity_'.length) : rawId
    for (const suffix of CATEGORY_SUFFIXES) {
      if (key.endsWith(suffix)) {
        key = key.slice(0, -suffix.length)
        break
      }
    }
    if (Object.hasOwn(ID_TIERS, key)) return ID_TIERS[key]
  }

  const rawName = typeof name === 'string' ? name.trim() : ''
  if (rawName && Object.hasOwn(NAME_TIERS, rawName)) return NAME_TIERS[rawName]
  return null
}
