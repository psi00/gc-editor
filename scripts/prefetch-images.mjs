// prefetch all thumbnails once when online into gitignored imgs/.
// never fetched at runtime. missing files fall back to placeholder.
//
// Each game is cached separately: CS:GO in imgs/, CS2 in imgs/cs2/. The URL
// prefix must match server/paths.js (`/imgs` and `/imgs/cs2`).
//
// usage: npm run prefetch-images [-- --game=csgo|cs2 --conc=16 --only=skins,stickers --limit=500]
import fs from 'node:fs'
import path from 'node:path'
import { GAMES, GAME_LABELS, normalizeGame } from '../server/games.js'

const ROOT = process.cwd()
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.replace(/^--/, '').split('=')
    return [m[0], m[1] ?? '1']
  })
)
const CONC = Number(process.env.CONC || args.conc || 12)
const ONLY = String(args.only || process.env.ONLY || 'all')
const LIMIT = Number(args.limit || 0)
const RETRIES = 1
const GAMES_TO_FETCH = args.game && args.game !== 'all' ? [normalizeGame(args.game)] : GAMES
const FLAT_CATS = ['crates', 'collectibles', 'stickers', 'graffiti', 'music_kits', 'keychains', 'agents', 'patches', 'keys', 'tools', 'highlights', 'sticker_slabs']

function fmt(n) { return n.toLocaleString('en-US') }
function bar(frac, w = 28) {
  const f = Math.max(0, Math.min(1, frac))
  const fill = Math.round(f * w)
  return '█'.repeat(fill) + '░'.repeat(w - fill)
}

async function runGame(game) {
  const schema = path.join(ROOT, 'data', game === 'csgo' ? '' : game, 'inventory.en.json')
  const out = game === 'csgo' ? path.join(ROOT, 'imgs') : path.join(ROOT, 'imgs', game)
  if (!fs.existsSync(schema)) {
    console.warn(`${game}: missing ${path.relative(ROOT, schema)} - run npm run fetch-schema -- --game=${game} first, skipping`)
    return { processed: 0, failed: 0, skipped: 0 }
  }

  const db = JSON.parse(fs.readFileSync(schema, 'utf8'))

  // build job list: skins go to skins/<weapon>_<paint>.png, rest to <cat>/<id>.png
  const jobs = []
  let skipped = 0
  function add(url, dest) {
    if (!url) return
    if (fs.existsSync(dest)) { skipped++; return }
    jobs.push({ url, dest })
  }

  const want = (cat) => ONLY === 'all' || ONLY.split(',').map((s) => s.trim()).includes(cat)

  if (want('skins') || want('all')) {
    for (const [weaponId, paints] of Object.entries(db.skins || {})) {
      for (const [paintIdx, s] of Object.entries(paints)) {
        const dir = path.join(out, 'skins')
        fs.mkdirSync(dir, { recursive: true })
        add(s?.image, path.join(dir, `${weaponId}_${paintIdx === 'null' ? 0 : paintIdx}.png`))
      }
    }
  }
  for (const cat of FLAT_CATS) {
    if (!want(cat) && ONLY !== 'all') continue
    if (!db[cat]) continue
    const dir = path.join(out, cat)
    fs.mkdirSync(dir, { recursive: true })
    for (const [id, v] of Object.entries(db[cat])) {
      add(v?.image, path.join(dir, `${id}.png`))
    }
  }

  let queue = jobs
  if (LIMIT > 0) queue = jobs.slice(0, LIMIT)
  console.log(`\n${GAME_LABELS[game]}: ${queue.length} to fetch, ${skipped} already cached, conc=${CONC}${LIMIT ? ` limit=${LIMIT}` : ''} -> ${path.relative(ROOT, out)}/`)
  if (queue.length === 0) return { processed: 0, failed: 0, skipped }

  // ---- progress ----
  const total = queue.length
  let done = 0, failed = 0, bytes = 0
  const started = Date.now()
  let lastTick = started, lastDone = 0
  const failures = []

  function render(force = false) {
    const now = Date.now()
    if (!force && now - lastTick < 200) return
    const el = (now - started) / 1000
    const rateTotal = el > 0 ? done / el : 0
    const instRate = (done - lastDone) / Math.max(0.2, (now - lastTick) / 1000)
    lastTick = now; lastDone = done
    const frac = total ? done / total : 1
    const eta = rateTotal > 0 ? (total - done) / rateTotal : 0
    const etaStr = !isFinite(eta) || eta <= 0 ? '--' : `${Math.floor(eta / 60)}m${String(Math.floor(eta % 60)).padStart(2, '0')}s`
    const mb = (bytes / 1048576).toFixed(1)
    process.stdout.write(
      `\r${bar(frac)} ${(frac * 100).toFixed(1)}% | ${fmt(done)}/${fmt(total)} ok=${fmt(done - failed)} fail=${fmt(failed)} | ${rateTotal.toFixed(1)}/s (now ${instRate.toFixed(1)}/s) | ${mb}mb | eta ${etaStr}   `
    )
  }

  async function fetchOnce({ url, dest }) {
    const r = await fetch(url, { headers: { 'user-agent': 'gc-editor' } })
    if (!r.ok) throw new Error(`http ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    bytes += buf.length
  }

  async function worker() {
    while (queue.length) {
      const job = queue.shift()
      let ok = false
      for (let attempt = 0; attempt <= RETRIES && !ok; attempt++) {
        try { await fetchOnce(job); ok = true } catch (e) {
          if (attempt === RETRIES) { failed++; failures.push(`${job.dest} :: ${e.message}`) }
        }
      }
      done++
      render()
    }
  }

  render(true)
  await Promise.all(Array.from({ length: Math.min(CONC, total || 1) }, () => worker()))
  render(true)
  process.stdout.write('\n')

  const failedLog = path.join(out, 'failed.log')
  if (failures.length) fs.writeFileSync(failedLog, failures.join('\n'))
  else if (fs.existsSync(failedLog)) fs.rmSync(failedLog)

  console.log(`done: ${fmt(done)} processed, ${fmt(skipped)} skipped (already cached), ${fmt(failed)} failed -> ${path.relative(ROOT, out)}/`)
  if (failures.length) console.log(`see ${path.relative(ROOT, failedLog)} for failed urls (re-run to retry, existing files are skipped)`)
  return { processed: done, failed, skipped }
}

let any = false
for (const game of GAMES_TO_FETCH) {
  const result = await runGame(game)
  if (result.processed > 0 || result.skipped > 0) any = true
}
if (!any) {
  console.error('nothing prefetched - run npm run fetch-schema first')
  process.exit(1)
}
