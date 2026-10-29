import { useState, type CSSProperties } from 'react'
import { Loader2, Plus, Save, X } from 'lucide-react'
import { api, quoteName, store } from '../../lib/api'
import { useReport } from '../../lib/report'
import { rconHint } from '../../lib/rcon-hints'
import type { GiveItem, GiveResponse } from '../../lib/app-types'
import type { CategoryItem, Kind } from '../../lib/catalog'
import { categoryImage, rarityLabel } from '../../lib/catalog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { SafeImage } from '../common/safe-image'
import { cn } from '../../lib/utils'

export type GenericSelection = {
  kind: Kind
  category: string
  item: CategoryItem
}

function countOf(text: string) {
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null
}

function intOrUndefined(text: string) {
  if (text.trim() === '') return undefined
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function GenericConfigurator({ selection, open, onOpenChange }: {
  selection: GenericSelection
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mode = selection.kind === 'music' ? 'music' : selection.kind === 'souvenir' ? 'souvenir' : 'generic'
  const report = useReport()

  const [countText, setCountText] = useState('1')
  const [name, setName] = useState('')
  const [musicText, setMusicText] = useState(mode === 'music' ? String(selection.item.def_index) : '')
  const [tour, setTour] = useState({ event: '', stage: '', team0: '', team1: '', mvp: '' })
  const [autosave, setAutosave] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GiveResponse | null>(null)
  const [error, setError] = useState('')

  const count = countOf(countText)
  const countValid = count !== null
  const musicId = intOrUndefined(musicText)
  const musicValid = mode !== 'music' || (musicId !== undefined && musicId > 0)
  const canSubmit = !submitting && countValid && musicValid

  const defIndex = Number(selection.item.def_index)
  const displayDef = mode === 'music' ? 1314 : defIndex

  const preview = (() => {
    const parts = ['give_item', String(displayDef)]
    if (count && count !== 1) parts.push(String(count))
    if (mode === 'music') {
      if (musicValid) parts.push(`music=${musicId}`)
    } else if (mode === 'souvenir') {
      if (intOrUndefined(tour.event) !== undefined) parts.push(`tournament_event=${intOrUndefined(tour.event)}`)
      if (intOrUndefined(tour.stage) !== undefined) parts.push(`tournament_stage=${intOrUndefined(tour.stage)}`)
      if (intOrUndefined(tour.team0) !== undefined) parts.push(`tournament_team0=${intOrUndefined(tour.team0)}`)
      if (intOrUndefined(tour.team1) !== undefined) parts.push(`tournament_team1=${intOrUndefined(tour.team1)}`)
      if (intOrUndefined(tour.mvp) !== undefined) parts.push(`tournament_mvp=${intOrUndefined(tour.mvp)}`)
    }
    if (name.trim()) parts.push(`name=${quoteName(name.trim())}`)
    return parts.join(' ')
  })()

  const submit = async () => {
    if (!canSubmit || count === null) return
    const item: GiveItem = mode === 'music'
      ? { def_index: 1314, count, music: musicId, name: name.trim() || undefined }
      : {
        def_index: defIndex,
        count,
        name: name.trim() || undefined,
        tournament_event: mode === 'souvenir' ? intOrUndefined(tour.event) : undefined,
        tournament_stage: mode === 'souvenir' ? intOrUndefined(tour.stage) : undefined,
        tournament_team0: mode === 'souvenir' ? intOrUndefined(tour.team0) : undefined,
        tournament_team1: mode === 'souvenir' ? intOrUndefined(tour.team1) : undefined,
        tournament_mvp: mode === 'souvenir' ? intOrUndefined(tour.mvp) : undefined,
      }

    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const response: GiveResponse = await api('/api/rcon/give', {
        method: 'POST',
        body: JSON.stringify({ host: store.host, port: store.port, password: store.password, autosave, item }),
      })
      setResult(response)
      report(
        {
          kind: 'give',
          label: `${selection.item.name} · ${mode === 'music' ? `music def 1314` : `def ${defIndex}`}${count !== 1 ? ` ×${count}` : ''}`,
          raw: response.saved ? `${response.raw}\nsave_inventory -> ${response.saved}` : response.raw,
          ok: response.ok,
          detail: response.command,
        },
        { title: response.ok ? 'Item given to inventory' : 'Give failed', body: response.raw },
        response.ok ? 'ok' : 'err',
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: `give ${selection.item.name}`, raw: message, ok: false }, { title: 'Give request failed', body: message }, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  const accent = selection.item.rarity?.color || '#5e7bff'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <div className="item-dialog-grid" style={{ '--accent': accent } as CSSProperties}>
          <div className="dialog-art dialog-art-sm">
            <div className="absolute left-4 top-4 z-10">
              <span className="item-badge">{rarityLabel(selection.item.rarity?.name) ?? selection.category}</span>
            </div>
            <SafeImage
              src={categoryImage(selection.category, selection.item.def_index)}
              alt={selection.item.name}
              fallback={selection.item.def_index}
              eager
            />
            <div className="absolute bottom-4 left-4 font-mono text-[10px] text-white/45">
              {mode === 'music' ? `music ${musicId ?? selection.item.def_index}` : `def ${selection.item.def_index}`}
            </div>
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <DialogTitle className="pr-8 text-[21px] leading-tight">{selection.item.name}</DialogTitle>
            <DialogDescription className="mt-1.5 text-xs text-muted-foreground">
              {mode === 'music'
                ? 'Music kits are always given as def 1314 with music=<id>.'
                : mode === 'souvenir'
                  ? 'Optional tournament ids are sent with the give command.'
                  : 'Quantity is limited to 1–100 per give.'}
            </DialogDescription>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="field-label">Quantity (1–100)</span>
                  <Input
                    value={countText}
                    onChange={(event) => setCountText(event.target.value)}
                    inputMode="numeric"
                    className={cn('h-9 text-xs', !countValid && 'border-red-500/50')}
                    aria-invalid={!countValid}
                  />
                </label>
                {mode === 'music' && (
                  <label>
                    <span className="field-label">Music kit id</span>
                    <Input
                      value={musicText}
                      onChange={(event) => setMusicText(event.target.value)}
                      inputMode="numeric"
                      className={cn('h-9 text-xs', !musicValid && 'border-red-500/50')}
                      aria-invalid={!musicValid}
                    />
                  </label>
                )}
              </div>
              {!countValid && <p className="text-[10px] text-red-300">Quantity must be a whole number between 1 and 100.</p>}
              {!musicValid && <p className="text-[10px] text-red-300">Music kit id must be a positive whole number.</p>}

              {mode === 'souvenir' && (
                <div>
                  <span className="field-label">Souvenir tournament ids (optional)</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {([['event', 'event'], ['stage', 'stage'], ['team0', 'team0'], ['team1', 'team1'], ['mvp', 'mvp']] as const).map(([key, label]) => (
                      <Input
                        key={key}
                        value={tour[key]}
                        onChange={(event) => setTour((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={label}
                        aria-label={`tournament_${key}`}
                        inputMode="numeric"
                        className="h-8 text-xs"
                      />
                    ))}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="field-label">Name tag (optional)</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="name tag text"
                  maxLength={64}
                  className="h-9 text-xs"
                />
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="field-label mb-0">Command preview</span>
                  <span className="text-[9px] text-muted-foreground">server builds the real command</span>
                </div>
                <pre className="log-surface">{preview}</pre>
              </div>

              <div>
                <span className="field-label">Review</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="detail-stat"><span>{mode === 'music' ? 'Give def' : 'Def index'}</span><strong>{displayDef}</strong></div>
                  <div className="detail-stat"><span>Count</span><strong>{count ?? '—'}</strong></div>
                  <div className="detail-stat"><span>{mode === 'music' ? 'Music' : 'Name'}</span><strong>{mode === 'music' ? musicId ?? '—' : name.trim() || 'none'}</strong></div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
                <Checkbox checked={autosave} onCheckedChange={(checked) => setAutosave(checked === true)} />
                Run <span className="font-mono text-[11px] text-foreground/80">save_inventory</span> after adding
              </label>

              {error && <div className="log-surface err">{error}</div>}
              {result && (
                <div className={cn('log-surface', result.ok ? 'ok' : 'err')}>
                  {result.command && <>{result.command}{'\n'}</>}
                  {result.raw}
                  {result.saved && <>{'\n'}save_inventory -&gt; {result.saved}</>}
                </div>
              )}
              {result && (!result.ok || /^err/i.test(result.saved ?? '')) && (
                <p className="text-[10px] leading-relaxed text-amber-200/75">{rconHint(result.ok ? result.saved ?? '' : result.raw)}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={submit} disabled={!canSubmit} className="flex-1">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {submitting ? 'Sending…' : 'Add to inventory'}
                </Button>
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                  <X className="size-4" />{result?.ok ? 'Done' : 'Cancel'}
                </Button>
                {autosave && <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><Save className="size-3" />backup written by save_inventory</span>}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
