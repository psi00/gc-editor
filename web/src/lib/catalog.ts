// Schema classification + display helpers. All of these are UI-only:
// the server stays the source of truth for the give command.

export type Weapon = { def_index: number; name: string; thumb?: string }
export type Rarity = { id?: string; name: string; color: string }
export type Skin = { paint: number; name: string; rarity?: Rarity; image?: string; case?: string | null }
export type CategoryItem = { def_index: string; name: string; rarity?: Rarity; image?: string }

export type Kind =
  | 'all'
  | 'skins'
  | 'knives'
  | 'gloves'
  | 'stickers'
  | 'agents'
  | 'cases'
  | 'keys'
  | 'music'
  | 'raw'

export const KINDS: { id: Kind; label: string; category?: string }[] = [
  { id: 'skins', label: 'Skins' },
  { id: 'knives', label: 'Knives' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'stickers', label: 'Stickers', category: 'stickers' },
  { id: 'agents', label: 'Agents', category: 'agents' },
  { id: 'cases', label: 'Cases', category: 'crates' },
  { id: 'keys', label: 'Keys', category: 'keys' },
  { id: 'music', label: 'Music', category: 'music_kits' },
  { id: 'raw', label: 'Manual' },
]

/** The one tab set both Live and Gallery use, so positions never shift. */
export const BROWSE_TABS: { id: Exclude<Kind, 'raw'>; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'skins', label: 'Skins' },
  { id: 'knives', label: 'Knives' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'agents', label: 'Agents' },
  { id: 'cases', label: 'Cases' },
  { id: 'keys', label: 'Keys' },
  { id: 'music', label: 'Music' },
]

export const GLOVE_DEFS = [4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035]

export const KNIFE_RE = /knife|bayonet|karambit|dagger|kukri|stiletto|ursus|navaja|talon|skeleton|survival|paracord|classic|falchion|bowie|gut|flip|huntsman|\bm9\b/i
export const CT_RE = /swat|fbi|seal|gendarmerie|tacp|nsw|cmdr|lieutenant|soldier|operative|police/i
export const T_RE = /professional|phoenix|elite|pirate|anarchist|leet|revolution|jackal|vyp|pogruz|guerilla|fennec|jungle|rekwir|derguz|dragomir|veteran/i

export function isGloveDef(defIndex: number) {
  return GLOVE_DEFS.includes(Number(defIndex))
}

// Knives occupy def 500-526; the glove defs sit in that range too.
export function isKnifeDef(defIndex: number) {
  const def = Number(defIndex)
  return def >= 500 && def <= 526 && !isGloveDef(def)
}

export function isGloveWeapon(w: Weapon) {
  return isGloveDef(w.def_index) || /glove|hand wraps/i.test(w.name)
}

export function isKnifeWeapon(w: Weapon) {
  if (isGloveDef(w.def_index)) return false
  if (/glove|hand wraps/i.test(w.name)) return false
  return KNIFE_RE.test(w.name) || (w.def_index >= 500 && w.def_index < 530)
}

export function isGunWeapon(w: Weapon) {
  return !isGloveWeapon(w) && !isKnifeWeapon(w)
}

export function isSkinKind(kind: Kind) {
  return kind === 'skins' || kind === 'knives' || kind === 'gloves'
}

export function categoryForKind(kind: Kind): string | null {
  return KINDS.find((k) => k.id === kind)?.category ?? null
}

export function skinImage(weaponId: number, paint: number) {
  return `/imgs/skins/${weaponId}_${paint}.png`
}

export function categoryImage(category: string, defIndex: string | number) {
  return `/imgs/${category}/${defIndex}.png`
}

export type Quality = 'all' | 'normal' | 'stattrak' | 'souvenir'

export function qualityOf(name: string): Exclude<Quality, 'all'> {
  if (/^stattrak/i.test(name)) return 'stattrak'
  if (/^souvenir/i.test(name)) return 'souvenir'
  return 'normal'
}

export function qualityBadge(name: string): { label: string; tone: 'st' | 'sv' } | null {
  const q = qualityOf(name)
  if (q === 'stattrak') return { label: 'StatTrak', tone: 'st' }
  if (q === 'souvenir') return { label: 'Souvenir', tone: 'sv' }
  return null
}

