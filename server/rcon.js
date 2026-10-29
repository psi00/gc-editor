// minimal source rcon client (no deps). speaks SERVERDATA_AUTH + EXECCOMMAND.
// packet: <size:int32le><id:int32le><type:int32le><body:ascii><0x00><0x00>
import net from 'node:net'

const SERVERDATA_AUTH = 3
const SERVERDATA_AUTH_RESPONSE = 2
const SERVERDATA_EXECCOMMAND = 2
const SERVERDATA_RESPONSE_VALUE = 0

function encode(id, type, body) {
  const b = Buffer.from(body, 'ascii')
  const size = 4 + 4 + b.length + 2
  const buf = Buffer.alloc(4 + size)
  buf.writeInt32LE(size, 0)
  buf.writeInt32LE(id, 4)
  buf.writeInt32LE(type, 8)
  b.copy(buf, 12)
  buf[12 + b.length] = 0
  buf[12 + b.length + 1] = 0
  return buf
}

function decodePackets(buffer) {
  const out = []
  let off = 0
  while (off + 4 <= buffer.length) {
    const size = buffer.readInt32LE(off)
    if (off + 4 + size > buffer.length) break
    const id = buffer.readInt32LE(off + 4)
    const type = buffer.readInt32LE(off + 8)
    const body = buffer.subarray(off + 12, off + 4 + size - 2).toString('utf8')
    out.push({ id, type, body })
    off += 4 + size
  }
  return { packets: out, rest: buffer.subarray(off) }
}

export function rconCommand({ host = '127.0.0.1', port = 37016, password = '', command = '' }, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.write(encode(1, SERVERDATA_AUTH, password))
    })
    let buf = Buffer.alloc(0)
    let authed = false
    let done = false
    const timer = setTimeout(() => {
      if (!done) { done = true; sock.destroy(); reject(new Error('rcon timeout')) }
    }, timeoutMs)

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const { packets, rest } = decodePackets(buf)
      buf = rest
      for (const p of packets) {
        if (!authed) {
          if (p.type === SERVERDATA_AUTH_RESPONSE) {
            if (p.id === -1) {
              clearTimeout(timer); done = true; sock.end()
              reject(new Error('rcon auth failed'))
              return
            }
            authed = true
            sock.write(encode(2, SERVERDATA_EXECCOMMAND, command))
            // terminator to flush multi-packet responses
            sock.write(encode(3, SERVERDATA_EXECCOMMAND, ''))
          }
          continue
        }
        // csgo_gc sends single RESPONSE_VALUE then empty ack for terminator id 3
        if (p.id === 2 && p.type === SERVERDATA_RESPONSE_VALUE) {
          clearTimeout(timer); done = true
          const body = p.body.replace(/\0+$/, '')
          sock.end()
          resolve(body)
          return
        }
      }
    })
    sock.on('error', (e) => {
      if (!done) { done = true; clearTimeout(timer); reject(e) }
    })
    sock.on('close', () => {
      if (!done && authed) {
        // auth ok but no response packet yet - treat buffered as response
        done = true; clearTimeout(timer)
        resolve(buf.toString('utf8').replace(/\0+/g, '').trim())
      }
    })
  })
}

export function quoteValue(v) {
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// builds give_item from structured fields. mirrors gt-610 editor command builder.
export function buildGiveCommand({ def_index, count = 1, level, quality, rarity, name, paint, seed, wear, stattrak, music, spray_color, spray_remaining, tournament_event, tournament_stage, tournament_team0, tournament_team1, tournament_mvp, stickers = [] }) {
  if (count < 1 || count > 100) throw new Error('count must be 1-100')
  const parts = ['give_item', String(def_index)]
  if (count !== 1) parts.push(String(count))
  if (level != null) parts.push(`level=${level}`)
  if (quality != null) parts.push(`quality=${quality}`)
  if (rarity != null) parts.push(`rarity=${rarity}`)
  if (name) parts.push(`name=${quoteValue(name)}`)
  if (paint != null) parts.push(`paint=${paint}`)
  if (seed != null) parts.push(`seed=${seed}`)
  if (wear != null) parts.push(`wear=${wear}`)
  if (stattrak != null) parts.push(`stattrak=${stattrak}`)
  if (music != null) parts.push(`music=${music}`)
  if (spray_color != null) parts.push(`spray_color=${spray_color}`)
  if (spray_remaining != null) parts.push(`spray_remaining=${spray_remaining}`)
  if (tournament_event != null) parts.push(`tournament_event=${tournament_event}`)
  if (tournament_stage != null) parts.push(`tournament_stage=${tournament_stage}`)
  if (tournament_team0 != null) parts.push(`tournament_team0=${tournament_team0}`)
  if (tournament_team1 != null) parts.push(`tournament_team1=${tournament_team1}`)
  if (tournament_mvp != null) parts.push(`tournament_mvp=${tournament_mvp}`)
  stickers.forEach((s, idx) => {
    if (s == null || s.id == null) return
    parts.push(`sticker${idx}=${s.id}`)
    if (s.wear != null) parts.push(`sticker${idx}_wear=${s.wear}`)
    if (s.scale != null) parts.push(`sticker${idx}_scale=${s.scale}`)
    if (s.rotation != null) parts.push(`sticker${idx}_rotation=${s.rotation}`)
  })
  return parts.join(' ')
}
