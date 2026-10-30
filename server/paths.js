// minimal path resolution: auto-detect first, manual fallback via request param.
// no deps, node builtins only.
//
// Both games can be installed side by side. CS:GO uses <dir>/csgo and
// <dir>/csgo_gc; CS2 nests the same layout under <dir>/game. Pointing at either
// the install root or the game/ directory works for CS2.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_GAME, DEFAULT_GAME_DIRS, GAME_DIR_ENV, GAMES, normalizeGame } from './games.js'

function exists(p) {
  try { return fs.existsSync(p) } catch { return false }
}

export function detectGameDir(game, hint) {
  const key = normalizeGame(game)
  if (hint && exists(hint)) return hint
  const fromEnv = process.env[GAME_DIR_ENV[key]]
  if (fromEnv && exists(fromEnv)) return fromEnv
  for (const d of DEFAULT_GAME_DIRS[key]) {
    if (exists(d)) return d
  }
  return null
}

// CS2 installs live in <install>/game, CS:GO content lives directly in <install>.
function installRoot(dir) {
  if (!dir) return null
  return exists(path.join(dir, 'game', 'csgo')) ? path.join(dir, 'game') : dir
}

export function detectActiveGame(hints = {}) {
  for (const game of GAMES) {
    if (detectGameDir(game, hints[game])) return game
  }
  return DEFAULT_GAME
}

export function resolvePaths(game = DEFAULT_GAME, hints = {}) {
  const key = normalizeGame(game)
  const gameDir = detectGameDir(key, hints[key])
  const base = installRoot(gameDir)
  const root = process.cwd()
  // CS:GO keeps data/ and imgs/ at the top level (the original layout). CS2
  // gets sibling directories so both caches can coexist.
  const dataDir = key === 'csgo' ? path.join(root, 'data') : path.join(root, 'data', key)
  const imgsDir = path.join(root, 'imgs')
  return {
    game: key,
    gameDir,
    gameDirEnv: GAME_DIR_ENV[key],
    contentDir: base ? path.join(base, 'csgo') : null,
    gcDir: base ? path.join(base, 'csgo_gc') : null,
    inventoryTxt: base ? path.join(base, 'csgo_gc', 'inventory.txt') : null,
    itemsGameTxt: base ? path.join(base, 'csgo', 'scripts', 'items', 'items_game.txt') : null,
    configTxt: base ? path.join(base, 'csgo_gc', 'config.txt') : null,
    csgoEnglishTxt: base ? path.join(base, 'csgo', 'resource', 'csgo_english.txt') : null,
    dataDir,
    schemaCache: path.join(dataDir, 'inventory.en.json'),
    schemaMeta: path.join(dataDir, 'meta.json'),
    casesCache: path.join(dataDir, 'cases.json'),
    imgsDir,
    // where this game's files actually live, and the URL prefix that maps to it
    imgsGameDir: key === 'csgo' ? imgsDir : path.join(imgsDir, key),
    imgsUrlPrefix: key === 'csgo' ? '/imgs' : `/imgs/${key}`,
    userCacheDir: path.join(os.homedir(), '.gc-editor', 'cache'),
    customCss: path.join(os.homedir(), '.gc-editor', 'custom.css'),
  }
}

export function resolveAllPaths(hints = {}) {
  return Object.fromEntries(GAMES.map((game) => [game, resolvePaths(game, hints)]))
}

export function ensureDirs(paths) {
  for (const d of [paths.dataDir, paths.imgsDir, paths.imgsGameDir, paths.userCacheDir, path.dirname(paths.customCss)]) {
    fs.mkdirSync(d, { recursive: true })
  }
  const keep1 = path.join(paths.dataDir, '.gitkeep')
  const keep2 = path.join(paths.imgsDir, '.gitkeep')
  if (!exists(keep1)) fs.writeFileSync(keep1, '')
  if (!exists(keep2)) fs.writeFileSync(keep2, '')
}
