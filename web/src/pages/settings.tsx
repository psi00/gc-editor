import { useEffect, useState } from 'react'
import {
  Eraser, Eye, EyeOff, FolderOpen, Loader2, Palette, RefreshCw, Save, Wifi, WifiOff,
} from 'lucide-react'
import { api, store, type RconProfile } from '../lib/api'
import { useReport } from '../lib/report'
import { rconHint } from '../lib/rcon-hints'
import type { RconStatus, SettingsInfo } from '../lib/app-types'
import type { GameId } from '../lib/catalog'
import { GAME_LABELS } from '../lib/catalog'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'

type Reply = { game: GameId; command: 'ping' | 'status'; raw: string; ok: boolean }

export function SettingsPage({ settings, onReloadSettings, status, onCheckStatus }: {
  settings: SettingsInfo | null
  onReloadSettings: () => Promise<void>
  status: RconStatus
  onCheckStatus: (game: GameId) => void
}) {
  const report = useReport()

  const [profiles, setProfiles] = useState<Record<GameId, RconProfile>>(() => ({
    csgo: { ...store.csgo },
    cs2: { ...store.cs2 },
  }))
  const [showPassword, setShowPassword] = useState<Record<GameId, boolean>>({ csgo: false, cs2: false })
  const [dirs, setDirs] = useState<Record<GameId, string>>({ csgo: '', cs2: '' })
  const [testing, setTesting] = useState<{ game: GameId; command: 'ping' | 'status' } | null>(null)
  const [savingGame, setSavingGame] = useState<GameId | null>(null)
  const [reply, setReply] = useState<Reply | null>(null)
  const [error, setError] = useState('')
  const [css, setCss] = useState('')
  const [savedCss, setSavedCss] = useState('')
  const [cssLimit, setCssLimit] = useState(0)
  const [cssBusy, setCssBusy] = useState<'load' | 'save' | 'clear' | null>(null)
  const [cssError, setCssError] = useState('')

  const cssDirty = css !== savedCss

  const updateProfile = (game: GameId, patch: Partial<RconProfile>) => {
    const next = { ...profiles, [game]: { ...profiles[game], ...patch } }
    setProfiles(next)
    Object.assign(store.profile(game), next[game])
    store.save(game)
  }

  const profileValid = (profile: RconProfile) => (
    profile.host.trim().length > 0 && Number(profile.port) > 0 && Number(profile.port) <= 65535
  )

  const test = async (game: GameId, command: 'ping' | 'status') => {
    const profile = profiles[game]
    setTesting({ game, command })
    setError('')
    setReply(null)
    try {
      const response = await api('/api/rcon', {
        method: 'POST',
        body: JSON.stringify({ host: profile.host, port: profile.port, password: profile.password, command }),
      })
      setReply({ game, command, raw: String(response.raw ?? ''), ok: Boolean(response.ok) })
      report(
        { kind: 'rcon', label: `${GAME_LABELS[game]} ${command} test`, raw: String(response.raw ?? ''), ok: Boolean(response.ok) },
        { title: `${GAME_LABELS[game]} ${command} reply`, body: String(response.raw ?? '') },
        response.ok ? 'ok' : 'err',
      )
      onCheckStatus(game)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: `${GAME_LABELS[game]} ${command} test`, raw: message, ok: false }, { title: 'RCON request failed', body: message }, 'err')
    } finally {
      setTesting(null)
    }
  }

  const saveGameDir = async (game: GameId) => {
    setSavingGame(game)
    setError('')
    try {
      const response = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ gameDirs: { [game]: dirs[game] } }),
      })
      if (response.error) throw new Error(String(response.error))
      await onReloadSettings()
      report(
        { kind: 'settings', label: `${GAME_LABELS[game]} directory override saved`, ok: true, detail: response.gameDirs?.[game] ?? dirs[game] },
        { title: `${GAME_LABELS[game]} directory updated`, body: response.gameDirs?.[game] ?? dirs[game] },
        'ok',
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: `save ${game} game directory`, raw: message, ok: false }, { title: 'Could not save game directory', body: message }, 'err')
    } finally {
      setSavingGame(null)
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
    { label: 'gallery catalog', value: GAME_LABELS[settings.game] },
    { label: 'game dir (CS:GO)', value: settings.games?.csgo?.gameDir ?? settings.gameDirs?.csgo ?? null },
    { label: 'game dir (CS2)', value: settings.games?.cs2?.gameDir ?? settings.gameDirs?.cs2 ?? null },
    { label: 'inventory.txt', value: settings.inventoryTxt, exists: settings.inventoryExists },
    { label: 'items_game.txt', value: settings.itemsGameTxt, exists: settings.itemsGameExists },
    { label: 'config.txt', value: settings.configTxt },
    { label: 'schema json', value: settings.schemaCache, exists: settings.schemaCached },
    { label: 'cases json', value: settings.casesCache, exists: settings.casesCached },
    { label: 'schema meta', value: typeof settings.schemaMeta === 'string' ? settings.schemaMeta : null },
    { label: 'images dir', value: settings.imgsGameDir ?? settings.imgsDir },
    { label: 'data dir', value: settings.dataDir },
    { label: 'user cache', value: settings.userCacheDir },
    { label: 'custom.css', value: settings.customCss, exists: settings.customCssExists },
  ] : []

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="grid gap-4 xl:min-h-[calc(100vh-156px)] xl:grid-cols-2 xl:items-stretch">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium"><Wifi className="size-4 text-primary" />RCON</h2>
              <span className="text-[11px] text-muted-foreground">one profile per game · both can be enabled</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['csgo', 'cs2'] as GameId[]).map((game) => {
                const profile = profiles[game]
                const valid = profileValid(profile)
                const busy = testing?.game === game ? testing.command : null
                const activeReply = reply?.game === game ? reply : null
                const shownStatus = settings?.game === game ? status : null
                return (
                  <div
                    key={game}
                    className={cn(
                      'rounded-xl border p-3 transition',
                      profile.enabled ? 'border-white/[.09] bg-white/[.02]' : 'border-white/[.05] bg-black/10 opacity-80',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{GAME_LABELS[game]}</span>
                      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                        <Checkbox
                          checked={profile.enabled}
                          onCheckedChange={(checked) => {
                            updateProfile(game, { enabled: checked === true })
                            onCheckStatus(game)
                          }}
                          aria-label={`Enable ${GAME_LABELS[game]} RCON`}
                        />
                        Enabled
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label>
                        <span className="field-label">Host</span>
                        <Input
                          value={profile.host}
                          onChange={(event) => updateProfile(game, { host: event.target.value })}
                          placeholder="127.0.0.1"
                          className={cn('h-9 text-xs', !profile.host.trim() && 'border-err-strong/70')}
                          autoComplete="off"
                          disabled={!profile.enabled}
                        />
                      </label>
                      <label>
                        <span className="field-label">Port</span>
                        <Input
                          value={profile.port}
                          onChange={(event) => updateProfile(game, { port: event.target.value })}
                          placeholder="37016"
                          inputMode="numeric"
                          className={cn('h-9 text-xs', !(Number(profile.port) > 0 && Number(profile.port) <= 65535) && 'border-err-strong/70')}
                          autoComplete="off"
                          disabled={!profile.enabled}
                        />
                      </label>
                    </div>

                    <label className="mt-2 block">
                      <span className="field-label">Password</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showPassword[game] ? 'text' : 'password'}
                          value={profile.password}
                          onChange={(event) => updateProfile(game, { password: event.target.value })}
                          placeholder="rcon password"
                          className="h-9 flex-1 text-xs"
                          autoComplete="new-password"
                          spellCheck={false}
                          disabled={!profile.enabled}
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          aria-label={showPassword[game] ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((current) => ({ ...current, [game]: !current[game] }))}
                          disabled={!profile.enabled}
                        >
                          {showPassword[game] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </label>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => void test(game, 'ping')} disabled={busy !== null || !profile.enabled || !valid}>
                        {busy === 'ping' ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}Ping
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void test(game, 'status')} disabled={busy !== null || !profile.enabled || !valid}>
                        {busy === 'status' ? <Loader2 className="size-3.5 animate-spin" /> : <WifiOff className="size-3.5" />}Status
                      </Button>
                    </div>

                    {(activeReply || (shownStatus && shownStatus.raw)) && (
                      <div className={cn('log-surface mt-3', (activeReply?.ok ?? shownStatus?.health === 'ready') ? 'ok' : 'err')}>
                        {activeReply ? `${activeReply.command} -> ${activeReply.raw}` : `status -> ${shownStatus?.raw}`}
                        {'\n'}
                        <span className="text-white/45">{rconHint(activeReply?.raw ?? shownStatus?.raw ?? '')}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {error && <div className="log-surface err mt-3">{error}</div>}
          </section>

          <section className="panel flex min-h-0 flex-1 flex-col">
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
              className="log-surface mt-3 min-h-64 w-full flex-1 resize-y"
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

        <section className="panel min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-medium"><FolderOpen className="size-4 text-primary" />Game directories</h2>
          {(['csgo', 'cs2'] as GameId[]).map((game) => (
            <div key={game} className="mt-3">
              <span className="field-label">{GAME_LABELS[game]}</span>
              <div className="flex gap-2">
                <Input
                  value={dirs[game]}
                  onChange={(event) => setDirs((current) => ({ ...current, [game]: event.target.value }))}
                  placeholder={settings?.games?.[game]?.gameDir ?? settings?.gameDirs?.[game] ?? 'absolute path to game dir'}
                  aria-label={`${GAME_LABELS[game]} directory override`}
                  className="h-9 flex-1 font-mono text-xs"
                />
                <Button size="sm" onClick={() => void saveGameDir(game)} disabled={savingGame !== null}>
                  {savingGame === game ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save
                </Button>
              </div>
            </div>
          ))}
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Saving re-reads every path. Leave blank to auto-detect. Both installs can be active at once. The game
            switch chooses the catalogue and the matching RCON profile in Live and Gallery.
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

          <details className="mt-4 xl:hidden">
            <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Current settings JSON</summary>
            <pre className="log-surface mt-2 max-h-64 overflow-auto">{JSON.stringify(settings, null, 2)}</pre>
          </details>
        </section>
      </div>
    </main>
  )
}
