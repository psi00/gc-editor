import { useState } from 'react'
import { Activity, CircleAlert, Clock3, Trash2 } from 'lucide-react'
import { useActivity, type ActivityKind } from '../lib/activity'
import { formatClock } from '../lib/catalog'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { EmptyState } from '../components/common/empty-state'
import { cn } from '../lib/utils'

const KIND_CLASS: Record<ActivityKind, string> = {
  rcon: '',
  give: 'chip-accent',
  save: 'chip-ok',
  inventory: 'chip-ok',
  schema: '',
  settings: '',
  error: 'chip-err',
  info: '',
}

export function ActivityPage() {
  const { entries, clear } = useActivity()
  const [confirmClear, setConfirmClear] = useState(false)

  const errors = entries.filter((entry) => entry.ok === false).length

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary">
            <Activity className="size-3.5" />Session log
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-.04em] sm:text-[34px]">Activity</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Every schema load, give, save, and RCON test in this session, with the exact reply the GC sent. Toasts are
            transient; this list is the durable record. Passwords never appear here.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Session of {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-4 pb-1">
          <div className="stat"><strong className="num">{entries.length}</strong><span>entries</span></div>
          <div className="h-8 w-px bg-white/[.07]" />
          <div className="stat"><strong className="num">{errors}</strong><span>failures</span></div>
          {entries.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-3.5" />Clear
            </Button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<Clock3 className="size-6" />} title="Nothing logged yet">
          Load a category, give an item, or run a ping test — each operation appends a timestamped entry here, newest first.
        </EmptyState>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="panel !p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('chip', KIND_CLASS[entry.kind])}>{entry.kind}</span>
                {entry.ok === true && <span className="chip chip-ok">ok</span>}
                {entry.ok === false && <span className="chip chip-err"><CircleAlert className="size-2.5" />failed</span>}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">{entry.label}</span>
                <time dateTime={entry.at} className="font-mono text-[10px] text-muted-foreground">{formatClock(entry.at)}</time>
              </div>
              {entry.detail && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{entry.detail}</p>}
              {entry.raw && <pre className={cn('log-surface mt-2', entry.ok === false && 'err', entry.ok === true && 'ok')}>{entry.raw}</pre>}
            </li>
          ))}
        </ol>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Clear the activity log?</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            This only clears the in-memory session list. It does not touch inventory.txt or any backup.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { clear(); setConfirmClear(false) }}>
              <Trash2 className="size-4" />Clear log
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
