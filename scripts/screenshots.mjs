// Regenerates the README screenshots in media/ from the built app.
//
//   npm run screenshots
//   CHROME_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:5173 npm run screenshots
//
// Zero dependencies: the browser is driven over --remote-debugging-pipe, which
// is NUL-terminated JSON on fd 3 (write) and fd 4 (read), so no WebSocket
// client is needed. Needs a local Chrome or Edge; the app must be built
// (`npm run build`). If nothing answers on BASE_URL the script starts
// `node server/index.js` itself and stops it again on the way out.
//
// Gallery shots load demo/inventory.txt when it exists (it is gitignored), so
// the README does not show a personal inventory.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA = path.join(ROOT, 'media')
const DEMO = path.join(ROOT, 'demo', 'inventory.txt')
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const VIEWPORT = { width: 1440, height: 1080 }
const SETTLE_MS = 450

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean)

function findBrowser() {
  for (const candidate of BROWSERS) {
    if (fs.existsSync(candidate)) return candidate
  }
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function isUp() {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function startServer() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'web', 'index.html'))) {
    throw new Error('no built app at dist/web. Run "npm run build" once, then retry.')
  }
  const child = spawn(process.execPath, [path.join('server', 'index.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isUp()) return child
    if (child.exitCode !== null) break
    await sleep(200)
  }
  child.kill()
  throw new Error(`the app did not answer on ${BASE}`)
}

/** CDP over the browser's fd-3/fd-4 pipe. */
// Images below the fold are lazy, so only wait for the ones actually on screen.
const IMAGES_SETTLED = `[...document.images].every((image) => {
  const rect = image.getBoundingClientRect()
  const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
  return !visible || image.complete
})`

function pipeClient(child) {
  const toBrowser = child.stdio[3]
  const fromBrowser = child.stdio[4]
  let buffer = Buffer.alloc(0)
  let nextId = 0
  const pending = new Map()
  const listeners = new Set()

  fromBrowser.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const end = buffer.indexOf(0)
      if (end < 0) break
      const text = buffer.subarray(0, end).toString('utf8')
      buffer = buffer.subarray(end + 1)
      if (!text) continue
      let message
      try { message = JSON.parse(text) } catch { continue }
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result ?? {})
      } else {
        for (const listener of listeners) listener(message)
      }
    }
  })

  child.on('exit', (code) => {
    for (const { reject } of pending.values()) reject(new Error(`browser exited (${code})`))
    pending.clear()
  })

  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, { resolve, reject })
        toBrowser.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`)
      })
    },
    once(method) {
      return new Promise((resolve) => {
        const listener = (message) => {
          if (message.method !== method) return
          listeners.delete(listener)
          resolve(message)
        }
        listeners.add(listener)
      })
    },
  }
}

async function connect(browserPath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-editor-shots-'))
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
    `--user-data-dir=${profile}`,
    '--remote-debugging-pipe',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
  browser.stderr.on('data', () => {})

  const cdp = pipeClient(browser)
  let targetId
  for (let attempt = 0; attempt < 50 && !targetId; attempt += 1) {
    try {
      const { targetInfos } = await cdp.send('Target.getTargets')
      targetId = targetInfos.find((target) => target.type === 'page')?.targetId
    } catch {
      // the browser is still starting
    }
    if (!targetId) await sleep(200)
  }
  if (!targetId) throw new Error('the browser never exposed a page target')

  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => cdp.send(method, params, sessionId)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })

  async function evaluate(expression) {
    try {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      return exceptionDetails ? undefined : result.value
    } catch {
      return undefined
    }
  }

  async function waitFor(expression, timeout = 25000) {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return
      await sleep(120)
    }
    throw new Error(`timed out waiting for: ${expression}`)
  }

  async function clickButton(label) {
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === ${JSON.stringify(label)})
      if (!button) return false
      button.click()
      return true
    })()`)
    if (!clicked) throw new Error(`no button labelled "${label}"`)
    await sleep(SETTLE_MS)
  }

  async function clickCards(count) {
    const clicked = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.card-hit')].slice(0, ${count})
      for (const card of cards) card.click()
      return cards.length
    })()`)
    if (clicked !== count) throw new Error(`expected ${count} item cards, clicked ${clicked}`)
    await sleep(SETTLE_MS)
  }

  async function clickSelector(selector) {
    const clicked = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) return false
      element.click()
      return true
    })()`)
    if (!clicked) throw new Error(`no element for ${selector}`)
    await sleep(SETTLE_MS)
  }

  async function setInputValue(selector, value) {
    const changed = await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (!changed) throw new Error(`no input for ${selector}`)
    await sleep(150)
  }

  /** Gallery, pointed at the gitignored demo inventory when it exists. */
  async function openGallery() {
    await clickButton('Gallery')
    if (!fs.existsSync(DEMO)) return
    await clickButton('Change path')
    await setInputValue('input[aria-label="Path to inventory.txt"]', 'demo/inventory.txt')
    await clickButton('Reload')
    await waitFor('!!document.querySelector(\'[title*="demo"]\')')
    await waitFor('!!document.querySelector(".item-card")')
    await clickButton('Hide path')
  }

  function isDialogOpen() {
    return waitFor('!!document.querySelector(\'[role="dialog"]\')')
  }

  async function openPage() {
    const loaded = cdp.once('Page.loadEventFired')
    await send('Page.navigate', { url: BASE })
    await Promise.race([loaded, sleep(10000)])
    await waitFor('document.readyState === "complete"')
    try {
      await waitFor('!!(document.querySelector(".item-card") || document.querySelector(".empty-state"))', 10000)
    } catch {
      const where = await evaluate('`${location.href} :: ${document.body?.innerText.slice(0, 160) ?? "no body"}`')
      throw new Error(`the app did not render at ${BASE} (${where ?? 'no page context'})`)
    }
    await waitFor(IMAGES_SETTLED)
    await sleep(SETTLE_MS)
  }

  async function shot(name, prepare) {
    await openPage()
    if (prepare) await prepare()
    await waitFor('!!document.querySelector(".item-card")')
    await waitFor(IMAGES_SETTLED)
    await sleep(SETTLE_MS)
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(MEDIA, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`saved media/${name}.png`)
  }

  return {
    shot,
    clickButton,
    clickCards,
    clickSelector,
    openGallery,
    isDialogOpen,
    async close() {
      try { await cdp.send('Browser.close') } catch { /* already gone */ }
      await sleep(300)
      if (browser.exitCode === null) browser.kill()
      try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* windows keeps locks */ }
    },
  }
}

