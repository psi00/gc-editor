import type { ReactNode } from 'react'
import { ArrowRight, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { type Quality, type Weapon, rarityLabel } from '../../lib/catalog'
import { Input } from '../ui/input'
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
  rarity: string
  onRarity: (value: string) => void
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
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground">/</kbd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="filter-section">
      <div className="filter-heading"><h3>{title}</h3></div>
      {children}
    </section>
  )
}

export function FilterControls({ state }: { state: FilterState }) {
  return (
    <div className="space-y-5">
      {state.showSearch && <SearchField state={state} />}

      {state.weapon && (
        <Section title="Weapon">
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
        <Section title="Rarity">
          <Select value={state.rarity || 'all'} onValueChange={(value) => state.onRarity(value === 'all' ? '' : value)}>
            <SelectTrigger className="w-full" aria-label="Filter by rarity"><SelectValue placeholder="All rarities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rarities</SelectItem>
              {state.rarities.map((rarity) => (
                <SelectItem key={rarity.name} value={rarity.name}>{rarityLabel(rarity.name)}</SelectItem>
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
                  'rounded-md border border-white/[.065] bg-white/[.018] px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground',
                  state.agentTeam === team && 'border-primary/40 bg-primary/10 text-foreground',
                )}
              >{label}</button>
            ))}
          </div>
        </Section>
      )}

      <button
        onClick={state.onReset}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-muted-foreground transition hover:bg-white/[.04] hover:text-foreground"
      >
        <RotateCcw className="size-3.5" /> Reset filters
      </button>
    </div>
  )
}

export function FilterSidebar({ state }: { state: FilterState }) {
  return (
    <aside className="filter-sidebar" aria-label="Catalog filters">
      <div className="mb-5 flex items-center justify-between">
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
