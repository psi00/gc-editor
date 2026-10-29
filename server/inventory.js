// inventory.txt model: parse/validate/serialize + backup + atomic write.
import fs from 'node:fs'
import path from 'node:path'
import { parseVdf, serializeVdf } from './vdf.js'

export function parseInventory(text) {
  if (!text || !text.trim()) return { items: [], default_equips: {} }
  const root = parseVdf(text)
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
    })
  }
  items.sort((a, b) => a.id - b.id)
  const default_equips = {}
  for (const [k, v] of Object.entries(equipsObj)) {
    default_equips[k] = { class_id: Number(v.class_id), slot_id: Number(v.slot_id) }
  }
  return { items, default_equips }
}

function num(v, name) {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`invalid value for '${name}': ${v}`)
  return Math.trunc(n)
}

export function serializeInventory(inv, existingText = '') {
  // Preserve unknown top-level sections (format_version, player_state, ...)
  // when rewriting items/default_equips.
  const base = existingText ? parseVdf(existingText) : {}
  const itemsObj = {}
  for (const it of inv.items) {
    const o = {
      inventory: String(it.inventory),
      def_index: String(it.def_index),
      level: String(it.level ?? 1),
      quality: String(it.quality ?? 3),
      flags: String(it.flags ?? 0),
      origin: String(it.origin ?? 24),
    }
    if (it.custom_name) o.custom_name = it.custom_name
    o.in_use = String(it.in_use ?? 0)
    o.rarity = String(it.rarity ?? 1)
    if (it.attributes && Object.keys(it.attributes).length) o.attributes = { ...it.attributes }
    if (it.equipped_state && Object.keys(it.equipped_state).length) o.equipped_state = { ...it.equipped_state }
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

export function writeInventoryAtomic(filePath, content) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  // backup
  if (fs.existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const bak = `${filePath}.${stamp}.bak`
    fs.copyFileSync(filePath, bak)
  }
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, filePath)
}

// Timestamped copies live next to inventory.txt as `<name>.<iso-timestamp>.bak`.
export function listInventoryBackups(filePath, limit = 100) {
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
    let time = Number.isNaN(Date.parse(stamped)) ? '' : stamped
    let count = null
    try {
      if (!time) time = fs.statSync(file).mtime.toISOString()
      count = parseInventory(fs.readFileSync(file, 'utf8')).items.length
    } catch {
      count = null
    }
    backups.push({ name, file, time, count })
  }
  backups.sort((a, b) => String(b.time).localeCompare(String(a.time)))
  return backups.slice(0, limit)
}
