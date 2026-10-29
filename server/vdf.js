// valve keyvalues parse/serialize, bom-safe, non-ascii safe.
// supports the subset used by inventory.txt: "key" { ... } and "key" "value".
// preserves roundtrip via sorted keys (BTreeMap parity with gt-610 editor).

export function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1)
  return s
}

export function parseVdf(text) {
  const src = stripBom(text)
  let i = 0
  const n = src.length

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
      if (!peekQuoted()) { i++; continue }
      const key = readQuoted()
      skipWsAndComments()
      if (src[i] === '{') {
        i++
        obj[key] = parseBlock()
      } else if (src[i] === '"') {
        obj[key] = readQuoted()
      } else if (src[i] === '}') {
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
    if (!peekQuoted()) break
    const key = readQuoted()
    skipWsAndComments()
    if (src[i] === '{') {
      i++
      root[key] = parseBlock()
    } else if (src[i] === '"') {
      root[key] = readQuoted()
    } else break
  }
  return root
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function serializeVdf(root) {
  const lines = []
  function writeObj(obj, indent) {
    const keys = Object.keys(obj).sort((a, b) => {
      const na = Number(a); const nb = Number(b)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a < b ? -1 : a > b ? 1 : 0
    })
    for (const k of keys) {
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
