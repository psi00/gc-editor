import { useEffect, useRef } from 'react'
import { Activity, FolderOpen, Images, Settings } from 'lucide-react'
import type { GameId } from '../../lib/catalog'
import { GAME_LABELS } from '../../lib/catalog'
import type { RconStatus } from '../../lib/app-types'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { cn } from '../../lib/utils'

export type Mode = 'live' | 'offline'
export type Page = 'mode' | 'activity' | 'settings'

const GAME_TABS: { id: GameId; label: string }[] = [
  { id: 'csgo', label: GAME_LABELS.csgo },
  { id: 'cs2', label: GAME_LABELS.cs2 },
]

const MODES: { id: Mode; label: string; icon: typeof Images }[] = [
  { id: 'live', label: 'Live', icon: Images },
  { id: 'offline', label: 'Gallery', icon: FolderOpen },
]

const PAGES: { id: Exclude<Page, 'mode'>; label: string; icon: typeof Activity }[] = [
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const HEALTH: Record<RconStatus['health'], { label: string; dot: string; hint: string }> = {
  unknown: { label: 'rcon unknown', dot: 'idle', hint: 'RCON status has not been checked yet.' },
  ready: { label: 'rcon ready', dot: '', hint: 'The GC answered status, so the client is registered.' },
  auth: { label: 'rcon auth failed', dot: 'err', hint: 'The server rejected the password. Check the rcon block in csgo_gc/config.txt.' },
  gc: { label: 'gc unavailable', dot: 'warn', hint: 'The game is not reachable or no client GC is registered yet.' },
}

function NavTabs({ mode, page, onMode, onPage }: {
  mode: Mode
  page: Page
  onMode: (mode: Mode) => void
  onPage: (page: Exclude<Page, 'mode'>) => void
}) {
  return (
    <>
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onMode(id)}
          aria-current={page === 'mode' && mode === id ? 'page' : undefined}
          className={cn('nav-link', page === 'mode' && mode === id && 'active')}
        >
          <Icon className="size-3.5" />{label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden />
      {PAGES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onPage(id)}
          aria-current={page === id ? 'page' : undefined}
          className={cn('nav-link', page === id && 'active')}
        >
          <Icon className="size-3.5" />{label}
        </button>
      ))}
    </>
  )
}

export function Header({ mode, page, onMode, onPage, status, onOpenSettings, game, onGame }: {
  mode: Mode
  page: Page
  onMode: (mode: Mode) => void
  onPage: (page: Exclude<Page, 'mode'>) => void
  status: RconStatus
  onOpenSettings: () => void
  game: GameId
  onGame: (game: GameId) => void
}) {
  const health = HEALTH[status.health]
  const headerRef = useRef<HTMLElement>(null)

  // expose the live header height so sticky bars (category tabs) sit right below it
  useEffect(() => {
    const element = headerRef.current
    if (!element) return
    const sync = () => document.documentElement.style.setProperty('--topbar-h', `${element.offsetHeight}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <header className="topbar" ref={headerRef}>
      <div className="page-shell flex h-16 items-center gap-4 sm:gap-6">
        <nav className="hidden h-full items-center gap-1 md:flex" aria-label="Sections">
          <NavTabs mode={mode} page={page} onMode={onMode} onPage={onPage} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {mode === 'offline' && page === 'mode' && (
            <>
              <nav className="flex items-center gap-1" aria-label="Gallery catalogue">
                {GAME_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onGame(tab.id)}
                    aria-pressed={game === tab.id}
                    aria-label={`Use the ${tab.label} catalogue`}
                    className={cn('nav-link', game === tab.id && 'active')}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              <span className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden />
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="status-pill"
                onClick={onOpenSettings}
                aria-label={`RCON status: ${health.label}. Open settings`}
              >
                <span className={cn('live-dot', health.dot)} />
                <span>{status.checking ? 'checking rcon…' : health.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="block font-medium">{health.label}</span>
              <span className="mt-1 block text-white/60">{health.hint}</span>
              {status.raw && <span className="mt-1.5 block font-mono text-[11px] text-white/80">{status.raw}</span>}
              <span className="mt-1 block text-[11px] text-white/40">click to open settings</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="page-shell flex items-center gap-1 overflow-x-auto pb-2 md:hidden">
        <NavTabs mode={mode} page={page} onMode={onMode} onPage={onPage} />
      </div>
    </header>
  )
}
