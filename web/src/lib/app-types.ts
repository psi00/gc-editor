import type { GameId, Weapon } from './catalog'

export type Tab = 'live' | 'offline' | 'activity' | 'settings'

export type RconHealth = 'unknown' | 'ready' | 'auth' | 'gc' | 'off'

export type RconStatus = {
  health: RconHealth
  /** verbatim GC reply for the last probe */
  raw: string
  at: string | null
  checking: boolean
}

export type SchemaState = {
  status: 'loading' | 'ready' | 'error'
  weapons: Weapon[]
  counts: Record<string, number>
  cached: boolean
  game: GameId
  error?: string
}

export type GameSettings = {
  game: GameId
  gameDir: string | null
  gameDirEnv: string
  contentDir: string | null
  gcDir: string | null
  inventoryTxt: string | null
  itemsGameTxt: string | null
  configTxt: string | null
  csgoEnglishTxt: string | null
  dataDir: string | null
  schemaCache: string | null
  schemaMeta: string | null
  casesCache: string | null
  imgsGameDir: string | null
  imgsUrlPrefix: string
  inventoryExists: boolean
  itemsGameExists: boolean
  schemaCached: boolean
  casesCached: boolean
}

export type SettingsInfo = {
  game: GameId
  games: Record<GameId, GameSettings>
  gameDirs: Record<GameId, string | null>
  gameDir: string | null
  inventoryTxt: string | null
  itemsGameTxt: string | null
  configTxt: string | null
  dataDir: string | null
  schemaCache: string | null
  schemaMeta: unknown
  casesCache: string | null
  imgsDir: string | null
  imgsGameDir: string | null
  imgsUrlPrefix: string
  userCacheDir: string | null
  customCss: string | null
  inventoryExists: boolean
  itemsGameExists: boolean
  schemaCached: boolean
  casesCached: boolean
  customCssExists: boolean
}

export type GiveSticker = { id: number; wear?: number; scale?: number; rotation?: number } | null

/** Mirrors the giveItem fields accepted by `buildGiveCommand` in server/rcon.js. */
export type GiveItem = {
  def_index: number
  count?: number
  level?: number
  quality?: number
  rarity?: number
  name?: string
  paint?: number
  seed?: number
  wear?: number
  stattrak?: number
  music?: number
  keychain?: number
  spray_color?: number
  spray_remaining?: number
  tournament_event?: number
  tournament_stage?: number
  tournament_team0?: number
  tournament_team1?: number
  tournament_mvp?: number
  stickers?: GiveSticker[]
}

export type GiveResponse = {
  ok: boolean
  raw: string
  command?: string
  saved?: string
}

export type InvItem = {
  id: number
  inventory: number
  def_index: number
  level: number
  quality: number
  flags: number
  origin: number
  in_use: number
  rarity: number
  custom_name?: string
  attributes: Record<string, string>
  equipped_state: Record<string, string>
}

export type InvDefaultEquips = Record<string, { class_id: number; slot_id: number }>

export type InvResponse = {
  game: GameId
  path: string
  items: InvItem[]
  default_equips: InvDefaultEquips
  warnings: string[]
  count: number
  error?: string
}
