import { useMemo, useState } from 'react'
import { CircleAlert, Clock3, Trash2 } from 'lucide-react'
import { useActivity, type ActivityEntry, type ActivityKind } from '../lib/activity'
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

type Group = { entry: ActivityEntry; count: number; oldest: string }

/** Collapse runs of identical entries (the loads that fire in bursts). */
function groupConsecutive(entries: ActivityEntry[]): Group[] {
  const groups: Group[] = []
  for (const entry of entries) {
    const previous = groups[groups.length - 1]
    if (
      previous
      && previous.entry.kind === entry.kind
      && previous.entry.label === entry.label
      && previous.entry.detail === entry.detail
      && previous.entry.raw === entry.raw
      && previous.entry.ok === entry.ok
    ) {
      previous.count += 1
      previous.oldest = entry.at
    } else {
      groups.push({ entry, count: 1, oldest: entry.at })
    }
  }
  return groups
}

export function ActivityPage() {
  const { entries, clear } = useActivity()
  const [confirmClear, setConfirmClear] = useState(false)
  const [kindFilter, setKindFilter] = useState<ActivityKind | 'all'>('all')

  const errors = entries.filter((entry) => entry.ok === false).length

  const kinds = useMemo(() => {
    const counts = new Map<ActivityKind, number>()
    for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
    return [...counts.entries()]
  }, [entries])

  const groups = useMemo(
    () => groupConsecutive(kindFilter === 'all' ? entries : entries.filter((entry) => entry.kind === kindFilter)),
    [entries, kindFilter],
  )

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="mb-6 flex items-center gap-4">
        <div className="stat"><strong className="num">{entries.length}</strong><span>entries</span></div>
        <div className="h-8 w-px bg-white/[.07]" />
        <div className="stat"><strong className="num">{errors}</strong><span>failures</span></div>
        {entries.length > 0 && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setConfirmClear(true)}>
            <Trash2 className="size-3.5" />Clear
          </Button>
        )}
      </div>

      {entries.length > 50 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter activity by kind">
          <button
            onClick={() => setKindFilter('all')}
            aria-pressed={kindFilter === 'all'}
            className={cn('chip', kindFilter === 'all' && 'chip-accent')}
          >all {entries.length}</button>
          {kinds.map(([kind, count]) => (
            <button
              key={kind}
              onClick={() => setKindFilter(kind)}
              aria-pressed={kindFilter === kind}
              className={cn('chip', kindFilter === kind && (KIND_CLASS[kind] || 'chip-accent'))}
            >{kind} {count}</button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState icon={<Clock3 className="size-6" />} title="Nothing logged yet">
          Load a category, give an item, or run a ping test — each operation appends a timestamped entry here, newest first.
        </EmptyState>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-center text-[11px] text-muted-foreground">No {kindFilter} entries in this session.</p>
      ) : (
        <ol className="space-y-1.5">
          {groups.map(({ entry, count, oldest }) => (
            <li key={entry.id} className="panel !p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <time
                  dateTime={entry.at}
                  title={count > 1 ? `${count} identical entries, ${formatClock(oldest)} – ${formatClock(entry.at)}` : undefined}
                  className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground"
                >{formatClock(entry.at)}</time>
                <span className={cn('chip', KIND_CLASS[entry.kind])}>{entry.kind}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">{entry.label}</span>
                {count > 1 && <span className="chip" title={`${count} identical entries in a row`}>×{count}</span>}
                {entry.ok === true && <span className="chip chip-ok">ok</span>}
                {entry.ok === false && <span className="chip chip-err"><CircleAlert className="size-3" />failed</span>}
              </div>
              {entry.detail && <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{entry.detail}</p>}
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
            <Button variant="danger" onClick={() => { clear(); setConfirmClear(false); setKindFilter('all') }}>
              <Trash2 className="size-4" />Clear log
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
