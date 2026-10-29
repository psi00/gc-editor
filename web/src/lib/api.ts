export async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...((opts.headers as Record<string, string>) || {}) },
  })
  return r.json()
}

export const store = {
  host: localStorage.getItem('gc.host') || '127.0.0.1',
  port: localStorage.getItem('gc.port') || '37016',
  password: localStorage.getItem('gc.password') || '',
  save() {
    localStorage.setItem('gc.host', this.host)
    localStorage.setItem('gc.port', this.port)
    localStorage.setItem('gc.password', this.password)
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
