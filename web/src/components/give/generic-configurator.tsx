import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Gem, Loader2, Plus, Save, X } from 'lucide-react'
import { api, store } from '../../lib/api'
import { useReport } from '../../lib/report'
import { rconHint } from '../../lib/rcon-hints'
import type { GiveItem, GiveResponse } from '../../lib/app-types'
import { rarityTier } from '../../../../shared/rarity.js'
import type { CategoryItem, GameId, Kind } from '../../lib/catalog'
import { GAME_LABELS, categoryImage, rarityLabel } from '../../lib/catalog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { SafeImage } from '../common/safe-image'
import { CommandPreview } from '../common/command-preview'
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

export function GenericConfigurator({ game = 'csgo', selection, open, onOpenChange, onAdd, onWeapon }: {
  game?: GameId
  selection: GenericSelection
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the item is staged into inventory.txt instead of sent over RCON. */
  onAdd?: (item: GiveItem) => void
  /** Charms only: hand the selected charm to the weapon editor. */
  onWeapon?: () => void
}) {
  const mode = selection.kind === 'music' ? 'music' : selection.kind === 'charms' ? 'charm' : 'generic'
  const local = Boolean(onAdd)
  const profile = store.profile(game)
  const rconDisabled = !local && !profile.enabled
  const report = useReport()

  const [countText, setCountText] = useState('1')
  const [autosave, setAutosave] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GiveResponse | null>(null)
  const [error, setError] = useState('')
  const [serverPreview, setServerPreview] = useState('')

  const count = countOf(countText)
  const countValid = count !== null
  const canSubmit = !submitting && !rconDisabled && countValid

  const defIndex = Number(selection.item.def_index)
  // Def 1355 is the CS2 charm item; the keychain id lives in attribute 299.
  const displayDef = mode === 'music' ? 1314 : mode === 'charm' ? 1355 : defIndex
  const rarity = rarityTier(selection.item.rarity?.name, selection.item.rarity?.id) ?? 1

  const item = useMemo<GiveItem>(() => {
    const quantity = count ?? 1
    return mode === 'music'
      ? { def_index: 1314, count: quantity, rarity, music: defIndex }
      : mode === 'charm'
        ? { def_index: 1355, count: quantity, rarity, keychain: defIndex }
        : { def_index: defIndex, count: quantity, rarity }
  }, [mode, count, rarity, defIndex])

  const optimisticPreview = useMemo(() => {
    const parts = ['give_item', String(displayDef)]
    if (count && count !== 1) parts.push(String(count))
    if (mode === 'music') parts.push(`music=${defIndex}`)
    if (mode === 'charm') parts.push(`keychain=${defIndex}`)
    return parts.join(' ')
  }, [displayDef, count, mode, defIndex])

  useEffect(() => {
    if (local || !open) {
      setServerPreview('')
      return
    }
    let cancelled = false
    setServerPreview('')
    const timer = setTimeout(() => {
      api('/api/rcon/preview', { method: 'POST', body: JSON.stringify({ item }) })
        .then((response) => {
          if (!cancelled && typeof response.command === 'string') setServerPreview(response.command)
        })
        .catch(() => {
          if (!cancelled) setServerPreview('')
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [item, local, open])

  const preview = serverPreview || optimisticPreview

  const submit = async () => {
    if (!canSubmit || count === null) return

    if (onAdd) {
      onAdd(item)
      onOpenChange(false)
      return
    }

    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const response: GiveResponse = await api('/api/rcon/give', {
        method: 'POST',
        body: JSON.stringify({ game, autosave, item }),
      })
      setResult(response)
      report(
        {
          kind: 'give',
          label: `${selection.item.name} · ${mode === 'music' ? 'music def 1314' : mode === 'charm' ? `charm ${defIndex}` : `def ${defIndex}`}${count !== 1 ? ` ×${count}` : ''}`,
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

  const accent = selection.item.rarity?.color || '#6d7486'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn('overflow-hidden p-0', mode === 'charm' ? 'max-w-4xl' : 'max-w-3xl')}>
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
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <DialogTitle className="pr-8 text-[21px] leading-tight">{selection.item.name}</DialogTitle>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="field-label">Quantity (1–100)</span>
                  <Input
                    value={countText}
                    onChange={(event) => setCountText(event.target.value)}
                    inputMode="numeric"
                    className={cn('h-9 text-xs', !countValid && 'border-err-strong/70')}
                    aria-invalid={!countValid}
                  />
                </label>
              </div>
              {!countValid && <p className="text-[11px] text-err-soft">Quantity must be a whole number between 1 and 100.</p>}

              {!local && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="field-label mb-0">Command preview</span>
                    <span className="text-[11px] text-muted-foreground">server builds the real command</span>
                  </div>
                  <CommandPreview command={preview} />
                </div>
              )}

              {!local && (
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
                  <Checkbox checked={autosave} onCheckedChange={(checked) => setAutosave(checked === true)} />
                  Run <span className="font-mono text-[11px] text-foreground/80">save_inventory</span> after adding
                </label>
              )}

              {rconDisabled && (
                <p className="text-[11px] leading-relaxed text-warn-soft">
                  RCON is disabled for {GAME_LABELS[game]} in Settings. Enable that profile to send items.
                </p>
              )}

              {error && <div className="log-surface err">{error}</div>}
              {result && (
                <div className={cn('log-surface', result.ok ? 'ok' : 'err')}>
                  {result.command && <>{result.command}{'\n'}</>}
                  {result.raw}
                  {result.saved && <>{'\n'}save_inventory -&gt; {result.saved}</>}
                </div>
              )}
              {result && (!result.ok || /^err/i.test(result.saved ?? '')) && (
                <p className="text-[11px] leading-relaxed text-warn-soft/75">{rconHint(result.ok ? result.saved ?? '' : result.raw)}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={submit} disabled={!canSubmit} className={cn('flex-1', mode === 'charm' && 'px-2 text-xs')}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {submitting ? 'Sending…' : 'Add to inventory'}
                </Button>
                {mode === 'charm' && onWeapon && (
                  <Button
                    onClick={() => { onOpenChange(false); onWeapon() }}
                    disabled={submitting}
                    className="flex-1 px-2 text-xs"
                  >
                    <Gem className="size-4" />Add to weapon
                  </Button>
                )}
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting} className="shrink-0">
                  <X className="size-4" />{result?.ok ? 'Done' : 'Cancel'}
                </Button>
              </div>
              {!local && autosave && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Save className="size-3" />backup written by save_inventory
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