async function main() {
  const browserPath = findBrowser()
  if (!browserPath) {
    throw new Error('no Chrome or Edge found. Set CHROME_PATH to the browser executable.')
  }
  console.log(`browser: ${browserPath}`)

  let server = null
  if (!(await isUp())) {
    console.log(`starting the app on ${BASE}…`)
    server = await startServer()
  }

  const session = await connect(browserPath)
  try {
    await session.shot('live')

    await session.shot('live-list', async () => {
      await session.clickSelector('button[aria-label="List view"]')
    })

    await session.shot('configurator', async () => {
      await session.clickCards(1)
      await session.isDialogOpen()
    })

    await session.shot('offline', async () => {
      await session.openGallery()
    })

    await session.shot('offline-list', async () => {
      await session.openGallery()
      await session.clickSelector('button[aria-label="List view"]')
    })

    await session.shot('editor', async () => {
      await session.openGallery()
      await session.clickCards(1)
      await session.isDialogOpen()
    })

    await session.shot('selection', async () => {
      await session.openGallery()
      await session.clickButton('Select')
      await session.clickCards(3)
    })
  } finally {
    await session.close()
    server?.kill()
  }
}

main().catch((cause) => {
  console.error(`screenshots failed: ${cause.message}`)
  process.exitCode = 1
})
