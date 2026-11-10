import { useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { type Quality, type Weapon, rarityLabel } from '../../lib/catalog'
import { Input } from '../ui/input'
import { Checkbox } from '../ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { WeaponPicker } from '../catalog/weapon-picker'
import { cn } from '../../lib/utils'

export type FilterState = {
  query: string
  onQuery: (value: string) => void
  queryPlaceholder: string
  showSearch: boolean
  searchDisabled?: boolean
  weapon?: { weapons: Weapon[]; value: number; onChange: (defIndex: number) => void; label: string }
  rarities: { name: string; color: string }[]
  /** Selected rarity names. Empty means every rarity. */
  rarity: string[]
  onRarity: (value: string[]) => void
  /** Case or collection names available for the current category. */
  collections?: string[]
  collection?: string
  onCollection?: (value: string) => void
  showQuality: boolean
  quality?: Quality
  onQuality?: (value: Quality) => void
  agentTeam?: 'ct' | 't'
  onAgentTeam?: (team: 'ct' | 't') => void
  onReset: () => void
  activeFilters: number
  resultLabel: string
  ready: boolean
}

function SearchField({ state }: { state: FilterState }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={state.query}
        onChange={(event) => state.onQuery(event.target.value)}
        placeholder={state.queryPlaceholder}
        className="h-10 pl-9 pr-10"
        aria-label={state.queryPlaceholder}
        data-search-input
        disabled={state.searchDisabled}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-edge/10 px-1.5 py-0.5 text-[11px] text-muted-foreground">/</kbd>
    </div>
  )
}

/** Collapsible filter block, mirroring the CSFloat panel: title row + chevron. */
function Section({ title, children, count, defaultOpen = true }: {
  title: string
  children: ReactNode
  count?: number
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="filter-section">
      <button
        type="button"
        className="filter-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="filter-title">{title}</span>
        <span className="filter-toggle-meta">
          {count ? <span className="filter-count">{count}</span> : null}
          <ChevronDown className={cn('filter-chevron', !open && 'closed')} aria-hidden />
        </span>
      </button>
      {open && <div className="filter-body">{children}</div>}
    </section>
  )
}

function RarityPicker({ state }: { state: FilterState }) {
  const selected = new Set(state.rarity)
  return (
    <div className="filter-options">
      {state.rarities.map((entry) => {
        const checked = selected.has(entry.name)
        return (
          <label key={entry.name} className="filter-option" data-checked={checked}>
            <Checkbox
              checked={checked}
              aria-label={rarityLabel(entry.name)}
              onCheckedChange={(value) => {
                const next = new Set(state.rarity)
                if (value === true) next.add(entry.name)
                else next.delete(entry.name)
                state.onRarity([...next])
              }}
            />
            <span className="filter-swatch" style={{ background: entry.color }} aria-hidden />
            <span className="truncate">{rarityLabel(entry.name)}</span>
          </label>
        )
      })}
    </div>
  )
}

export function FilterControls({ state }: { state: FilterState }) {
  return (
    <div className="filter-controls">
      {state.showSearch && <SearchField state={state} />}

      {state.weapon && (
        <Section title={state.weapon.label}>
          <WeaponPicker
            weapons={state.weapon.weapons}
            value={state.weapon.value}
            onChange={state.weapon.onChange}
            label={state.weapon.label}
            disabled={!state.ready}
          />
        </Section>
      )}

      {state.rarities.length > 0 && (
        <Section title="Rarity" count={state.rarity.length || undefined}>
          <RarityPicker state={state} />
        </Section>
      )}

      {state.collections && state.collections.length > 0 && state.onCollection && (
        <Section title="Collection" count={state.collection ? 1 : undefined}>
          <Select
            value={state.collection || 'any'}
            onValueChange={(value) => state.onCollection?.(value === 'any' ? '' : value)}
          >
            <SelectTrigger className="w-full" aria-label="Filter by collection">
              <SelectValue placeholder="Any collection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any collection</SelectItem>
              {state.collections.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      )}

      {state.showQuality && state.quality && state.onQuality && (
        <Section title="Quality">
          <Select value={state.quality} onValueChange={(value) => state.onQuality?.(value as Quality)}>
            <SelectTrigger className="w-full" aria-label="Filter by quality"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All qualities</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="stattrak">StatTrak</SelectItem>
              <SelectItem value="souvenir">Souvenir</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      )}

      {state.agentTeam && state.onAgentTeam && (
        <Section title="Team">
          <div className="grid grid-cols-2 gap-1.5">
            {([['ct', 'Counter-Terrorist'], ['t', 'Terrorist']] as const).map(([team, label]) => (
              <button
                key={team}
                onClick={() => state.onAgentTeam?.(team)}
                aria-pressed={state.agentTeam === team}
                className={cn(
                  'rounded-md border border-edge/[.065] bg-edge/[.018] px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground',
                  state.agentTeam === team && 'border-primary/40 bg-primary/10 text-foreground',
                )}
              >{label}</button>
            ))}
          </div>
        </Section>
      )}

      <button onClick={state.onReset} className="filter-reset">
        <RotateCcw className="size-3.5" /> Reset filters
      </button>
    </div>
  )
}

export function FilterSidebar({ state }: { state: FilterState }) {
  return (
    <aside className="filter-sidebar" aria-label="Catalog filters">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4 text-primary" />Filters
          {state.activeFilters > 0 && <span className="filter-count">{state.activeFilters}</span>}
        </div>
      </div>
      <FilterControls state={state} />
    </aside>
  )
}

export function MobileFilters({ open, onOpenChange, state }: { open: boolean; onOpenChange: (open: boolean) => void; state: FilterState }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Catalog filters</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {state.resultLabel}. Filters apply to the current category.
        </DialogDescription>
        <FilterControls state={state} />
        <Button onClick={() => onOpenChange(false)}>Show results<ArrowRight className="size-4" /></Button>
      </DialogContent>
    </Dialog>
  )
}
