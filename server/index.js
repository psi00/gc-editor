// tiny local-only http server, no external deps.
// serves api + imgs/ + built web/ (dist/web). vite proxies /api + /imgs in dev.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import { resolveAllPaths, ensureDirs, detectActiveGame } from './paths.js'
import { GAMES, GAME_LABELS, normalizeGame } from './games.js'
import { parseInventory, serializeInventory, validateInventory, writeInventoryAtomic, listInventoryBackups } from './inventory.js'
import { readCustomCss, writeCustomCss, ensureCustomCss, CUSTOM_CSS_LIMIT } from './custom-css.js'
import { rconCommand, buildGiveCommand } from './rcon.js'
import { loadSchema, setGame, getGame, searchSkins, skinsForWeapon, listWeapons, listCategory, searchAll, categoryCounts, getSchema } from './schema.js'

const PORT = Number(process.env.PORT || 5174)
const HOST = '127.0.0.1'

const gameHints = {
  csgo: process.env.CSGO_LEGACY_DIR || null,
  cs2: process.env.CS2_DIR || null,
}
let activeGame = detectActiveGame(gameHints)
let pathsByGame = resolveAllPaths(gameHints)
let paths = pathsByGame[activeGame]

function reloadGames() {
  pathsByGame = resolveAllPaths(gameHints)
  for (const game of GAMES) {
    ensureDirs(pathsByGame[game])
    loadSchema(game, pathsByGame[game].schemaCache)
  }
  paths = pathsByGame[activeGame]
  setGame(activeGame)
}

function settingsFor(game) {
  const entry = pathsByGame[game]
  return {
    ...entry,
    inventoryExists: entry.inventoryTxt ? fs.existsSync(entry.inventoryTxt) : false,
    itemsGameExists: entry.itemsGameTxt ? fs.existsSync(entry.itemsGameTxt) : false,
    schemaCached: fs.existsSync(entry.schemaCache),
    casesCached: fs.existsSync(entry.casesCache),
    customCssExists: fs.existsSync(entry.customCss),
  }
}

/** Game requested by a query param, falling back to the server default. */
function gameFrom(u) {
  return normalizeGame(u.searchParams.get('game') || getGame())
}

