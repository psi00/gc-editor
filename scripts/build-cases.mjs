// build-once case index: which case a skin drops from.
//
// bymykel's inventory.json has no case membership, so this reads the local
// items_game.txt instead: crate items name their loot lists, the loot lists
// name a paint kit + weapon, and the schema cache supplies the case display
// name. run `npm run build-cases` after fetching the schema; the result lands
// in data/cases.json (gitignored, same as the other caches).
import fs from 'node:fs'
import path from 'node:path'
import { parseVdf } from '../server/vdf.js'
import { resolvePaths } from '../server/paths.js'

const paths = resolvePaths(process.env.CSGO_LEGACY_DIR)
if (!paths.itemsGameTxt || !fs.existsSync(paths.itemsGameTxt)) {
  console.error('items_game.txt not found - set CSGO_LEGACY_DIR or install the csgo legacy game dir')
  process.exit(1)
}

// items_game.txt repeats whole top-level sections as Valve patches the file,
// and parseVdf keeps only the last one, so merge every copy at depth 1.
function readSections(text, wanted) {
  const found = []
  const stack = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      let key = ''
      while (j < text.length && text[j] !== '"') key += text[j++]
      let k = j + 1
      while (k < text.length && /\s/.test(text[k])) k++
      if (text[k] === '{') {
        stack.push({ key, bodyStart: k })
        i = k + 1
        continue
      }
      i = j + 1
      continue
    }
    if (c === '}' && stack.length) {
      const top = stack.pop()
      if (stack.length === 1 && wanted.has(top.key)) {
        found.push({ key: top.key, inner: text.slice(top.bodyStart + 1, i) })
      }
      i++
      continue
    }
    i++
  }
  return found
}

const sections = { items: {}, client_loot_lists: {}, paint_kits: {} }
const itemGame = fs.readFileSync(paths.itemsGameTxt, 'utf8')
for (const section of readSections(itemGame, new Set(Object.keys(sections)))) {
  Object.assign(sections[section.key], parseVdf(section.inner))
}

const paintByName = new Map()
for (const [index, kit] of Object.entries(sections.paint_kits)) {
  if (kit && typeof kit === 'object' && kit.name) paintByName.set(kit.name, Number(index))
}

const defByName = new Map()
for (const [def, item] of Object.entries(sections.items)) {
  if (item && typeof item === 'object' && typeof item.name === 'string') defByName.set(item.name, Number(def))
}

const cache = fs.existsSync(paths.schemaCache)
  ? JSON.parse(fs.readFileSync(paths.schemaCache, 'utf8'))
  : {}
const crateNames = cache.crates || {}
const lootListNames = Object.keys(sections.client_loot_lists)

const cases = {}
let mapped = 0
for (const [def, crate] of Object.entries(sections.items)) {
  if (!crate || typeof crate !== 'object' || typeof crate.name !== 'string' || !crate.name.startsWith('crate_')) continue
  const explicit = crate.loot_list_name || crate.attributes?.loot_list_name
  // the loot lists for a case are "<crate name>" plus its rarity tiers.
  const lists = explicit
    ? [explicit]
    : lootListNames.filter((name) => name === crate.name || name.startsWith(`${crate.name}_`))
  if (lists.length === 0) continue
  const label = crateNames[def]?.name || crate.item_name?.replace(/^#CSGO_/, '') || crate.name
  let added = 0
  for (const list of lists) {
    for (const entry of Object.keys(sections.client_loot_lists[list] || {})) {
      const match = entry.match(/^\[([^\]]+)\](weapon_[a-z0-9_]+)$/i)
      if (!match) continue
      const paint = paintByName.get(match[1])
      const weaponDef = defByName.get(match[2])
      if (paint == null || weaponDef == null) continue
      const key = `${weaponDef}:${paint}`
      if (cases[key]) continue
      cases[key] = label
      added++
    }
  }
  if (added > 0) mapped++
}

const output = {
  generated_at: new Date().toISOString(),
  source: paths.itemsGameTxt,
  note: 'skin key "<weapon def>:<paint>" -> case that drops it',
  cases,
}
fs.mkdirSync(paths.dataDir, { recursive: true })
fs.writeFileSync(path.join(paths.dataDir, 'cases.json'), JSON.stringify(output))
console.log(`wrote data/cases.json - ${mapped} cases, ${Object.keys(cases).length} skins`)
