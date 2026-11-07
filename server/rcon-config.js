// server-owned RCON settings. the browser may edit them but never reads the
// password back. node builtins only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GAMES } from './games.js'

const DEFAULT_PROFILE = { enabled: true, host: '127.0.0.1', port: '37016', password: '' }

function defaults() {
  return {
    freeFormConsole: false,
    profiles: Object.fromEntries(GAMES.map((game) => [game, { ...DEFAULT_PROFILE }])),
  }
}

function profile(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: value.enabled !== false,
    host: typeof value.host === 'string' && value.host.trim() ? value.host.trim() : DEFAULT_PROFILE.host,
    port: String(value.port || DEFAULT_PROFILE.port),
    password: typeof value.password === 'string' ? value.password : '',
  }
}

export function rconConfigPath() {
  const dir = process.env.GC_CONFIG_DIR || path.join(os.homedir(), '.gc-editor')
  return path.join(dir, 'rcon.json')
}

export function readRconConfig(file = rconConfigPath()) {
  if (!fs.existsSync(file)) return defaults()
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = defaults()
  out.freeFormConsole = raw?.freeFormConsole === true
  for (const game of GAMES) out.profiles[game] = profile(raw?.profiles?.[game])
  return out
}

export function writeRconConfig(config, file = rconConfigPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  try { fs.chmodSync(file, 0o600) } catch { /* best effort on Windows */ }
  return config
}

export function updateRconConfig(patch, file = rconConfigPath()) {
  const config = readRconConfig(file)
  if (typeof patch?.freeFormConsole === 'boolean') config.freeFormConsole = patch.freeFormConsole

  const source = patch?.profiles && typeof patch.profiles === 'object'
    ? patch.profiles
    : patch?.game && patch?.profile && GAMES.includes(patch.game)
      ? { [patch.game]: patch.profile }
      : {}

  for (const game of GAMES) {
    const next = source[game]
    if (!next || typeof next !== 'object') continue
    const current = config.profiles[game]
    if (next.enabled !== undefined) current.enabled = next.enabled !== false
    if (next.host !== undefined) {
      if (typeof next.host !== 'string' || !next.host.trim()) throw new Error('host must be a non-empty string')
      current.host = next.host.trim()
    }
    if (next.port !== undefined) {
      const port = Number(next.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be between 1 and 65535')
      current.port = String(port)
    }
    if (next.password !== undefined) {
      if (typeof next.password !== 'string') throw new Error('password must be a string')
      current.password = next.password
    }
  }

  return writeRconConfig(config, file)
}

/** The shape the browser is allowed to see: passwords become a boolean. */
export function publicRconConfig(config) {
  return {
    freeFormConsole: config.freeFormConsole,
    profiles: Object.fromEntries(GAMES.map((game) => {
      const value = config.profiles[game]
      return [game, {
        enabled: value.enabled,
        host: value.host,
        port: value.port,
        hasPassword: value.password.length > 0,
      }]
    })),
  }
}
