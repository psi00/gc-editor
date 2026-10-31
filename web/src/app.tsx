import { useCallback, useEffect, useState } from 'react'
import { api, store } from './lib/api'
import { useReport } from './lib/report'
import { ActivityProvider } from './lib/activity'
import { ToastProvider } from './components/common/status-toast'
import { TooltipProvider } from './components/ui/tooltip'
import { Header, type Mode, type Page } from './components/shell/header'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { LivePage } from './pages/live'
import { OfflinePage } from './pages/offline'
import { ActivityPage } from './pages/activity'
import { SettingsPage } from './pages/settings'
import { setImageGame, type GameId } from './lib/catalog'
import { resetInventoryCatalog } from './lib/inventory-catalog'
import type { RconHealth, RconStatus, SchemaState, SettingsInfo } from './lib/app-types'
import './styles.css'

export default function App() {
  return (
    <TooltipProvider delayDuration={350}>
      <ToastProvider>
        <ActivityProvider>
          <Shell />
        </ActivityProvider>
      </ToastProvider>
    </TooltipProvider>
  )
}

function Shell() {
  const report = useReport()

  const [mode, setMode] = useState<Mode>('live')
  const [page, setPage] = useState<Page>('mode')
  const [offlineDirty, setOfflineDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<{ run: () => void } | null>(null)
  const [settings, setSettings] = useState<SettingsInfo | null>(null)
  const [galleryGame, setGalleryGame] = useState<GameId>('csgo')
  const [schema, setSchema] = useState<SchemaState>({ status: 'loading', weapons: [], counts: {}, cached: false, game: 'csgo' })
  const [statuses, setStatuses] = useState<Record<GameId, RconStatus>>({
    csgo: { health: 'unknown', raw: '', at: null, checking: false },
    cs2: { health: 'unknown', raw: '', at: null, checking: false },
  })

  const reloadSettings = useCallback(async () => {
    try {
      const response = await api('/api/settings')
      if (response.error) throw new Error(String(response.error))
      setSettings(response as SettingsInfo)
      // the server remembers the gallery's last catalogue choice
      setGalleryGame(response.game === 'cs2' ? 'cs2' : 'csgo')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      report({ kind: 'error', label: 'load /api/settings', raw: message, ok: false })
    }
  }, [report])

  const reloadSchema = useCallback(async (game: GameId) => {
    // clear the previous game's weapons immediately so Live can never show a
    // CS2 def while it is asking for CS:GO (or the reverse)
    setImageGame(game)
    setSchema((current) => current.game === game
      ? { ...current, status: 'loading', error: undefined }
      : { status: 'loading', weapons: [], counts: {}, cached: false, game })
    try {
      const query = `?game=${game}`
      const [weaponsResponse, countsResponse] = await Promise.all([
        api(`/api/schema/weapons${query}`),
        api(`/api/schema/counts${query}`),
      ])
      if (weaponsResponse.error) throw new Error(String(weaponsResponse.error))
      if (countsResponse.error) throw new Error(String(countsResponse.error))

      const weapons = Array.isArray(weaponsResponse.weapons) ? weaponsResponse.weapons : []
      const counts = countsResponse.counts && typeof countsResponse.counts === 'object' ? countsResponse.counts : {}
      const cached = Boolean(countsResponse.cached)

      setImageGame(game)
      setSchema({ status: 'ready', weapons, counts, cached, game })
      report({
        kind: 'schema',
        label: 'schema cache loaded',
        ok: true,
        detail: `${game === 'cs2' ? 'CS2' : 'CS:GO'} · ${weapons.length} weapons · ${Object.keys(counts).length} categories${cached ? '' : ' · cache empty'}`,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setSchema({ status: 'error', weapons: [], counts: {}, cached: false, game, error: message })
      report({ kind: 'error', label: 'load schema cache', raw: message, ok: false }, { title: 'Schema request failed', body: message }, 'err')
    }
  }, [report])

  const checkStatus = useCallback(async (target: GameId) => {
    const profile = store.profile(target)
    if (!profile.enabled) {
      setStatuses((current) => ({
        ...current,
        [target]: { health: 'off', raw: `RCON disabled for ${target === 'cs2' ? 'CS2' : 'CS:GO'} in Settings.`, at: new Date().toISOString(), checking: false },
      }))
      return
    }
    setStatuses((current) => ({ ...current, [target]: { ...current[target], checking: true } }))
    try {
      const response = await api('/api/rcon', {
        method: 'POST',
        body: JSON.stringify({ host: profile.host, port: profile.port, password: profile.password, command: 'status' }),
      })
      const raw = String(response.raw ?? '')
      const health: RconHealth = /^ok/i.test(raw) ? 'ready' : /auth/i.test(raw) ? 'auth' : 'gc'
      setStatuses((current) => ({ ...current, [target]: { health, raw, at: new Date().toISOString(), checking: false } }))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setStatuses((current) => ({
        ...current,
        [target]: { health: 'gc', raw: `ERR ${message}`, at: new Date().toISOString(), checking: false },
      }))
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  // The game switch drives both the catalogue and the matching RCON profile,
  // in Live and Gallery alike.
  useEffect(() => {
    void reloadSchema(galleryGame)
    void checkStatus(galleryGame)
  }, [galleryGame, reloadSchema, checkStatus])

  // `/` focuses the active page search field; never steals keys from inputs or dialogs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const search = Array.from(document.querySelectorAll<HTMLInputElement>('[data-search-input]'))
        .find((input) => input.offsetParent !== null)
      if (!search) return
      event.preventDefault()
      search.focus()
      search.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const navigate = useCallback((run: () => void) => {
    if (offlineDirty) {
      setPendingNav({ run })
      return
    }
    run()
  }, [offlineDirty])

  const game = galleryGame
  const status = statuses[game]

  const changeGame = (next: GameId) => {
    if (next === game) return
    navigate(() => {
      void (async () => {
        try {
          const response = await api('/api/settings', { method: 'POST', body: JSON.stringify({ game: next }) })
          if (response.error) throw new Error(String(response.error))
          // an older server ignores `game` and answers without it; say so instead
          // of silently reloading the same catalogue
          if (!response.game) throw new Error('this server is still running the previous build - restart it and try again')
          setGalleryGame(next)
          resetInventoryCatalog()
          await reloadSettings()
          report({ kind: 'settings', label: 'game switched', ok: true, detail: next === 'cs2' ? 'CS2' : 'CS:GO' })
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          report({ kind: 'error', label: `switch game to ${next}`, raw: message, ok: false }, { title: 'Could not switch game', body: message }, 'err')
        }
      })()
    })
  }

  const goMode = (next: Mode) => {
    if (page === 'mode' && mode === next) return
    navigate(() => {
      setMode(next)
      setPage('mode')
      setOfflineDirty(false)
    })
  }

  const goPage = (next: Exclude<Page, 'mode'>) => {
    if (page === next) return
    navigate(() => {
      setPage(next)
      setOfflineDirty(false)
    })
  }

  const discardAndLeave = () => {
    const run = pendingNav?.run
    setPendingNav(null)
    setOfflineDirty(false)
    run?.()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        mode={mode}
        page={page}
        onMode={goMode}
        onPage={goPage}
        status={status}
        onOpenSettings={() => goPage('settings')}
        game={game}
        onGame={changeGame}
      />

      {page === 'activity' ? (
        <ActivityPage />
      ) : page === 'settings' ? (
        <SettingsPage
          settings={settings}
          onReloadSettings={reloadSettings}
          status={status}
          onCheckStatus={(target) => void checkStatus(target ?? game)}
        />
      ) : mode === 'live' ? (
        <LivePage
          key={`live-${game}`}
          game={game}
          schema={schema}
          onReloadSchema={() => void reloadSchema(game)}
          rconHealth={status.health}
          onOpenSettings={() => goPage('settings')}
        />
      ) : (
        <OfflinePage
          key={`gallery-${galleryGame}`}
          game={galleryGame}
          settings={settings}
          schema={schema}
          onDirtyChange={setOfflineDirty}
        />
      )}

      <Dialog open={pendingNav !== null} onOpenChange={(open) => { if (!open) setPendingNav(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle>Discard unsaved gallery edits?</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            The gallery has edits that aren't in inventory.txt yet. Leaving now discards them, and
            unsaved edits aren't backed up.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingNav(null)}>Keep editing</Button>
            <Button variant="danger" onClick={discardAndLeave}>Discard and leave</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
