// minimal path resolution: auto-detect first, manual fallback via request param.
// no deps, node builtins only.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULT_GAME_DIRS = [
  'C:/Program Files (x86)/Steam/steamapps/common/csgo legacy',
  'C:/Program Files/Steam/steamapps/common/csgo legacy',
  'D:/Steam/steamapps/common/csgo legacy',
]

function exists(p) {
  try { return fs.existsSync(p) } catch { return false }
}

export function detectGameDir(hint) {
  if (hint && exists(hint)) return hint
  if (process.env.CSGO_LEGACY_DIR && exists(process.env.CSGO_LEGACY_DIR)) {
    return process.env.CSGO_LEGACY_DIR
  }
  for (const d of DEFAULT_GAME_DIRS) {
    if (exists(d)) return d
  }
  return null
}

export function resolvePaths(gameDirHint) {
  const gameDir = detectGameDir(gameDirHint)
  const root = process.cwd()
  return {
    gameDir,
    inventoryTxt: gameDir ? path.join(gameDir, 'csgo_gc', 'inventory.txt') : null,
    itemsGameTxt: gameDir ? path.join(gameDir, 'csgo', 'scripts', 'items', 'items_game.txt') : null,
    configTxt: gameDir ? path.join(gameDir, 'csgo_gc', 'config.txt') : null,
    dataDir: path.join(root, 'data'),
    schemaCache: path.join(root, 'data', 'inventory.en.json'),
    schemaMeta: path.join(root, 'data', 'meta.json'),
    imgsDir: path.join(root, 'imgs'),
    userCacheDir: path.join(os.homedir(), '.gc-editor', 'cache'),
    customCss: path.join(os.homedir(), '.gc-editor', 'custom.css'),
  }
}

export function ensureDirs(paths) {
  for (const d of [paths.dataDir, paths.imgsDir, paths.userCacheDir, path.dirname(paths.customCss)]) {
    fs.mkdirSync(d, { recursive: true })
  }
  const keep1 = path.join(paths.dataDir, '.gitkeep')
  const keep2 = path.join(paths.imgsDir, '.gitkeep')
  if (!exists(keep1)) fs.writeFileSync(keep1, '')
  if (!exists(keep2)) fs.writeFileSync(keep2, '')
}
