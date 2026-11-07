// inventory.txt model: parse/validate/serialize + backup + atomic write.
import fs from 'node:fs'
import path from 'node:path'
import { parseVdf, parseVdfDetailed, serializeVdf } from './vdf.js'

export function parseInventory(text) {
  if (!text || !text.trim()) return { items: [], default_equips: {}, skipped: 0 }
  const { root, skipped } = parseVdfDetailed(text)
  const itemsObj = root.items && typeof root.items === 'object' ? root.items : {}
  const equipsObj = root.default_equips && typeof root.default_equips === 'object' ? root.default_equips : {}
  const items = []
  for (const [idStr, o] of Object.entries(itemsObj)) {
    const id = Number(idStr)
    if (!Number.isInteger(id)) throw new Error(`invalid item key ${idStr}`)
    items.push({
      id,
      inventory: num(o.inventory, 'inventory'),
      def_index: num(o.def_index, 'def_index'),
      level: num(o.level ?? '1', 'level'),
      quality: num(o.quality ?? '3', 'quality'),
      flags: num(o.flags ?? '0', 'flags'),
      origin: num(o.origin ?? '24', 'origin'),
      in_use: num(o.in_use ?? '0', 'in_use'),
      rarity: num(o.rarity ?? '1', 'rarity'),
      custom_name: typeof o.custom_name === 'string' ? o.custom_name : undefined,
      attributes: o.attributes && typeof o.attributes === 'object' ? { ...o.attributes } : {},
      equipped_state: o.equipped_state && typeof o.equipped_state === 'object' ? { ...o.equipped_state } : {},
      __raw: o,
    })
  }
  items.sort((a, b) => a.id - b.id)
  const default_equips = {}
  for (const [k, v] of Object.entries(equipsObj)) {
    default_equips[k] = { class_id: Number(v.class_id), slot_id: Number(v.slot_id) }
  }
  return { items, default_equips, skipped }
}

function num(v, name) {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`invalid value for '${name}': ${v}`)
  return Math.trunc(n)
}

export function serializeInventory(inv, existingText = '') {
  // Preserve unknown top-level sections (format_version, player_state, ...)
  // and unknown per-item fields when rewriting items/default_equips.
  const base = existingText ? parseVdf(existingText) : {}
  const existingItems = base.items && typeof base.items === 'object' ? base.items : {}
  const itemsObj = {}
  for (const it of inv.items) {
    const rawItem = (it.__raw && typeof it.__raw === 'object')
      ? it.__raw
      : (existingItems[String(it.id)] && typeof existingItems[String(it.id)] === 'object' ? existingItems[String(it.id)] : null)
    const o = rawItem ? { ...rawItem } : {}
    o.inventory = String(it.inventory)
    o.def_index = String(it.def_index)
    o.level = String(it.level ?? 1)
    o.quality = String(it.quality ?? 3)
    o.flags = String(it.flags ?? 0)
    o.origin = String(it.origin ?? 24)
    if (it.custom_name) o.custom_name = it.custom_name
    else delete o.custom_name
    o.in_use = String(it.in_use ?? 0)
    o.rarity = String(it.rarity ?? 1)
    if (it.attributes && Object.keys(it.attributes).length) o.attributes = { ...it.attributes }
    else if (rawItem && Object.prototype.hasOwnProperty.call(rawItem, 'attributes')) o.attributes = {}
    else delete o.attributes
    if (it.equipped_state && Object.keys(it.equipped_state).length) o.equipped_state = { ...it.equipped_state }
    else if (rawItem && Object.prototype.hasOwnProperty.call(rawItem, 'equipped_state')) o.equipped_state = {}
    else delete o.equipped_state
    itemsObj[String(it.id)] = o
  }
  const root = { ...base, items: itemsObj }
  if (inv.default_equips && Object.keys(inv.default_equips).length) {
    const eq = {}
    for (const [k, v] of Object.entries(inv.default_equips)) {
      eq[k] = { class_id: String(v.class_id), slot_id: String(v.slot_id) }
    }
    root.default_equips = eq
  } else {
    delete root.default_equips
  }
  return serializeVdf(root)
}

export function validateInventory(inv) {
  const warnings = []
  if (inv.skipped > 0) {
    warnings.push(`${inv.skipped} line${inv.skipped === 1 ? '' : 's'} could not be parsed; saving will discard them`)
  }
  const seenInv = new Set()
  for (const it of inv.items) {
    if (seenInv.has(it.inventory)) warnings.push(`duplicate inventory slot ${it.inventory} (id ${it.id})`)
    seenInv.add(it.inventory)
    if (!it.def_index) warnings.push(`item ${it.id} missing def_index`)
    for (const [k, v] of Object.entries(it.attributes || {})) {
      if (!/^\d+$/.test(k)) warnings.push(`item ${it.id} bad attribute key ${k}`)
      if (v === '' || v == null) warnings.push(`item ${it.id} empty attribute ${k}`)
    }
  }
  return warnings
}

export const MAX_BACKUPS = 20

function scanBackups(filePath) {
  if (!filePath) return []
  const dir = path.dirname(filePath)
  const prefix = `${path.basename(filePath)}.`
  if (!fs.existsSync(dir)) return []
  const backups = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith('.bak')) continue
    const file = path.join(dir, name)
    const match = name.slice(prefix.length, -'.bak'.length).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/)
    const stamped = match ? `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z` : ''
    let stat = null
    try { stat = fs.statSync(file) } catch { /* vanished */ }
    const mtime = stat ? stat.mtime.toISOString() : ''
    const time = Number.isNaN(Date.parse(stamped)) ? mtime : stamped
    backups.push({ name, file, time, size: stat ? stat.size : null, mtime })
  }
  backups.sort((a, b) => String(b.time).localeCompare(String(a.time)))
  return backups
}

/** Delete timestamped copies past the newest `keep` count. */
export function pruneInventoryBackups(filePath, keep = MAX_BACKUPS) {
  for (const backup of scanBackups(filePath).slice(Math.max(0, keep))) {
    try { fs.unlinkSync(backup.file) } catch { /* best effort */ }
  }
}

export function countInventoryBackup(filePath) {
  try {
    return parseInventory(fs.readFileSync(filePath, 'utf8')).items.length
  } catch {
    return null
  }
}

export function writeInventoryAtomic(filePath, content) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  // backup
  if (fs.existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const bak = `${filePath}.${stamp}.bak`
    fs.copyFileSync(filePath, bak)
    pruneInventoryBackups(filePath)
  }
  const tmp = `${filePath}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, content, 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, filePath)
}

// Timestamped copies live next to inventory.txt as `<name>.<iso-timestamp>.bak`.
// Counts are filled only on demand; listing stays a stat-only scan.
export function listInventoryBackups(filePath, limit = 100) {
  return scanBackups(filePath)
    .slice(0, limit)
    .map(({ name, file, time, size, mtime }) => ({ name, file, time, size, mtime, count: null }))
}
