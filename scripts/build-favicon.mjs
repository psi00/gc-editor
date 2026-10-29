// build the favicon set from web/favicon.png.
//
// the source art is a 128x128 RGBA png, so this decodes it, area-averages it
// down to the sizes browsers ask for, and writes web/public/*.png plus a
// multi-image favicon.ico. zero deps: png encode/decode is node:zlib + crc32.
// run `npm run build-favicon` after replacing the source image.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'web', 'favicon.png')
const OUT = path.join(ROOT, 'web', 'public')
const THEME = [0x15, 0x17, 0x1c] // matches the theme-color meta tag

// --- png decode (8-bit, non-interlaced, rgb / rgba) ---

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a png')
  let offset = 8
  let ihdr = null
  const idat = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const body = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      }
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + len
  }
  if (!ihdr) throw new Error('no IHDR')
  if (ihdr.depth !== 8 || ihdr.interlace !== 0) throw new Error('need an 8-bit non-interlaced png')
  const channels = ihdr.color === 6 ? 4 : ihdr.color === 2 ? 3 : ihdr.color === 0 ? 1 : 0
  if (!channels) throw new Error(`unsupported colour type ${ihdr.color}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = ihdr.width * channels
  const pixels = Buffer.alloc(stride * ihdr.height)
  let pos = 0
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[pos++]
    const row = y * stride
    const prev = row - stride
    for (let i = 0; i < stride; i++) {
      const x = raw[pos + i]
      const a = i >= channels ? pixels[row + i - channels] : 0
      const b = y > 0 ? pixels[prev + i] : 0
      const c = i >= channels && y > 0 ? pixels[prev + i - channels] : 0
      const v =
        filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)
      pixels[row + i] = v & 0xff
    }
    pos += stride
  }

  const data = Buffer.alloc(ihdr.width * ihdr.height * 4)
  for (let p = 0; p < ihdr.width * ihdr.height; p++) {
    const s = p * channels
    const d = p * 4
    const grey = channels === 1
    data[d] = pixels[s]
    data[d + 1] = grey ? pixels[s] : pixels[s + 1]
    data[d + 2] = grey ? pixels[s] : pixels[s + 2]
    data[d + 3] = channels === 4 ? pixels[s + 3] : 0xff
  }
  return { width: ihdr.width, height: ihdr.height, data }
}

// --- png encode (rgba, filter 0) ---

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- scaling ---

// area-average in premultiplied alpha so transparent pixels don't bleed grey
// into the edges; works for any ratio, including the 128 -> 48 downscale.
function resize(src, size) {
  const { width, height, data } = src
  const out = Buffer.alloc(size * size * 4)
  const scale = width / size
  for (let y = 0; y < size; y++) {
    const y0 = y * scale
    const y1 = y0 + scale
    for (let x = 0; x < size; x++) {
      const x0 = x * scale
      const x1 = x0 + scale
      let cr = 0
      let cg = 0
      let cb = 0
      let ca = 0
      let weight = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        if (wy <= 0) continue
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          if (wx <= 0) continue
          const w = wx * wy
          const i = (Math.min(sy, height - 1) * width + Math.min(sx, width - 1)) * 4
          const alpha = data[i + 3] / 255
          cr += data[i] * alpha * w
          cg += data[i + 1] * alpha * w
          cb += data[i + 2] * alpha * w
          ca += alpha * w
          weight += w
        }
      }
      const o = (y * size + x) * 4
      out[o] = ca ? Math.round(cr / ca) : 0
      out[o + 1] = ca ? Math.round(cg / ca) : 0
      out[o + 2] = ca ? Math.round(cb / ca) : 0
      out[o + 3] = Math.round((ca / weight) * 255)
    }
  }
  return { width: size, height: size, data: out }
}

// ios drops alpha and paints black behind it, so the touch icon gets the theme
// colour baked in with the art centred.
function onTheme(size, art) {
  const out = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = THEME[0]
    out[i * 4 + 1] = THEME[1]
    out[i * 4 + 2] = THEME[2]
    out[i * 4 + 3] = 0xff
  }
  const scale = size / art.width
  const artSize = Math.round(art.width * scale)
  const offset = Math.round((size - artSize) / 2)
  for (let y = 0; y < artSize; y++) {
    for (let x = 0; x < artSize; x++) {
      const s = (Math.min(Math.floor(y / scale), art.height - 1) * art.width + Math.min(Math.floor(x / scale), art.width - 1)) * 4
      const d = ((y + offset) * size + x + offset) * 4
      const alpha = art.data[s + 3] / 255
      for (let c = 0; c < 3; c++) out[d + c] = Math.round(art.data[s + c] * alpha + out[d + c] * (1 - alpha))
    }
  }
  return { width: size, height: size, data: out }
}

// --- ico ---

// png-in-ico is read by every current browser and keeps the 16px art crisp.
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, png }, i) => {
    const e = i * 16
    dir[e] = size >= 256 ? 0 : size
    dir[e + 1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, e + 4)
    dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(png.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.png)])
}

// --- build ---

if (!fs.existsSync(SOURCE)) {
  console.error(`missing ${path.relative(ROOT, SOURCE)} - drop the source art there first`)
  process.exit(1)
}

const src = decodePng(fs.readFileSync(SOURCE))
console.log(`source ${src.width}x${src.height}`)
fs.mkdirSync(OUT, { recursive: true })

const png = (size) => encodePng(resize(src, size))
const writes = []

for (const size of [16, 32, 48]) {
  const name = `favicon-${size}.png`
  writes.push([name, png(size)])
}
writes.push(['apple-touch-icon.png', encodePng(onTheme(180, src))])

const ico = buildIco([16, 32, 48].map((size) => ({ size, png: png(size) })))
writes.push(['favicon.ico', ico])

for (const [name, body] of writes) {
  fs.writeFileSync(path.join(OUT, name), body)
  console.log(`wrote web/public/${name} (${body.length} bytes)`)
}
