import type { GameId } from './catalog'

export async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...((opts.headers as Record<string, string>) || {}) },
  })
  return r.json()
}

export type RconProfile = {
  enabled: boolean
  host: string
  port: string
  password: string
}

const DEFAULT_RCON_PORT = '37016'

/** Reads one game's RCON profile. CS:GO falls back to the pre-CS2 keys. */
function readProfile(game: GameId): RconProfile {
  const legacy = game === 'csgo'
  const read = (key: string) => localStorage.getItem(`gc.${game}.${key}`) ?? (legacy ? localStorage.getItem(`gc.${key}`) : null)
  return {
    enabled: read('enabled') !== '0',
    host: read('host') || '127.0.0.1',
    port: read('port') || DEFAULT_RCON_PORT,
    password: read('password') ?? '',
  }
}

function writeProfile(game: GameId, profile: RconProfile) {
  localStorage.setItem(`gc.${game}.enabled`, profile.enabled ? '1' : '0')
  localStorage.setItem(`gc.${game}.host`, profile.host)
  localStorage.setItem(`gc.${game}.port`, profile.port)
  localStorage.setItem(`gc.${game}.password`, profile.password)
  // keep the original keys readable for anyone downgrading the app
  if (game === 'csgo') {
    localStorage.setItem('gc.host', profile.host)
    localStorage.setItem('gc.port', profile.port)
    localStorage.setItem('gc.password', profile.password)
  }
}

// Both games can be live at once, so each keeps its own host/port/password.
export const store: {
  csgo: RconProfile
  cs2: RconProfile
  profile(game: GameId): RconProfile
  save(game?: GameId): void
} = {
  csgo: readProfile('csgo'),
  cs2: readProfile('cs2'),
  profile(game) {
    return this[game]
  },
  save(game) {
    if (game) writeProfile(game, this[game])
    else {
      writeProfile('csgo', this.csgo)
      writeProfile('cs2', this.cs2)
    }
  },
}


export function wearPresetLabel(w: number) {
  if (w < 0.07) return 'fn'
  if (w < 0.15) return 'mw'
  if (w < 0.38) return 'ft'
  if (w < 0.45) return 'ww'
  return 'bs'
}

export function quoteName(n: string) {
  return `"${String(n).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
