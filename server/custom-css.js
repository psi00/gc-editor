// user stylesheet: one literal file on disk, seeded with a commented starter.
// the app links it from index.html and `?safe=1` skips it, so a broken theme
// never locks the editor out. node builtins only.
import fs from 'node:fs'
import path from 'node:path'

export const CUSTOM_CSS_LIMIT = 256 * 1024

// no default rules: the file is created empty, and the token list lives in the README.
export const STARTER = ''

// seeded once, and again if the file is deleted; the starter has no rules.
export function ensureCustomCss(file) {
  if (!file || fs.existsSync(file)) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, STARTER, 'utf8')
  return true
}

export function readCustomCss(file) {
  if (!file || !fs.existsSync(file)) return { exists: false, css: '', size: 0, updatedAt: null }
  const css = fs.readFileSync(file, 'utf8')
  return {
    exists: true,
    css,
    size: Buffer.byteLength(css, 'utf8'),
    updatedAt: fs.statSync(file).mtime.toISOString(),
  }
}

export function writeCustomCss(file, css) {
  if (typeof css !== 'string') throw new Error('css must be a string')
  const size = Buffer.byteLength(css, 'utf8')
  if (size > CUSTOM_CSS_LIMIT) {
    const error = new Error(`stylesheet is ${size} bytes; the limit is ${CUSTOM_CSS_LIMIT}`)
    error.code = 'too-large'
    throw error
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  let backup = null
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = `${file}.${stamp}.bak`
    fs.copyFileSync(file, backup)
  }
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, css, 'utf8')
  fs.renameSync(tmp, file)
  return { backup, size, updatedAt: fs.statSync(file).mtime.toISOString() }
}
