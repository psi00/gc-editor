// tiny local-only http server, no external deps.
// serves api + imgs/ + built web/ (dist/web). vite proxies /api + /imgs in dev.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import { resolvePaths, ensureDirs } from './paths.js'
import { parseInventory, serializeInventory, validateInventory, writeInventoryAtomic } from './inventory.js'
import { rconCommand, buildGiveCommand } from './rcon.js'
import { loadSchema, searchSkins, skinsForWeapon, listWeapons, listCategory, searchAll, categoryCounts, getSchema } from './schema.js'

const PORT = Number(process.env.PORT || 5174)
const HOST = '127.0.0.1'

let gameDirHint = process.env.CSGO_LEGACY_DIR || null
let paths = resolvePaths(gameDirHint)
ensureDirs(paths)
loadSchema(paths.schemaCache)

function send(res, code, body, type = 'application/json') {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => { b += c; if (b.length > 4_000_000) req.destroy() })
    req.on('end', () => {
      try { resolve(b ? JSON.parse(b) : {}) } catch { resolve({}) }
    })
  })
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { send(res, 404, { error: 'not found' }); return }
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${HOST}:${PORT}`)
  const p = u.pathname

  // --- settings / paths ---
  if (p === '/api/settings' && req.method === 'GET') {
    paths = resolvePaths(gameDirHint)
    ensureDirs(paths)
    loadSchema(paths.schemaCache)
    const out = {
      ...paths,
      inventoryExists: paths.inventoryTxt ? fs.existsSync(paths.inventoryTxt) : false,
      itemsGameExists: paths.itemsGameTxt ? fs.existsSync(paths.itemsGameTxt) : false,
      schemaCached: fs.existsSync(paths.schemaCache),
    }
    send(res, 200, out)
    return
  }
  if (p === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req)
    if (body.gameDir) gameDirHint = body.gameDir
    paths = resolvePaths(gameDirHint)
    ensureDirs(paths)
    loadSchema(paths.schemaCache)
    send(res, 200, { ok: true, gameDir: paths.gameDir })
    return
  }

  // --- generic rcon passthrough ---
  if (p === '/api/rcon' && req.method === 'POST') {
    const body = await readBody(req)
    try {
      const out = await rconCommand({
        host: body.host || '127.0.0.1',
        port: Number(body.port || 37016),
        password: body.password ?? '',
        command: String(body.command || 'ping'),
      })
      const trimmed = String(out).trim()
      // auto-save hook stays client-driven, but report ok/err plainly
      send(res, 200, { ok: trimmed.startsWith('OK'), raw: trimmed })
    } catch (e) {
      send(res, 200, { ok: false, raw: `ERR ${e.message}` })
    }
    return
  }

  // --- structured give_item (builds command server-side so quoting is consistent) ---
  if (p === '/api/rcon/give' && req.method === 'POST') {
    const body = await readBody(req)
    try {
      const command = buildGiveCommand(body.item || {})
      const raw = await rconCommand({
        host: body.host || '127.0.0.1',
        port: Number(body.port || 37016),
        password: body.password ?? '',
        command,
      })
      let result = { ok: String(raw).trim().startsWith('OK'), raw: String(raw).trim(), command }
      // auto save_inventory after successful give when requested (default on)
      if (result.ok && body.autosave !== false) {
        try {
          const saved = await rconCommand({
            host: body.host || '127.0.0.1',
            port: Number(body.port || 37016),
            password: body.password ?? '',
            command: 'save_inventory',
          })
          result = { ...result, saved: String(saved).trim() }
        } catch (e) {
          result = { ...result, saved: `ERR ${e.message}` }
        }
      }
      send(res, 200, result)
    } catch (e) {
      send(res, 500, { ok: false, raw: `ERR ${e.message}` })
    }
    return
  }

  // --- inventory file ---
  if (p === '/api/inventory' && req.method === 'GET') {
    const file = u.searchParams.get('path') || paths.inventoryTxt
    if (!file || !fs.existsSync(file)) { send(res, 404, { error: 'inventory.txt not found', path: file }); return }
    try {
      const text = fs.readFileSync(file, 'utf8')
      const inv = parseInventory(text)
      const warnings = validateInventory(inv)
      send(res, 200, { path: file, items: inv.items, default_equips: inv.default_equips, warnings, count: inv.items.length })
    } catch (e) {
      send(res, 500, { error: String(e.message) })
    }
    return
  }
  if (p === '/api/inventory/save' && req.method === 'POST') {
    const body = await readBody(req)
    const file = body.path || paths.inventoryTxt
    if (!file) { send(res, 400, { error: 'no inventory path' }); return }
    try {
      // accept either full items array or raw text
      let text
      if (typeof body.text === 'string') {
        // validate before write
        parseInventory(body.text)
        text = body.text
      } else {
        const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
        text = serializeInventory({ items: body.items || [], default_equips: body.default_equips || {} }, existing)
      }
      writeInventoryAtomic(file, text)
      send(res, 200, { ok: true, path: file })
    } catch (e) {
      send(res, 500, { ok: false, error: String(e.message) })
    }
    return
  }

  // --- schema search ---
  if (p === '/api/schema/search' && req.method === 'GET') {
    send(res, 200, { results: searchSkins(u.searchParams.get('q') || '', Number(u.searchParams.get('limit') || 50)) })
    return
  }
  if (p === '/api/schema/weapons' && req.method === 'GET') {
    send(res, 200, { weapons: listWeapons() })
    return
  }
  if (p.startsWith('/api/schema/skins/') && req.method === 'GET') {
    const weaponId = Number(p.split('/').pop())
    send(res, 200, { weaponId, skins: skinsForWeapon(weaponId) })
    return
  }
  if (p === '/api/schema/counts' && req.method === 'GET') {
    send(res, 200, { counts: categoryCounts(), cached: !!getSchema() })
    return
  }
  if (p.startsWith('/api/schema/category/') && req.method === 'GET') {
    const cat = p.split('/').pop()
    const q = u.searchParams.get('q') || ''
    const limit = Number(u.searchParams.get('limit') || 500)
    send(res, 200, { category: cat, items: listCategory(cat, limit, q) })
    return
  }
  if (p === '/api/schema/search-all' && req.method === 'GET') {
    send(res, 200, { results: searchAll(u.searchParams.get('q') || '', Number(u.searchParams.get('limit') || 50)) })
    return
  }

  // --- local images (prefetched cache, gitignored) ---
  if (p.startsWith('/imgs/')) {
    const rel = decodeURIComponent(p.slice('/imgs/'.length)).replace(/\.\./g, '')
    serveFile(res, path.join(paths.imgsDir, rel))
    return
  }

  // --- built frontend ---
  const distWeb = path.join(process.cwd(), 'dist', 'web')
  if (fs.existsSync(distWeb)) {
    let rel = decodeURIComponent(p === '/' ? '/index.html' : p).replace(/\.\./g, '')
    let file = path.join(distWeb, rel.slice(1))
    if (p === '/' || !fs.existsSync(file)) file = path.join(distWeb, 'index.html')
    serveFile(res, file)
    return
  }

  send(res, 404, { error: 'not built yet - run dev via vite on :5173' })
})

server.listen(PORT, HOST, () => {
  console.log(`gc-editor server on http://${HOST}:${PORT}`)
  console.log(`gameDir: ${paths.gameDir ?? '(not found - set via POST /api/settings)'} `)
})
