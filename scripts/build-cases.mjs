// build-once case + collection index: where a skin comes from.
//
// CS:GO: bymykel's inventory has no case membership, so this reads the local
// items_game.txt: crate items name their loot lists, the loot lists name a paint
// kit + weapon, and the schema cache supplies the case display name. Collections
// come from item_sets, whose display names are tokens resolved against
// csgo_english.txt.
//
// CS2: items_game.txt ships inside the pak01 VPKs, so membership comes from the
// trimmed crates/collections copies that `fetch-schema` writes to
// data/cs2/upstream. Matching uses the skin name + paint index from the cache.
//
// run `npm run build-cases` after fetching the schema. Pass `--game=csgo|cs2` to
// build one game. Result: data/cases.json and data/cs2/cases.json (gitignored).
import fs from 'node:fs'
import path from 'node:path'
import { parseVdf } from '../server/vdf.js'
import { resolvePaths } from '../server/paths.js'
import { GAMES, normalizeGame } from '../server/games.js'

const hints = { csgo: process.env.CSGO_LEGACY_DIR || null, cs2: process.env.CS2_DIR || null }
const gameArg = (process.argv.find((a) => a.startsWith('--game=')) || '').split('=')[1]
const GAMES_TO_BUILD = gameArg ? [normalizeGame(gameArg)] : GAMES

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

// csgo_english.txt ships as UTF-16LE with a BOM.
function readText(file) {
  const buf = fs.readFileSync(file)
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf).swap16().toString('utf16le')
  return buf.toString('utf8')
}

function writeIndex(paths, cases, collections, note, extra = {}) {
  const output = {
    generated_at: new Date().toISOString(),
    game: paths.game,
    ...extra,
    note,
    cases,
    collections,
  }
  fs.mkdirSync(paths.dataDir, { recursive: true })
  fs.writeFileSync(paths.casesCache, JSON.stringify(output))
}

function buildCsgo(paths) {
  if (!paths.itemsGameTxt || !fs.existsSync(paths.itemsGameTxt)) {
    console.error('csgo: items_game.txt not found - set CSGO_LEGACY_DIR or install the csgo legacy game dir')
    return false
  }

  const tokens = {}
  if (paths.csgoEnglishTxt && fs.existsSync(paths.csgoEnglishTxt)) {
    const tokenRe = /^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"\s*$/gm
    const english = readText(paths.csgoEnglishTxt)
    let token
    while ((token = tokenRe.exec(english))) tokens[token[1]] = token[2]
  }

  // "#CSGO_set_dust_2_2021" -> "The 2021 Dust 2 Collection"; fall back to the
  // set key when the token is missing, so the index never needs the token file.
  function setLabel(set, setKey) {
    const token = typeof set.name === 'string' ? set.name.replace(/^#/, '') : ''
    if (token && tokens[token]) return tokens[token]
    return setKey
      .replace(/^set_/, '')
      .split('_')
      .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ')
  }

  const sections = { items: {}, client_loot_lists: {}, paint_kits: {}, item_sets: {} }
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

  // item_sets list every collection skin directly; a skin can be in both a case
  // and a collection, so this stays a separate map.
  const collections = {}
  let setCount = 0
  for (const [setKey, set] of Object.entries(sections.item_sets)) {
    if (!set || typeof set !== 'object' || !set.items || typeof set.items !== 'object') continue
    if (String(set.is_collection ?? '') !== '1') continue
    const label = setLabel(set, setKey)
    let added = 0
    for (const entry of Object.keys(set.items)) {
      const match = entry.match(/^\[([^\]]+)\](weapon_[a-z0-9_]+)$/i)
      if (!match) continue
      const paint = paintByName.get(match[1])
      const weaponDef = defByName.get(match[2])
      if (paint == null || weaponDef == null) continue
      const key = `${weaponDef}:${paint}`
      if (collections[key]) continue
      collections[key] = label
      added++
    }
    if (added > 0) setCount++
  }

  writeIndex(
    paths,
    cases,
    collections,
    'skin key "<weapon def>:<paint>" -> case that drops it, or collection it belongs to',
    { source: paths.itemsGameTxt },
  )
  console.log(`csgo: wrote data/cases.json - ${mapped} cases, ${Object.keys(cases).length} skins; ${setCount} collections, ${Object.keys(collections).length} skins`)
  return true
}

// name + paint -> "<def>:<paint>" for every skin in the cached catalogue.
function skinLookup(cache) {
  const byName = new Map()
  const byNamePaint = new Map()
  const add = (key, name, paint) => {
    if (!name) return
    const lower = String(name).toLowerCase()
    if (!byName.has(lower)) byName.set(lower, key)
    byNamePaint.set(`${lower}|${paint}`, key)
  }
  for (const [weaponId, paints] of Object.entries(cache.skins || {})) {
    for (const [paintIdx, skin] of Object.entries(paints || {})) {
      const paint = paintIdx === 'null' ? 0 : Number(paintIdx)
      add(`${Number(weaponId)}:${paint}`, skin?.name, paint)
    }
  }
  return { byName, byNamePaint }
}

function buildCs2(paths) {
  const upstreamDir = path.join(paths.dataDir, 'upstream')
  const cratesFile = path.join(upstreamDir, 'crates.json')
  const collectionsFile = path.join(upstreamDir, 'collections.json')
  if (!fs.existsSync(paths.schemaCache) || !fs.existsSync(cratesFile) || !fs.existsSync(collectionsFile)) {
    console.error('cs2: missing cache or upstream case data - run npm run fetch-schema -- --game=cs2 first')
    return false
  }

  const cache = JSON.parse(fs.readFileSync(paths.schemaCache, 'utf8'))
  const crates = JSON.parse(fs.readFileSync(cratesFile, 'utf8'))
  const collectionSources = JSON.parse(fs.readFileSync(collectionsFile, 'utf8'))
  const { byName, byNamePaint } = skinLookup(cache)

  const keyFor = (entry) => {
    const paint = entry.paint_index == null ? 0 : Number(entry.paint_index)
    const name = String(entry.name || '').toLowerCase()
    return byNamePaint.get(`${name}|${paint}`) ?? byName.get(name) ?? null
  }

  const cases = {}
  let mapped = 0
  for (const crate of crates) {
    if (!crate?.name) continue
    let added = 0
    for (const entry of [...(crate.contains || []), ...(crate.contains_rare || [])]) {
      const key = keyFor(entry)
      if (!key || cases[key]) continue
      cases[key] = crate.name
      added++
    }
    if (added > 0) mapped++
  }

  const collections = {}
  let setCount = 0
  for (const collection of collectionSources) {
    if (!collection?.name) continue
    let added = 0
    for (const entry of collection.contains || []) {
      const key = keyFor(entry)
      if (!key || collections[key]) continue
      collections[key] = collection.name
      added++
    }
    if (added > 0) setCount++
  }

  writeIndex(
    paths,
    cases,
    collections,
    'skin key "<weapon def>:<paint>" -> case that drops it, or collection it belongs to',
    { source: `${upstreamDir} (bymykel crates + collections)` },
  )
  console.log(`cs2: wrote data/cs2/cases.json - ${mapped} cases, ${Object.keys(cases).length} skins; ${setCount} collections, ${Object.keys(collections).length} skins`)
  return true
}

let built = 0
for (const game of GAMES_TO_BUILD) {
  const paths = resolvePaths(game, hints)
  const ok = game === 'csgo' ? buildCsgo(paths) : buildCs2(paths)
  if (ok) built++
}
if (built === 0) process.exit(1)
