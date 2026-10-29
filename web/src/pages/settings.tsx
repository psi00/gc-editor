import { useState } from 'react'
import {
  Database, Eye, EyeOff, FolderOpen, Loader2, Server, Wifi, WifiOff,
} from 'lucide-react'
import { api, store } from '../lib/api'
import { useReport } from '../lib/report'
import { rconHint } from '../lib/rcon-hints'
import type { RconStatus, SchemaState, SettingsInfo } from '../lib/app-types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'

type Reply = { command: 'ping' | 'status'; raw: string; ok: boolean }

export function SettingsPage({ settings, onReloadSettings, schema, status, onCheckStatus }: {
  settings: SettingsInfo | null
  onReloadSettings: () => Promise<void>
  schema: SchemaState
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
  ] : []

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary">
          <Server className="size-3.5" />Local configuration
        </div>
        <h1 className="text-[30px] font-semibold tracking-[-.04em] sm:text-[34px]">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          RCON credentials live in this browser's localStorage. The password is masked by default and is never written
          to Activity. Everything else is resolved by the local server from the game directory.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium"><Wifi className="size-4 text-primary" />RCON</h2>
            <span className={cn('chip', status.health === 'ready' ? 'chip-ok' : status.health === 'unknown' ? '' : 'chip-warn')}>
              {status.checking ? 'checking…' : status.health === 'ready' ? 'client registered' : status.health === 'auth' ? 'auth failed' : status.health === 'gc' ? 'gc unavailable' : 'unknown'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <label>
              <span className="field-label">Host</span>
              <Input
                value={host}
                onChange={(event) => { setHost(event.target.value); store.host = event.target.value; store.save() }}
                placeholder="127.0.0.1"
                className={cn('h-9 text-xs', !hostValid && 'border-red-500/50')}
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
                className={cn('h-9 text-xs', !portValid && 'border-red-500/50')}
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
            <span className="mt-1 block text-[9px] text-muted-foreground">length {password.length} · never logged</span>
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
              {savingDir ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}Save override
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Saving re-resolves every path and reloads the schema cache. Leave blank to auto-detect.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/[.06]">
            <table className="data-table">
              <tbody>
                {paths.map((entry) => (
                  <tr key={entry.label}>
                    <td className="w-28 whitespace-nowrap text-muted-foreground">{entry.label}</td>
                    <td className="break-all font-mono text-[10px]">{entry.value ?? <span className="text-muted-foreground">not resolved</span>}</td>
                    <td className="w-10 text-right">
                      {entry.exists === true && <span className="chip chip-ok">yes</span>}
                      {entry.exists === false && <span className="chip chip-err">missing</span>}
                      {entry.exists == null && <span className="chip" title="existence is not reported by the API">—</span>}
                    </td>
                  </tr>
                ))}
                {!settings && <tr><td className="text-muted-foreground" colSpan={3}>Loading settings…</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-primary" />Schema cache</h2>
            <div className="flex items-center gap-2">
              <span className={cn('chip', schema.cached ? 'chip-ok' : 'chip-warn')}>{schema.cached ? 'cached' : 'empty'}</span>
              <span className="chip">{schema.weapons.length} weapons</span>
              {['crates', 'stickers', 'agents', 'keys', 'music_kits', 'collectibles', 'tools']
                .filter((key) => schema.counts[key] != null)
                .map((key) => (
                  <span key={key} className="chip">{key} {schema.counts[key]}</span>
                ))}
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            The cache is fetched once while online, then never touched at runtime. Without it the catalogue shows setup
            guidance; manual give and the offline editor keep working.
          </p>
          <pre className="log-surface mt-3">{'npm run fetch-schema\nnpm run prefetch-images'}</pre>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Writes to gitignored <span className="font-mono">data/</span> and <span className="font-mono">imgs/</span>.
            Restart the server after a fetch so it reloads the cache.
          </p>

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Current settings JSON</summary>
            <pre className="log-surface mt-2 max-h-64 overflow-auto">{JSON.stringify(settings, null, 2)}</pre>
          </details>
        </section>
      </div>

      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        gc-editor · local RCON + inventory.txt workbench · api on :5174 · one React app
      </p>
    </main>
  )
}
