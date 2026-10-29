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
  const [schema, setSchema] = useState<SchemaState>({ status: 'loading', weapons: [], counts: {}, cached: false })
  const [status, setStatus] = useState<RconStatus>({ health: 'unknown', raw: '', at: null, checking: false })

  const reloadSettings = useCallback(async () => {
    try {
      const response = await api('/api/settings')
      if (response.error) throw new Error(String(response.error))
      setSettings(response as SettingsInfo)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      report({ kind: 'error', label: 'load /api/settings', raw: message, ok: false })
    }
  }, [report])

  const reloadSchema = useCallback(async () => {
    setSchema((current) => ({ ...current, status: 'loading', error: undefined }))
    try {
      const [weaponsResponse, countsResponse] = await Promise.all([
        api('/api/schema/weapons'),
        api('/api/schema/counts'),
      ])
      if (weaponsResponse.error) throw new Error(String(weaponsResponse.error))
      if (countsResponse.error) throw new Error(String(countsResponse.error))

      const weapons = Array.isArray(weaponsResponse.weapons) ? weaponsResponse.weapons : []
      const counts = countsResponse.counts && typeof countsResponse.counts === 'object' ? countsResponse.counts : {}
      const cached = Boolean(countsResponse.cached)

      setSchema({ status: 'ready', weapons, counts, cached })
      report({
        kind: 'schema',
        label: 'schema cache loaded',
        ok: true,
        detail: `${weapons.length} weapons · ${Object.keys(counts).length} categories${cached ? '' : ' · cache empty'}`,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setSchema({ status: 'error', weapons: [], counts: {}, cached: false, error: message })
      report({ kind: 'error', label: 'load schema cache', raw: message, ok: false }, { title: 'Schema request failed', body: message }, 'err')
    }
  }, [report])

  const checkStatus = useCallback(async () => {
    setStatus((current) => ({ ...current, checking: true }))
    try {
      const response = await api('/api/rcon', {
        method: 'POST',
        body: JSON.stringify({ host: store.host, port: store.port, password: store.password, command: 'status' }),
      })
      const raw = String(response.raw ?? '')
      const health: RconHealth = /^ok/i.test(raw) ? 'ready' : /auth/i.test(raw) ? 'auth' : 'gc'
      setStatus({ health, raw, at: new Date().toISOString(), checking: false })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setStatus({ health: 'gc', raw: `ERR ${message}`, at: new Date().toISOString(), checking: false })
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
    void reloadSchema()
    void checkStatus()
  }, [reloadSettings, reloadSchema, checkStatus])

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
      />

      {page === 'activity' ? (
        <ActivityPage />
      ) : page === 'settings' ? (
        <SettingsPage
          settings={settings}
          onReloadSettings={reloadSettings}
          schema={schema}
          status={status}
          onCheckStatus={() => void checkStatus()}
        />
      ) : mode === 'live' ? (
        <LivePage
          schema={schema}
          onReloadSchema={() => void reloadSchema()}
          rconHealth={status.health}
          onOpenSettings={() => goPage('settings')}
        />
      ) : (
        <OfflinePage settings={settings} schema={schema} onDirtyChange={setOfflineDirty} />
      )}

      <Dialog open={pendingNav !== null} onOpenChange={(open) => { if (!open) setPendingNav(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle>Discard unsaved offline edits?</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            The offline editor has changes that have not been written to inventory.txt. Leaving now drops them;
            no backup is written for unsaved edits.
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
