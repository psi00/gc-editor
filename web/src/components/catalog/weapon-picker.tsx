import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { type Weapon, groupWeapons } from '../../lib/catalog'
import { Input } from '../ui/input'
import { SafeImage } from '../common/safe-image'
import { cn } from '../../lib/utils'

type WeaponPickerProps = {
  weapons: Weapon[]
  value: number
  onChange: (defIndex: number) => void
  label: string
  disabled?: boolean
}

/**
 * Inline, searchable thumbnail picker. Grouped by weapon class so the list
 * stays scannable; gloves never appear in the gun/knife lists (the caller
 * passes the already filtered set).
 */
export function WeaponPicker({ weapons, value, onChange, label, disabled }: WeaponPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (open) {
      setQuery('')
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const selected = weapons.find((weapon) => weapon.def_index === value)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? weapons.filter((weapon) => weapon.name.toLowerCase().includes(needle) || String(weapon.def_index).includes(needle))
      : weapons
    return groupWeapons(filtered)
  }, [weapons, query])

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('.picker-grid button') ?? [])
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    event.preventDefault()
    let next = current
    if (event.key === 'ArrowRight') next = current + 1
    if (event.key === 'ArrowLeft') next = current - 1
    if (event.key === 'ArrowDown') next = current + 2
    if (event.key === 'ArrowUp') next = current - 2
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = buttons.length - 1
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus()
  }

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-white/[.075] bg-white/[.035] px-3 text-left text-xs text-foreground transition hover:bg-white/[.06]"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); close(true) } }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${label}: ${selected?.name ?? `def ${value}`}`}
        disabled={disabled}
      >
        <span className="truncate">{selected?.name ?? `def ${value}`}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="picker-panel" ref={panelRef} onKeyDown={onPanelKeyDown}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="filter weapons"
              aria-label={`Filter ${label.toLowerCase()}`}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="picker-grid">
            {groups.map((group) => (
              <div key={group.key} className="contents">
                <span className="picker-group">{group.label}</span>
                {group.weapons.map((weapon) => (
                  <button
                    key={weapon.def_index}
                    className={cn(weapon.def_index === value && 'on')}
                    onClick={() => { onChange(weapon.def_index); close(true) }}
                    aria-pressed={weapon.def_index === value}
                  >
                    <SafeImage
                      src={weapon.thumb}
                      alt={weapon.name}
                      className="picker-thumb"
                      fallbackClassName="picker-fallback"
                      fallback={String(weapon.def_index)}
                    />
                    <span className="w-full truncate">{weapon.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="col-span-2 py-2 text-center text-[10px] text-muted-foreground">no weapon matches</p>}
          </div>
        </div>
      )}
    </div>
  )
}
