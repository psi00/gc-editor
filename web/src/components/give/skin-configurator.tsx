import { useMemo, useState, type CSSProperties } from 'react'
import { Loader2, Plus, Sticker, X } from 'lucide-react'
import { api, quoteName, store } from '../../lib/api'
import { useReport } from '../../lib/report'
import { rconHint } from '../../lib/rcon-hints'
import type { GiveItem, GiveResponse } from '../../lib/app-types'
import {
  categoryImage, isGloveDef, rarityLabel, round4, skinImage, wearBand, wearBandId, WEAR_PRESETS,
} from '../../lib/catalog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Slider } from '../ui/slider'
import { SafeImage } from '../common/safe-image'
import { StickerPicker } from './sticker-picker'
import { cn } from '../../lib/utils'

export type SkinSelection = {
  weaponId: number
  weaponName?: string
  paint: number
  name: string
  rarity?: { name: string; color: string }
}

const SLOTS = 6

export function SkinConfigurator({ selection, open, onOpenChange, onAdd }: {
  selection: SkinSelection
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the item is staged into inventory.txt instead of sent over RCON. */
  onAdd?: (item: GiveItem) => void
}) {
  const isGlove = isGloveDef(selection.weaponId)
  const local = Boolean(onAdd)
  const report = useReport()

  const [wear, setWear] = useState(0.0001)
  const [wearText, setWearText] = useState('0.0001')
  const [seedText, setSeedText] = useState('0')
  const [stattrak, setStattrak] = useState('')
  const [souvenir, setSouvenir] = useState(false)
  const [customName, setCustomName] = useState('')
  const [stickers, setStickers] = useState<string[]>(Array(SLOTS).fill(''))
  const [pickSlot, setPickSlot] = useState<number | null>(null)
  const [autosave, setAutosave] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GiveResponse | null>(null)
  const [error, setError] = useState('')

  const seed = Number(seedText)
  const seedValid = seedText.trim() !== '' && Number.isInteger(seed) && seed >= 0 && seed <= 999
  const stattrakValid = stattrak.trim() === '' || (/^\d+$/.test(stattrak.trim()) && Number(stattrak) >= 0)
  const nameValid = customName.length <= 64
  const canSubmit = !submitting && seedValid && stattrakValid && nameValid

  const accent = selection.rarity?.color || '#6d7486'
  const stickerCount = stickers.filter(Boolean).length

  const preview = useMemo(() => {
    const parts = ['give_item', String(selection.weaponId)]
    if (!isGlove && souvenir) parts.push('quality=12')
    parts.push(`paint=${selection.paint}`, `wear=${round4(wear)}`, `seed=${seedValid ? seed : 0}`)
    if (!isGlove && !souvenir && stattrak.trim() !== '' && stattrakValid) parts.push(`stattrak=${Number(stattrak)}`)
    if (customName.trim()) parts.push(`name=${quoteName(customName.trim())}`)
    if (!isGlove) stickers.forEach((id, index) => { if (id) parts.push(`sticker${index}=${id}`) })
    return parts.join(' ')
  }, [selection, wear, seed, seedValid, stattrak, stattrakValid, customName, stickers, isGlove, souvenir])

  const setWearValue = (value: number) => {
    const next = round4(Math.min(1, Math.max(0, value)))
    setWear(next)
    setWearText(String(next))
  }

  const submit = async () => {
    if (!canSubmit) return
    const item: GiveItem = {
      def_index: selection.weaponId,
      count: 1,
      quality: !isGlove && souvenir ? 12 : undefined,
      paint: selection.paint,
      wear: round4(wear),
      seed,
      stattrak: !isGlove && !souvenir && stattrak.trim() !== '' ? Number(stattrak) : undefined,
      name: customName.trim() || undefined,
      stickers: isGlove ? [] : stickers.map((id) => (id ? { id: Number(id) } : null)),
    }

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
        body: JSON.stringify({ host: store.host, port: store.port, password: store.password, autosave, item }),
      })
      setResult(response)
      report(
        {
          kind: 'give',
          label: `${selection.name} · def ${selection.weaponId} paint ${selection.paint}`,
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
      report({ kind: 'error', label: `give ${selection.name}`, raw: message, ok: false }, { title: 'Give request failed', body: message }, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl overflow-hidden p-0">
        <div className="item-dialog-grid" style={{ '--accent': accent } as CSSProperties}>
          <div className="dialog-art">
            <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-1.5">
              <span className="item-badge">{rarityLabel(selection.rarity?.name) ?? 'no rarity'}</span>
              {isGlove && <span className="item-badge">no StatTrak / stickers</span>}
            </div>
            <SafeImage
              src={skinImage(selection.weaponId, selection.paint)}
              alt={selection.name}
              fallback={String(selection.paint)}
              eager
            />
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <DialogTitle className="pr-8 text-[21px] leading-tight">{selection.name}</DialogTitle>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="field-label mb-0">Float / wear</span>
                  <span className="text-[11px] text-muted-foreground">{wearBand(wear)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[wear]}
                    onValueChange={(value) => setWearValue(value[0] ?? 0)}
                    min={0}
                    max={1}
                    step={0.0001}
                    aria-label="Float value"
                    className="wear-slider flex-1"
                  />
                  <Input
                    value={wearText}
                    onChange={(event) => {
                      setWearText(event.target.value)
                      const parsed = Number(event.target.value)
                      if (Number.isFinite(parsed) && event.target.value.trim() !== '') setWear(Math.min(1, Math.max(0, round4(parsed))))
                    }}
                    onBlur={() => setWearText(String(wear))}
                    inputMode="decimal"
                    className="h-8 w-[86px] text-center text-xs"
                    aria-label="Float value"
                  />
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {WEAR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={cn('wear-preset', wearBandId(wear) === preset.id && 'active')}
                      onClick={() => setWearValue(preset.value)}
                      aria-pressed={wearBandId(wear) === preset.id}
                    >{preset.label}</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[130px] flex-1">
                  <span className="field-label">Pattern seed (0–999)</span>
                  <Input
                    value={seedText}
                    onChange={(event) => setSeedText(event.target.value)}
                    inputMode="numeric"
                    className={cn('h-9 text-xs', !seedValid && 'border-err-strong/70')}
                    aria-invalid={!seedValid}
                  />
                </label>
                {!isGlove && (
                  <label className="min-w-[130px] flex-1">
                    <span className="field-label">StatTrak kills</span>
                    <Input
                      value={stattrak}
                      onChange={(event) => setStattrak(event.target.value)}
                      inputMode="numeric"
                      placeholder={souvenir ? 'souvenir' : 'empty = none'}
                      disabled={souvenir}
                      className={cn('h-9 text-xs', !stattrakValid && 'border-err-strong/70')}
                      aria-invalid={!stattrakValid}
                    />
                  </label>
                )}
                {!isGlove && (
                  <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={souvenir}
                      onCheckedChange={(checked) => {
                        const next = checked === true
                        setSouvenir(next)
                        if (next) setStattrak('')
                      }}
                    />
                    Souvenir
                  </label>
                )}
              </div>
              {!seedValid && <p className="text-[11px] text-err-soft">Seed must be a whole number between 0 and 999.</p>}
              {!stattrakValid && <p className="text-[11px] text-err-soft">StatTrak must be a whole number, or empty for none.</p>}

              <label className="block">
                <span className="field-label">Name tag</span>
                <Input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="name tag text"
                  className={cn('h-9 text-xs', !nameValid && 'border-err-strong/70')}
                  maxLength={64}
                />
              </label>

              {!isGlove && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="field-label mb-0 flex items-center gap-1.5"><Sticker className="size-3" />Stickers</span>
                    {stickerCount > 0 && <span className="text-[11px] text-muted-foreground">{stickerCount} / {SLOTS}</span>}
                  </div>
                  <div className="sticker-row">
                    {stickers.map((id, index) => (
                      <button
                        key={index}
                        className={cn('sticker-slot', pickSlot === index && 'active')}
                        onClick={() => setPickSlot(pickSlot === index ? null : index)}
                        aria-label={id ? `Sticker slot ${index + 1}: ${id}. Change sticker` : `Add sticker to slot ${index + 1}`}
                        aria-pressed={pickSlot === index}
                        title={`Sticker slot ${index + 1}`}
                      >
                        {id
                          ? <SafeImage src={categoryImage('stickers', id)} alt={`Sticker ${id}`} fallback={id} />
                          : <span className="slot-index">{index + 1}</span>}
                      </button>
                    ))}
                  </div>
                  {pickSlot !== null && (
                    <StickerPicker
                      slot={pickSlot}
                      value={stickers[pickSlot]}
                      onPick={(id) => {
                        setStickers((current) => current.map((value, index) => (index === pickSlot ? id : value)))
                        setPickSlot(null)
                      }}
                      onClear={() => {
                        setStickers((current) => current.map((value, index) => (index === pickSlot ? '' : value)))
                        setPickSlot(null)
                      }}
                      onClose={() => setPickSlot(null)}
                    />
                  )}
                </div>
              )}

              {!local && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="field-label mb-0">Command preview</span>
                  </div>
                  <pre className="log-surface">{preview}</pre>
                </div>
              )}

              {!local && (
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
                  <Checkbox checked={autosave} onCheckedChange={(checked) => setAutosave(checked === true)} />
                  Run <span className="font-mono text-[11px] text-foreground/80">save_inventory</span> after adding
                </label>
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

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={submit} disabled={!canSubmit} className="flex-1">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {submitting ? 'Sending…' : 'Add to inventory'}
                </Button>
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                  <X className="size-4" />{result?.ok ? 'Done' : 'Cancel'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
