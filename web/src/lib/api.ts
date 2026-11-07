import type { GameId } from './catalog'

let sessionToken: string | null = null
let sessionRequest: Promise<string> | null = null

async function loadSession(): Promise<string> {
  if (sessionToken) return sessionToken
  if (!sessionRequest) {
    sessionRequest = fetch('/api/session')
      .then(async (response) => {
        if (!response.ok) throw new Error(`session request failed (${response.status})`)
        const body = await response.json()
        if (typeof body.token !== 'string' || !body.token) throw new Error('session token missing')
        const token = String(body.token)
        sessionToken = token
        return token
      })
      .finally(() => { sessionRequest = null })
  }
  const request = sessionRequest
  return request
}

export async function ensureSession() {
  return loadSession()
}

export async function api(path: string, opts: RequestInit = {}) {
  const method = String(opts.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  }
  if (method !== 'GET' && method !== 'HEAD') headers['x-gc-token'] = await loadSession()
  const r = await fetch(path, { ...opts, method, headers })
  return r.json()
}

export type RconProfile = {
  enabled: boolean
  host: string
  port: string
  hasPassword: boolean
}

const DEFAULT_RCON_PORT = '37016'

function defaultProfile(): RconProfile {
  return { enabled: true, host: '127.0.0.1', port: DEFAULT_RCON_PORT, hasPassword: false }
}

function readLegacyPassword(game: GameId): string {
  const own = localStorage.getItem(`gc.${game}.password`)
  if (own != null) return own
  return game === 'csgo' ? localStorage.getItem('gc.password') ?? '' : ''
}

function clearLegacyPasswords() {
  for (const key of ['gc.password', 'gc.csgo.password', 'gc.cs2.password']) localStorage.removeItem(key)
}

type ConfigResponse = {
  ok?: boolean
  error?: string
  freeFormConsole?: boolean
  profiles?: Partial<Record<GameId, {
    enabled?: boolean
    host?: string
    port?: string
    hasPassword?: boolean
  }>>
}

function applyConfig(response: ConfigResponse) {
  if (typeof response.freeFormConsole === 'boolean') store.freeFormConsole = response.freeFormConsole
  for (const game of ['csgo', 'cs2'] as GameId[]) {
    const next = response.profiles?.[game]
    if (!next) continue
    store[game] = {
      enabled: next.enabled !== false,
      host: String(next.host || '127.0.0.1'),
      port: String(next.port || DEFAULT_RCON_PORT),
      hasPassword: Boolean(next.hasPassword),
    }
  }
}

// Both games can be live at once. Profiles live on the server; the browser only
// keeps a copy so the UI can gate controls without another round trip.
export const store: {
  csgo: RconProfile
  cs2: RconProfile
  freeFormConsole: boolean
  profile(game: GameId): RconProfile
} = {
  csgo: defaultProfile(),
  cs2: defaultProfile(),
  freeFormConsole: false,
  profile(game) {
    return this[game]
  },
}

/** Loads the server profiles and moves any pre-existing localStorage password into them. */
export async function loadRconConfig() {
  const response: ConfigResponse = await api('/api/rcon/config')
  if (response.error) throw new Error(response.error)
  applyConfig(response)

  const legacy: Partial<Record<GameId, string>> = {}
  for (const game of ['csgo', 'cs2'] as GameId[]) {
    if (store[game].hasPassword) continue
    const password = readLegacyPassword(game)
    if (password) legacy[game] = password
  }
  if (Object.keys(legacy).length > 0) {
    const migrated: ConfigResponse = await api('/api/rcon/config', {
      method: 'POST',
      body: JSON.stringify({
        profiles: Object.fromEntries(Object.entries(legacy).map(([game, password]) => [game, { password }])),
      }),
    })
    if (migrated.error) throw new Error(migrated.error)
    applyConfig(migrated)
  }

  clearLegacyPasswords()
  return response
}

export async function saveRconFreeForm(enabled: boolean) {
  const response: ConfigResponse = await api('/api/rcon/config', {
    method: 'POST',
    body: JSON.stringify({ freeFormConsole: enabled }),
  })
  if (response.error) throw new Error(response.error)
  applyConfig(response)
  return response
}

export async function saveRconProfile(game: GameId, patch: Partial<Omit<RconProfile, 'hasPassword'>>, password?: string) {
  const response: ConfigResponse = await api('/api/rcon/config', {
    method: 'POST',
    body: JSON.stringify({
      game,
      profile: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.host !== undefined ? { host: patch.host } : {}),
        ...(patch.port !== undefined ? { port: patch.port } : {}),
        ...(password !== undefined ? { password } : {}),
      },
    }),
  })
  if (response.error) throw new Error(response.error)
  applyConfig(response)
  return response
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
