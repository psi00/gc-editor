import { useEffect, useState } from 'react'
import {
  Eraser, Eye, EyeOff, FolderOpen, Loader2, Palette, RefreshCw, Save, Wifi, WifiOff,
} from 'lucide-react'
import { api, store } from '../lib/api'
import { useReport } from '../lib/report'
import { rconHint } from '../lib/rcon-hints'
import type { RconStatus, SettingsInfo } from '../lib/app-types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'

type Reply = { command: 'ping' | 'status'; raw: string; ok: boolean }

export function SettingsPage({ settings, onReloadSettings, status, onCheckStatus }: {
  settings: SettingsInfo | null
  onReloadSettings: () => Promise<void>
  status: RconStatus
  onCheckStatus: () => void
}) {
  const report = useReport()

  const [host, setHost] = useState(store.host)
  const [port, setPort] = useState(store.port)
  const [password, setPassword] = useState(store.password)
  const [showPassword, setShowPassword] = useState(false)
  const [gameDir, setGameDir] = useState('')
  const [testing, setTesting] = useState<'ping' | 'status' | null>(null)
  const [savingDir, setSavingDir] = useState(false)
  const [reply, setReply] = useState<Reply | null>(null)
  const [error, setError] = useState('')
  const [css, setCss] = useState('')
  const [savedCss, setSavedCss] = useState('')
  const [cssLimit, setCssLimit] = useState(0)
  const [cssBusy, setCssBusy] = useState<'load' | 'save' | 'clear' | null>(null)
  const [cssError, setCssError] = useState('')

  const cssDirty = css !== savedCss

  const portValid = Number(port) > 0 && Number(port) <= 65535
  const hostValid = host.trim().length > 0

  const test = async (command: 'ping' | 'status') => {
    setTesting(command)
    setError('')
    setReply(null)
    try {
      const response = await api('/api/rcon', {
        method: 'POST',
        body: JSON.stringify({ host: store.host, port: store.port, password: store.password, command }),
      })
      setReply({ command, raw: String(response.raw ?? ''), ok: Boolean(response.ok) })
      report(
        { kind: 'rcon', label: `${command} test`, raw: String(response.raw ?? ''), ok: Boolean(response.ok) },
        { title: `${command} reply`, body: String(response.raw ?? '') },
        response.ok ? 'ok' : 'err',
      )
      onCheckStatus()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: `${command} test`, raw: message, ok: false }, { title: 'RCON request failed', body: message }, 'err')
    } finally {
      setTesting(null)
    }
  }

  const saveGameDir = async () => {
    setSavingDir(true)
    setError('')
    try {
      const response = await api('/api/settings', { method: 'POST', body: JSON.stringify({ gameDir }) })
      if (response.error) throw new Error(String(response.error))
      await onReloadSettings()
      report(
        { kind: 'settings', label: 'game directory override saved', ok: true, detail: response.gameDir ?? gameDir },
        { title: 'Game directory updated', body: response.gameDir ?? gameDir },
        'ok',
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: 'save game directory', raw: message, ok: false }, { title: 'Could not save game directory', body: message }, 'err')
    } finally {
      setSavingDir(false)
    }
  }

  const loadCss = async () => {
    setCssBusy('load')
    setCssError('')
    try {
      const response = await api('/api/custom-css')
      if (response.error) throw new Error(String(response.error))
      const text = typeof response.css === 'string' ? response.css : ''
      setCss(text)
      setSavedCss(text)
      setCssLimit(Number(response.limit) || 0)
    } catch (cause) {
      setCssError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCssBusy(null)
    }
  }

  useEffect(() => { void loadCss() }, [])

  const writeCss = async (next: string, mode: 'save' | 'clear') => {
    setCssBusy(mode)
    setCssError('')
    try {
      const response = await api('/api/custom-css', { method: 'POST', body: JSON.stringify({ css: next }) })
      if (response.error) throw new Error(String(response.error))
      setCss(next)
      setSavedCss(next)
      // re-point the <link> so the saved sheet applies without a page reload
      const link = document.querySelector<HTMLLinkElement>('link[data-custom-css]')
      if (link) link.href = `/api/custom-css.css?v=${Date.now()}`
      report(
        { kind: 'settings', label: mode === 'clear' ? 'custom css cleared' : 'custom css saved', ok: true, detail: response.path },
        { title: mode === 'clear' ? 'Custom CSS cleared' : 'Custom CSS applied', body: `${Number(response.size ?? 0)} bytes written to ${response.path}` },
        'ok',
      )
      await onReloadSettings()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setCssError(message)
      report({ kind: 'error', label: `${mode} custom css`, raw: message, ok: false }, { title: 'Could not save custom CSS', body: message }, 'err')
    } finally {
      setCssBusy(null)
    }
  }

  const paths: { label: string; value: string | null; exists?: boolean | null }[] = settings ? [
    { label: 'game dir', value: settings.gameDir },
    { label: 'inventory.txt', value: settings.inventoryTxt, exists: settings.inventoryExists },
    { label: 'items_game.txt', value: settings.itemsGameTxt, exists: settings.itemsGameExists },
    { label: 'config.txt', value: settings.configTxt },
    { label: 'schema json', value: settings.schemaCache, exists: settings.schemaCached },
    { label: 'schema meta', value: typeof settings.schemaMeta === 'string' ? settings.schemaMeta : null },
    { label: 'images dir', value: settings.imgsDir },
    { label: 'data dir', value: settings.dataDir },
    { label: 'user cache', value: settings.userCacheDir },
    { label: 'custom.css', value: settings.customCss, exists: settings.customCssExists },
  ] : []

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="panel">
          <h2 className="flex items-center gap-2 text-sm font-medium"><Wifi className="size-4 text-primary" />RCON</h2>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <label>
              <span className="field-label">Host</span>
              <Input
                value={host}
                onChange={(event) => { setHost(event.target.value); store.host = event.target.value; store.save() }}
                placeholder="127.0.0.1"
                className={cn('h-9 text-xs', !hostValid && 'border-err-strong/70')}
                autoComplete="off"
              />
            </label>
            <label>
              <span className="field-label">Port</span>
              <Input
                value={port}
                onChange={(event) => { setPort(event.target.value); store.port = event.target.value; store.save() }}
                placeholder="37016"
                inputMode="numeric"
                className={cn('h-9 text-xs', !portValid && 'border-err-strong/70')}
                autoComplete="off"
              />
            </label>
          </div>

          <label className="mt-2 block">
            <span className="field-label">Password</span>
            <div className="flex items-center gap-2">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => { setPassword(event.target.value); store.password = event.target.value; store.save() }}
                placeholder="rcon password"
                className="h-9 flex-1 text-xs"
                autoComplete="new-password"
                spellCheck={false}
              />
              <Button variant="secondary" size="icon" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground">length {password.length} · never logged</span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void test('ping')} disabled={testing !== null || !hostValid || !portValid}>
              {testing === 'ping' ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}Ping
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void test('status')} disabled={testing !== null || !hostValid || !portValid}>
              {testing === 'status' ? <Loader2 className="size-3.5 animate-spin" /> : <WifiOff className="size-3.5" />}Status
            </Button>
          </div>

          {(reply || status.raw) && (
            <div className={cn('log-surface mt-3', (reply?.ok ?? status.health === 'ready') ? 'ok' : 'err')}>
              {reply ? `${reply.command} -> ${reply.raw}` : `status -> ${status.raw}`}
              {'\n'}
              <span className="text-white/45">{rconHint(reply?.raw ?? status.raw)}</span>
            </div>
          )}
          {error && <div className="log-surface err mt-3">{error}</div>}
        </section>

        <section className="panel">
          <h2 className="flex items-center gap-2 text-sm font-medium"><FolderOpen className="size-4 text-primary" />Game directory</h2>
          <div className="mt-3 flex gap-2">
            <Input
              value={gameDir}
              onChange={(event) => setGameDir(event.target.value)}
              placeholder={settings?.gameDir ?? 'absolute path to game dir'}
              aria-label="Game directory override"
              className="h-9 flex-1 font-mono text-xs"
            />
            <Button size="sm" onClick={() => void saveGameDir()} disabled={savingDir}>
              {savingDir ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save override
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Saving re-resolves every path and reloads the schema cache. Leave blank to auto-detect.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/[.06]">
            <table className="data-table">
              <tbody>
                {paths.map((entry) => (
                  <tr key={entry.label}>
                    <td className="w-28 whitespace-nowrap text-muted-foreground">{entry.label}</td>
                    <td className="break-all font-mono text-[11px]" title={entry.value ?? undefined}>{entry.value ?? <span className="text-muted-foreground">not resolved</span>}</td>
                    <td className="w-14 text-right">
                      {entry.exists === false && <span className="chip chip-err">missing</span>}
                    </td>
                  </tr>
                ))}
                {!settings && <tr><td className="text-muted-foreground" colSpan={3}>Loading settings…</td></tr>}
              </tbody>
            </table>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Current settings JSON</summary>
            <pre className="log-surface mt-2 max-h-64 overflow-auto">{JSON.stringify(settings, null, 2)}</pre>
          </details>
        </section>

        <section className="panel xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium"><Palette className="size-4 text-primary" />Custom CSS</h2>
            <div className="flex items-center gap-2">
              <span className={cn('chip', cssDirty ? 'chip-warn' : css.trim() ? 'chip-ok' : '')}>
                {cssDirty ? 'unsaved' : css.trim() ? 'active' : 'empty'}
              </span>
              <span className="chip">{css.length.toLocaleString()} chars</span>
            </div>
          </div>

          <textarea
            value={css}
            onChange={(event) => setCss(event.target.value)}
            spellCheck={false}
            aria-label="Custom CSS"
            placeholder=":root { --primary: 280 90% 62%; }"
            className="log-surface mt-3 h-64 w-full resize-y"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void writeCss(css, 'save')} disabled={cssBusy !== null || !cssDirty}>
              {cssBusy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save and apply
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void loadCss()} disabled={cssBusy !== null}>
              {cssBusy === 'load' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Reload from disk
            </Button>
            <Button variant="danger" size="sm" onClick={() => void writeCss('', 'clear')} disabled={cssBusy !== null || !css.trim()}>
              {cssBusy === 'clear' ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />}Clear
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {cssLimit ? `${Math.round(cssLimit / 1024)} KB limit` : ''}
            </span>
          </div>

          {cssError && <div className="log-surface err mt-3">{cssError}</div>}
        </section>
      </div>
    </main>
  )
}
