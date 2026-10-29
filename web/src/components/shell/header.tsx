import { Activity, FolderOpen, Images, Settings } from 'lucide-react'
import type { RconStatus } from '../../lib/app-types'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { cn } from '../../lib/utils'

export type Mode = 'live' | 'offline'
export type Page = 'mode' | 'activity' | 'settings'

const MODES: { id: Mode; label: string; icon: typeof Images }[] = [
  { id: 'live', label: 'Live', icon: Images },
  { id: 'offline', label: 'Offline', icon: FolderOpen },
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

function Brand() {
  return (
    <span className="flex items-center gap-2.5" aria-label="gc-editor home">
      <span className="logo-mark" aria-hidden>gc</span>
      <span className="text-[19px] font-semibold tracking-[-.045em]">gc-editor<span className="text-primary">.</span></span>
      <span className="hidden rounded-md border border-white/[.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.16em] text-muted-foreground sm:inline">local</span>
    </span>
  )
}

function ModeSwitch({ mode, page, onMode, className }: {
  mode: Mode
  page: Page
  onMode: (mode: Mode) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border border-white/[.075] bg-white/[.03] p-0.5', className)} role="group" aria-label="Connection mode">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onMode(id)}
          aria-pressed={page === 'mode' && mode === id}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition',
            page === 'mode' && mode === id ? 'bg-white/[.09] text-foreground shadow-sm' : 'hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />{label}
        </button>
      ))}
    </div>
  )
}

export function Header({ mode, page, onMode, onPage, status, onOpenSettings }: {
  mode: Mode
  page: Page
  onMode: (mode: Mode) => void
  onPage: (page: Exclude<Page, 'mode'>) => void
  status: RconStatus
  onOpenSettings: () => void
}) {
  const health = HEALTH[status.health]

  return (
    <header className="topbar">
      <div className="page-shell flex h-16 items-center gap-4 sm:gap-6">
        <button onClick={() => onMode('live')} className="shrink-0 rounded-lg">
          <Brand />
        </button>

        <ModeSwitch mode={mode} page={page} onMode={onMode} className="hidden md:flex" />

        <nav className="hidden h-full items-center gap-1 md:flex" aria-label="Pages">
          {PAGES.map(({ id, label }) => (
            <button
              key={id}
              className={cn('nav-link', page === id && 'active')}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => onPage(id)}
            >{label}</button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
              {status.raw && <span className="mt-1.5 block font-mono text-[10px] text-white/80">{status.raw}</span>}
              <span className="mt-1 block text-[10px] text-white/40">click to open settings</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="page-shell flex items-center gap-2 overflow-x-auto pb-2 md:hidden">
        <ModeSwitch mode={mode} page={page} onMode={onMode} />
        <div className="ml-auto flex gap-1">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onPage(id)}
              aria-current={page === id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] text-muted-foreground',
                page === id && 'bg-white/[.06] text-foreground',
              )}
            >
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