reloadGames()
ensureCustomCss(paths.customCss)

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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }

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
    reloadGames()
    const active = settingsFor(activeGame)
    const games = Object.fromEntries(GAMES.map((game) => [game, settingsFor(game)]))
    send(res, 200, {
      ...active,
      game: activeGame,
      gameLabels: GAME_LABELS,
      games,
      gameDirs: Object.fromEntries(GAMES.map((game) => [game, pathsByGame[game].gameDir])),
      inventoryExists: active.inventoryExists,
      itemsGameExists: active.itemsGameExists,
      schemaCached: active.schemaCached,
      customCssExists: active.customCssExists,
    })
    return
  }
  if (p === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req)
    if (body.gameDirs && typeof body.gameDirs === 'object') {
      for (const game of GAMES) {
        if (typeof body.gameDirs[game] === 'string') gameHints[game] = body.gameDirs[game].trim() || null
      }
    }
    if (body.game) activeGame = normalizeGame(body.game)
    if (typeof body.gameDir === 'string') gameHints[activeGame] = body.gameDir.trim() || null
    activeGame = normalizeGame(activeGame)
    reloadGames()
    send(res, 200, {
      ok: true,
      game: activeGame,
      gameDir: paths.gameDir,
      gameDirs: Object.fromEntries(GAMES.map((game) => [game, pathsByGame[game].gameDir])),
    })
    return
  }

  // --- custom stylesheet: a user file on disk, linked from index.html ---
  if (p === '/api/custom-css' && req.method === 'GET') {
    send(res, 200, { ok: true, path: paths.customCss, limit: CUSTOM_CSS_LIMIT, ...readCustomCss(paths.customCss) })
    return
  }
  // raw stylesheet for the <link>. missing file is an empty sheet, not a 404,
  // so the console stays clean when nobody has customised anything.
  if (p === '/api/custom-css.css' && req.method === 'GET') {
    send(res, 200, readCustomCss(paths.customCss).css, 'text/css; charset=utf-8')
    return
  }
  if (p === '/api/custom-css' && req.method === 'POST') {
    const body = await readBody(req)
    try {
      const saved = writeCustomCss(paths.customCss, body.css)
      send(res, 200, { ok: true, path: paths.customCss, limit: CUSTOM_CSS_LIMIT, ...saved })
    } catch (e) {
      send(res, e.code === 'too-large' ? 413 : 400, { ok: false, error: String(e.message) })
    }
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
    const game = gameFrom(u)
    const file = u.searchParams.get('path') || pathsByGame[game].inventoryTxt
    if (!file || !fs.existsSync(file)) { send(res, 404, { error: 'inventory.txt not found', path: file, game }); return }
    try {
      const text = fs.readFileSync(file, 'utf8')
      const inv = parseInventory(text)
      const warnings = validateInventory(inv)
      send(res, 200, { game, path: file, items: inv.items, default_equips: inv.default_equips, warnings, count: inv.items.length })
    } catch (e) {
      send(res, 500, { error: String(e.message), game })
    }
    return
  }
  if (p === '/api/inventory/backups' && req.method === 'GET') {
    const game = gameFrom(u)
    const file = u.searchParams.get('path') || pathsByGame[game].inventoryTxt
    if (!file) { send(res, 200, { game, path: file, backups: [] }); return }
    try {
      send(res, 200, { game, path: file, backups: listInventoryBackups(file) })
    } catch (e) {
      send(res, 500, { game, path: file, backups: [], error: String(e.message) })
    }
    return
  }
  if (p === '/api/inventory/save' && req.method === 'POST') {
    const body = await readBody(req)
    const game = normalizeGame(body.game || getGame())
    const file = body.path || pathsByGame[game].inventoryTxt
    if (!file) { send(res, 400, { error: 'no inventory path', game }); return }
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
      send(res, 200, { ok: true, game, path: file })
    } catch (e) {
      send(res, 500, { ok: false, game, error: String(e.message) })
    }
    return
  }

  // --- schema search ---
  if (p === '/api/schema/search' && req.method === 'GET') {
    const game = gameFrom(u)
    send(res, 200, { game, results: searchSkins(game, u.searchParams.get('q') || '', Number(u.searchParams.get('limit') || 50)) })
    return
  }
  if (p === '/api/schema/weapons' && req.method === 'GET') {
    const game = gameFrom(u)
    send(res, 200, { game, weapons: listWeapons(game) })
    return
  }
  if (p.startsWith('/api/schema/skins/') && req.method === 'GET') {
    const game = gameFrom(u)
    const weaponId = Number(p.split('/').pop())
    send(res, 200, { game, weaponId, skins: skinsForWeapon(game, weaponId) })
    return
  }
  if (p === '/api/schema/counts' && req.method === 'GET') {
    const game = gameFrom(u)
    send(res, 200, { game, counts: categoryCounts(game), cached: !!getSchema(game) })
    return
  }
  if (p.startsWith('/api/schema/category/') && req.method === 'GET') {
    const game = gameFrom(u)
    const cat = p.split('/').pop()
    const q = u.searchParams.get('q') || ''
    const limit = Number(u.searchParams.get('limit') || 500)
    send(res, 200, { game, category: cat, items: listCategory(game, cat, limit, q) })
    return
  }
  if (p === '/api/schema/search-all' && req.method === 'GET') {
    const game = gameFrom(u)
    send(res, 200, { game, results: searchAll(game, u.searchParams.get('q') || '', Number(u.searchParams.get('limit') || 50)) })
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
  console.log(`active game: ${getGame()} (${GAME_LABELS[getGame()]})`)
  for (const game of GAMES) {
    const entry = pathsByGame[game]
    console.log(`  ${game}: ${entry.gameDir ?? '(not found - set via POST /api/settings)'}`)
  }
})
