// supported game targets. Every per-game thing (schema cache, case index,
// prefetched art, install dir) is namespaced by these ids. CS:GO keeps the
// original layout so existing caches and image URLs stay valid.
export const GAMES = ['csgo', 'cs2']
export const DEFAULT_GAME = 'csgo'

export const GAME_LABELS = {
  csgo: 'CS:GO',
  cs2: 'CS2',
}

export const GAME_DIR_ENV = {
  csgo: 'CSGO_LEGACY_DIR',
  cs2: 'CS2_DIR',
}

// Steam names the legacy install "csgo legacy" and the current one
// "Counter-Strike Global Offensive".
export const DEFAULT_GAME_DIRS = {
  csgo: [
    'C:/Program Files (x86)/Steam/steamapps/common/csgo legacy',
    'C:/Program Files/Steam/steamapps/common/csgo legacy',
    'D:/Steam/steamapps/common/csgo legacy',
    'E:/Steam/steamapps/common/csgo legacy',
  ],
  cs2: [
    'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive',
    'C:/Program Files/Steam/steamapps/common/Counter-Strike Global Offensive',
    'D:/Steam/steamapps/common/Counter-Strike Global Offensive',
    'E:/Steam/steamapps/common/Counter-Strike Global Offensive',
  ],
}

export function isGame(value) {
  return GAMES.includes(value)
}

export function normalizeGame(value, fallback = DEFAULT_GAME) {
  return isGame(value) ? value : fallback
}
