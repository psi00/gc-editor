import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildGiveCommand } from '../server/rcon.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-editor-http-'))
const home = path.join(tmp, 'home')
const configDir = path.join(tmp, 'config')
const csgoDir = path.join(tmp, 'csgo')
const cs2Dir = path.join(tmp, 'cs2')
const inventory = path.join(csgoDir, 'csgo_gc', 'inventory.txt')
let port = 0
let child = null
let token = ''

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const value = server.address().port
      server.close(() => resolve(value))
    })
  })
}

function request(method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body)
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) } catch { /* non-json */ }
        resolve({ status: res.statusCode, text, json })
      })
    })
    req.once('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function trusted(extra = {}) {
  return {
    Host: `127.0.0.1:${port}`,
    Origin: `http://127.0.0.1:${port}`,
    'x-gc-token': token,
    ...extra,
  }
}

before(async () => {
  fs.mkdirSync(path.dirname(inventory), { recursive: true })
  fs.writeFileSync(inventory, '"items"\n{\n}\n', 'utf8')
  fs.mkdirSync(path.join(cs2Dir, 'game', 'csgo'), { recursive: true })
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(configDir, { recursive: true })
  port = await freePort()

  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      CSGO_LEGACY_DIR: csgoDir,
      CS2_DIR: cs2Dir,
      GC_CONFIG_DIR: configDir,
      USERPROFILE: home,
      HOME: home,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { output += chunk })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 10_000)
    child.stdout.on('data', (chunk) => {
      output += chunk
      if (output.includes('gc-editor server on')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited ${code}:\n${output}`))
    })
  })

  const session = await request('GET', '/api/session')
  assert.equal(session.status, 200)
  token = session.json.token
  assert.match(token, /^[0-9a-f-]{36}$/)
})

after(() => {
  if (child && !child.killed) child.kill()
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('rejects writes without a trusted origin or token', async () => {
  const noOrigin = await request('POST', '/api/rcon/config', {
    headers: { Host: `127.0.0.1:${port}`, 'x-gc-token': token },
    body: { freeFormConsole: false },
  })
  assert.equal(noOrigin.status, 403)

  const noToken = await request('POST', '/api/rcon/config', {
    headers: { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}` },
    body: { freeFormConsole: false },
  })
  assert.equal(noToken.status, 403)
})

test('rejects spoofed origin and host', async () => {
  const badOrigin = await request('POST', '/api/rcon/config', {
    headers: trusted({ Origin: 'http://evil.example' }),
    body: { freeFormConsole: false },
  })
  assert.equal(badOrigin.status, 403)

  const badHost = await request('POST', '/api/rcon/config', {
    headers: trusted({ Host: 'evil.example' }),
    body: { freeFormConsole: false },
  })
  assert.equal(badHost.status, 403)
})

test('accepts a valid token and origin', async () => {
  const response = await request('POST', '/api/rcon/config', {
    headers: trusted(),
    body: { freeFormConsole: false },
  })
  assert.equal(response.status, 200)
  assert.equal(response.json.ok, true)
  assert.equal(fs.existsSync(path.join(configDir, 'rcon.json')), true)
})

test('save body path is ignored and an outside query path is refused', async () => {
  const pwned = path.join(tmp, 'pwned.txt')
  const text = '"items"\n{\n}\n'
  const response = await request('POST', '/api/inventory/save', {
    headers: trusted(),
    body: { game: 'csgo', path: pwned, text },
  })
  assert.equal(response.status, 200)
  assert.equal(response.json.path, inventory)
  assert.equal(fs.existsSync(pwned), false)
  assert.equal(fs.readFileSync(inventory, 'utf8'), text)

  const outside = await request('POST', `/api/inventory/save?path=${encodeURIComponent(pwned)}`, {
    headers: trusted(),
    body: { game: 'csgo', text },
  })
  assert.equal(outside.status, 403)
  assert.equal(fs.existsSync(pwned), false)
})

test('preview returns the exact give command without RCON', async () => {
  const item = {
    def_index: 7,
    count: 2,
    level: 5,
    quality: 4,
    rarity: 6,
    name: 'a "quote" \\ name',
    paint: 44,
    seed: 661,
    wear: 0.15,
    stattrak: 404,
    stickers: [{ id: 37, wear: 0.1 }, null, { id: 38 }],
  }
  const response = await request('POST', '/api/rcon/preview', {
    headers: trusted(),
    body: { item },
  })
  assert.equal(response.status, 200)
  assert.equal(response.json.command, buildGiveCommand(item))
})

test('rejects console commands outside the allow-list', async () => {
  const blocked = await request('POST', '/api/rcon', {
    headers: trusted(),
    body: { game: 'csgo', command: 'quit' },
  })
  assert.equal(blocked.status, 403)
  assert.match(blocked.json.raw, /command not allowed/)

  const allowed = await request('POST', '/api/rcon', {
    headers: trusted(),
    body: { game: 'csgo', command: 'status' },
  })
  assert.equal(allowed.status, 200)
})
