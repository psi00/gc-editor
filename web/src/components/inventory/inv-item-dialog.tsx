import { useEffect, useState, type CSSProperties } from 'react'
import { Sticker, Trash2, X } from 'lucide-react'
import type { InvItem } from '../../lib/app-types'
import { itemPaint, type ResolvedInventory } from '../../lib/inventory-catalog'
import { formatWear, categoryImage, isGloveDef, rarityLabel, round4, wearBand, wearBandId, WEAR_PRESETS } from '../../lib/catalog'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Slider } from '../ui/slider'
import { SafeImage } from '../common/safe-image'
import { StickerPicker } from '../give/sticker-picker'
import { cn } from '../../lib/utils'

const SLOTS = 6
const STICKER_BASE = 113

/** Attributes surfaced by the dedicated controls; everything else stays raw. */
const MANAGED_ATTRS = new Set(['7', '8', '80', '81', '111'])

type InventoryItemDialogProps = {
  item: InvItem
  open: boolean
  resolved?: ResolvedInventory
  onClose: () => void
  onName: (value: string) => void
  onAttr: (key: string, value: string | null) => void
  onPosition: (value: number) => void
  onDelete: () => void
}

export function InventoryItemDialog({
  item, open, resolved, onClose, onName, onAttr, onPosition, onDelete,
}: InventoryItemDialogProps) {
  const isGlove = resolved?.isGlove ?? isGloveDef(item.def_index)
  const paint = itemPaint(item)
  const isSkin = paint != null && paint > 0
  const isWeapon = resolved?.isWeapon ?? false

  const [wearText, setWearText] = useState(item.attributes?.['8'] ?? '')
  const [seedText, setSeedText] = useState(item.attributes?.['7'] ?? '')
  const [stattrakText, setStattrakText] = useState(item.attributes?.['80'] ?? '')
  const [positionText, setPositionText] = useState(String(item.inventory))
  const [attrDrafts, setAttrDrafts] = useState<Record<string, string>>({})
  const [pickSlot, setPickSlot] = useState<number | null>(null)

  // Reset the free-text mirrors when the dialog points at another item. The
  // attribute object is recreated on every edit, so key this on the id alone.
  useEffect(() => {
    setWearText(item.attributes?.['8'] ?? '')
    setSeedText(item.attributes?.['7'] ?? '')
    setStattrakText(item.attributes?.['80'] ?? '')
    setPositionText(String(item.inventory))
    setAttrDrafts({})
    setPickSlot(null)
  }, [item.id])

  const wearRaw = item.attributes?.['8']
  const parsedWear = Number(wearRaw)
  const wear = wearRaw && Number.isFinite(parsedWear) ? Math.min(1, Math.max(0, parsedWear)) : 0.0001

  const commitWear = (value: number) => {
    const next = Math.min(1, Math.max(0, round4(value)))
    setWearText(String(next))
    onAttr('8', next.toFixed(6))
  }

  const commitSeed = (value: string) => {
    const parsed = Number(value)
    if (value.trim() === '' || !Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
      setSeedText(item.attributes?.['7'] ?? '0')
      return
    }
    setSeedText(String(parsed))
    onAttr('7', String(parsed))
  }

  const commitStattrak = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') {
      setStattrakText('')
      onAttr('80', null)
      onAttr('81', null)
      return
    }
    if (!/^\d+$/.test(trimmed)) {
      setStattrakText(item.attributes?.['80'] ?? '')
      return
    }
    setStattrakText(String(Number(trimmed)))
    onAttr('80', String(Number(trimmed)))
    if (item.attributes?.['81'] == null) onAttr('81', '1')
  }

  const stickers = Array.from({ length: SLOTS }, (_, index) => item.attributes?.[String(STICKER_BASE + index * 4)] ?? '')
  const stickerCount = stickers.filter(Boolean).length

  const setSticker = (slot: number, id: string | null) => {
    const base = STICKER_BASE + slot * 4
    if (id == null) {
      for (let offset = 0; offset < 4; offset += 1) onAttr(String(base + offset), null)
    } else {
      onAttr(String(base), id)
      for (let offset = 1; offset < 4; offset += 1) onAttr(String(base + offset), null)
    }
    setPickSlot(null)
  }

  const rawEntries = Object.entries(item.attributes ?? {})
    .filter(([key]) => {
      const numeric = Number(key)
      if (MANAGED_ATTRS.has(key)) return false
      if (numeric >= STICKER_BASE && numeric <= STICKER_BASE + SLOTS * 4 - 1) return false
      return true
    })
    .sort(([a], [b]) => Number(a) - Number(b))

  const accent = resolved?.rarity?.color || '#6d7486'
  const qualityBadge = item.quality === 9 ? 'StatTrak' : item.quality === 12 ? 'Souvenir' : null
  const title = resolved?.name ?? `Item def ${item.def_index}`

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-w-4xl overflow-hidden p-0">
        <div className="item-dialog-grid" style={{ '--accent': accent } as CSSProperties}>
          <div className={cn('dialog-art', !isSkin && 'dialog-art-sm')}>
            <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-1.5">
              <span className="item-badge">{rarityLabel(resolved?.rarity?.name) ?? 'no rarity'}</span>
              {qualityBadge && <span className={cn('item-badge', item.quality === 9 && 'st', item.quality === 12 && 'sv')}>{qualityBadge}</span>}
              {isGlove && <span className="item-badge">no StatTrak / stickers</span>}
            </div>
            <SafeImage
              src={resolved?.image}
              alt={title}
              fallback={paint != null ? String(paint) : String(item.def_index)}
              eager
            />
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <DialogTitle className="pr-8 text-[21px] leading-tight">{title}</DialogTitle>

            <div className="mt-5 space-y-4">
              {isSkin && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="field-label mb-0">Float / wear</span>
                    <span className="text-[11px] text-muted-foreground">{wearBand(wear)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[wear]}
                      onValueChange={(value) => commitWear(value[0] ?? 0)}
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
                        if (event.target.value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
                          onAttr('8', parsed.toFixed(6))
                        }
                      }}
                      onBlur={() => setWearText(formatWear(wear))}
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
                        onClick={() => commitWear(preset.value)}
                        aria-pressed={wearBandId(wear) === preset.id}
                      >{preset.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {(isSkin || isWeapon) && (
                <div className="grid grid-cols-2 gap-2">
                  {isSkin && (
                    <label>
                      <span className="field-label">Pattern seed (0–999)</span>
                      <Input
                        value={seedText}
                        onChange={(event) => setSeedText(event.target.value)}
                        onBlur={(event) => commitSeed(event.currentTarget.value)}
                        inputMode="numeric"
                        className="h-9 text-xs"
                      />
                    </label>
                  )}
                  {isWeapon && !isGlove && (
                    <label>
                      <span className="field-label">StatTrak kills</span>
                      <Input
                        value={stattrakText}
                        onChange={(event) => setStattrakText(event.target.value)}
                        onBlur={(event) => commitStattrak(event.currentTarget.value)}
                        inputMode="numeric"
                        placeholder="empty = none"
                        className="h-9 text-xs"
                      />
                    </label>
                  )}
                </div>
              )}

              <label className="block">
                <span className="field-label">Name tag</span>
                <Input
                  value={item.attributes?.['111'] ?? item.custom_name ?? ''}
                  onChange={(event) => onName(event.target.value)}
                  placeholder="name tag text"
                  className="h-9 text-xs"
                  maxLength={64}
                />
              </label>

              {isSkin && !isGlove && (
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
                      onPick={(id) => setSticker(pickSlot, id)}
                      onClear={() => setSticker(pickSlot, null)}
                      onClose={() => setPickSlot(null)}
                    />
                  )}
                </div>
              )}

              <details className="group">
                <summary className="cursor-pointer text-[11px] text-muted-foreground transition hover:text-foreground">
                  Raw values
                </summary>
                <div className="mt-2 space-y-2 rounded-lg border border-white/[.06] bg-black/20 p-2.5">
                  <label className="flex items-center gap-2">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">position</span>
                    <Input
                      value={positionText}
                      onChange={(event) => setPositionText(event.target.value)}
                      onBlur={(event) => {
                        const value = event.currentTarget.value
                        const parsed = Number(value)
                        if (value.trim() === '' || !Number.isInteger(parsed) || parsed < 0) {
                          setPositionText(String(item.inventory))
                          return
                        }
                        onPosition(parsed)
                        setPositionText(String(parsed))
                      }}
                      inputMode="numeric"
                      className="h-8 text-xs"
                      aria-label="Inventory position"
                    />
                  </label>
                  {rawEntries.map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">attr {key}</span>
                      <Input
                        value={attrDrafts[key] ?? value}
                        onChange={(event) => setAttrDrafts((current) => ({ ...current, [key]: event.target.value }))}
                        onBlur={(event) => {
                          onAttr(key, event.currentTarget.value)
                          setAttrDrafts((current) => {
                            const copy = { ...current }
                            delete copy[key]
                            return copy
                          })
                        }}
                        inputMode="text"
                        className="h-8 font-mono text-xs"
                        aria-label={`Attribute ${key}`}
                      />
                    </label>
                  ))}
                  {rawEntries.length === 0 && (
                    <p className="px-1 text-[11px] text-muted-foreground">No other attributes on this item.</p>
                  )}
                </div>
              </details>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="danger" onClick={onDelete}>
                <Trash2 className="size-4" />Delete item
              </Button>
              <Button variant="secondary" onClick={onClose}>
                <X className="size-4" />Done
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