// The cache uses the full in-game grade names. Cards and pills use the shorter
// trade shorthand. Filter values still compare against the raw schema names.
const RARITY_LABELS: Record<string, string> = {
  'Consumer Grade': 'Consumer',
  'Industrial Grade': 'Industrial',
  'Mil-Spec Grade': 'Mil-Spec',
}

export function rarityLabel(name?: string | null) {
  if (!name) return undefined
  return RARITY_LABELS[name] ?? name
}

export const WEAR_PRESETS = [
  { id: 'fn', label: 'FN', value: 0.0001 },
  { id: 'mw', label: 'MW', value: 0.07 },
  { id: 'ft', label: 'FT', value: 0.15 },
  { id: 'ww', label: 'WW', value: 0.38 },
  { id: 'bs', label: 'BS', value: 0.45 },
] as const

export type WearBandId = (typeof WEAR_PRESETS)[number]['id']

const WEAR_BAND_LABELS: Record<WearBandId, string> = {
  fn: 'Factory New',
  mw: 'Minimal Wear',
  ft: 'Field-Tested',
  ww: 'Well-Worn',
  bs: 'Battle-Scarred',
}

export function wearBandId(w: number): WearBandId {
  if (w < 0.07) return 'fn'
  if (w < 0.15) return 'mw'
  if (w < 0.38) return 'ft'
  if (w < 0.45) return 'ww'
  return 'bs'
}

export function wearBand(w: number) {
  return WEAR_BAND_LABELS[wearBandId(w)]
}

export function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

/** Shortest exact representation of the 4dp wear value: 0.0001, 0.15, 1. */
export function formatWear(w: number) {
  return String(round4(w))
}

// weapon picker grouping (name lists only cover the shipped schema ids).
const GROUP_BY_NAME: Record<string, string> = {
  'ak-47': 'rifles', m4a4: 'rifles', 'm4a1-s': 'rifles', aug: 'rifles', famas: 'rifles', 'galil ar': 'rifles',
  'sg 553': 'rifles', 'ssg 08': 'rifles', awp: 'rifles', 'scar-20': 'rifles', g3sg1: 'rifles',
  'desert eagle': 'pistols', 'dual berettas': 'pistols', 'five-seven': 'pistols', 'glock-18': 'pistols',
  p2000: 'pistols', p250: 'pistols', 'tec-9': 'pistols', 'usp-s': 'pistols', 'cz75-auto': 'pistols',
  'r8 revolver': 'pistols', 'zeus x27': 'pistols',
  'mac-10': 'smgs', 'mp5-sd': 'smgs', mp7: 'smgs', mp9: 'smgs', p90: 'smgs', 'pp-bizon': 'smgs', 'ump-45': 'smgs',
  m249: 'heavy', negev: 'heavy', 'mag-7': 'heavy', nova: 'heavy', 'sawed-off': 'heavy', xm1014: 'heavy',
}

export const WEAPON_GROUP_LABELS: Record<string, string> = {
  rifles: 'Rifles',
  pistols: 'Pistols',
  smgs: 'SMGs',
  heavy: 'Heavy',
  knives: 'Knives',
  gloves: 'Gloves',
  other: 'Other',
}

export const WEAPON_GROUP_ORDER = ['rifles', 'pistols', 'smgs', 'heavy', 'knives', 'gloves', 'other']

export function weaponGroup(w: Weapon) {
  if (isGloveWeapon(w)) return 'gloves'
  if (isKnifeWeapon(w)) return 'knives'
  const plain = w.name.replace(/^[★\s]+/, '').trim().toLowerCase()
  return GROUP_BY_NAME[plain] ?? 'other'
}

export function groupWeapons(weapons: Weapon[]) {
  const groups = new Map<string, Weapon[]>()
  for (const w of weapons) {
    const key = weaponGroup(w)
    const list = groups.get(key)
    if (list) list.push(w)
    else groups.set(key, [w])
  }
  return WEAPON_GROUP_ORDER.filter((key) => groups.has(key)).map((key) => ({
    key,
    label: WEAPON_GROUP_LABELS[key] ?? key,
    weapons: groups.get(key)!,
  }))
}

export function agentMatchesTeam(name: string, team: 'ct' | 't') {
  if (team === 'ct') return CT_RE.test(name) || !T_RE.test(name)
  return T_RE.test(name)
}

export function formatClock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString()
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
