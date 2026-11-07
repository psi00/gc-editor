// valve keyvalues parse/serialize, bom-safe, non-ascii safe.
// supports the subset used by inventory.txt: "key" { ... } and "key" "value".
// preserves roundtrip by keeping key insertion order from the source.

export function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1)
  return s
}

export function parseVdf(text) {
  return parseVdfDetailed(text).root
}

export function parseVdfDetailed(text) {
  const src = stripBom(text)
  let i = 0
  const n = src.length
  const skippedLines = new Set()
  const lineStarts = [0]
  for (let at = 0; at < n; at++) if (src[at] === '\n') lineStarts.push(at + 1)

  function lineAt(pos) {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lineStarts[mid] <= pos) lo = mid + 1
      else hi = mid - 1
    }
    return Math.max(0, hi)
  }

  function markLine(pos) {
    skippedLines.add(lineAt(pos))
  }

  function markResidual(from) {
    const first = lineAt(from)
    const lines = src.slice(from).split('\n')
    for (let offset = 0; offset < lines.length; offset++) {
      const line = lines[offset].trim()
      if (line && !line.startsWith('//')) skippedLines.add(first + offset)
    }
  }

  function skipWsAndComments() {
    while (i < n) {
      const c = src[i]
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++
        continue
      }
      if (/\s/.test(c)) { i++; continue }
      break
    }
  }

  function readQuoted() {
    skipWsAndComments()
    if (src[i] !== '"') throw new Error(`expected " at ${i}, got ${src[i]}`)
    i++
    let out = ''
    while (i < n) {
      const c = src[i]
      if (c === '\\' && i + 1 < n) {
        const nx = src[i + 1]
        if (nx === 'n') out += '\n'
        else if (nx === 't') out += '\t'
        else if (nx === '\\') out += '\\'
        else if (nx === '"') out += '"'
        else out += nx
        i += 2
        continue
      }
      if (c === '"') { i++; return out }
      out += c
      i++
    }
    throw new Error('unterminated string')
  }

  function peekQuoted() {
    const save = i
    try {
      skipWsAndComments()
      return src[i] === '"'
    } finally {
      i = save
    }
  }

  function parseBlock() {
    const obj = {}
    while (true) {
      skipWsAndComments()
      if (i >= n) break
      if (src[i] === '}') { i++; break }
      if (!peekQuoted()) { skipWsAndComments(); markLine(i); i++; continue }
      const keyPos = i
      const key = readQuoted()
      skipWsAndComments()
      if (src[i] === '{') {
        i++
        obj[key] = parseBlock()
      } else if (src[i] === '"') {
        obj[key] = readQuoted()
      } else if (src[i] === '}') {
        markLine(keyPos)
        continue
      } else {
        // tolerate bare token
        let tok = ''
        while (i < n && !/\s/.test(src[i]) && src[i] !== '}') { tok += src[i++]; }
        obj[key] = tok
      }
    }
    return obj
  }

  skipWsAndComments()
  const root = {}
  while (i < n) {
    skipWsAndComments()
    if (i >= n) break
    if (!peekQuoted()) { markResidual(i); break }
    const keyPos = i
    const key = readQuoted()
    skipWsAndComments()
    if (src[i] === '{') {
      i++
      root[key] = parseBlock()
    } else if (src[i] === '"') {
      root[key] = readQuoted()
    } else {
      markResidual(keyPos)
      break
    }
  }
  return { root, skipped: skippedLines.size }
}

function esc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

export function serializeVdf(root) {
  const lines = []
  function writeObj(obj, indent) {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const pad = '\t'.repeat(indent)
      if (v !== null && typeof v === 'object') {
        lines.push(`${pad}"${esc(k)}"`)
        lines.push(`${pad}{`)
        writeObj(v, indent + 1)
        lines.push(`${pad}}`)
      } else {
        lines.push(`${pad}"${esc(k)}"\t\t"${esc(v ?? '')}"`)
      }
    }
  }
  for (const top of Object.keys(root)) {
    const value = root[top]
    if (value !== null && typeof value === 'object') {
      lines.push(`"${esc(top)}"`)
      lines.push('{')
      writeObj(value, 1)
      lines.push('}')
    } else {
      lines.push(`"${esc(top)}"\t\t"${esc(value ?? '')}"`)
    }
  }
  return lines.join('\n') + '\n'
}
