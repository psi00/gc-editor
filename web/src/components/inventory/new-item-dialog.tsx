import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Grid2X2, List, Plus, SlidersHorizontal } from 'lucide-react'
import { api } from '../../lib/api'
import type { GiveItem, SchemaState } from '../../lib/app-types'
import {
  BROWSE_TABS, agentMatchesTeam, categoryForKind, categoryImage, isGloveWeapon, isGunWeapon, isKnifeWeapon,
  isSkinKind, skinImage, skinSource,
  type CategoryItem, type Kind, type Skin,
} from '../../lib/catalog'
import { FilterSidebar, MobileFilters, type FilterState } from '../shell/sidebar'
import { ItemGrid } from '../catalog/item-grid'
import type { CardItem } from '../catalog/item-card'
import { SkinConfigurator, type SkinSelection } from '../give/skin-configurator'
import { GenericConfigurator, type GenericSelection } from '../give/generic-configurator'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'

const PAGE_STEP = 24
const CATEGORY_LIMIT = 500

/**
 * Catalog browser for the gallery. It mirrors the Live page, but a selection
 * opens the same configurator in local mode: the item is staged into
 * inventory.txt and nothing is sent over RCON.
 */
export function NewItemDialog({ open, onOpenChange, schema, onAdd }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: SchemaState
  onAdd: (item: GiveItem) => void
}) {
  const [kind, setKind] = useState<Kind>('skins')
  const [weaponId, setWeaponId] = useState(7)
  const [knifeId, setKnifeId] = useState(515)
  const [gloveId, setGloveId] = useState(5027)
  const [agentTeam, setAgentTeam] = useState<'ct' | 't'>('ct')
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [visible, setVisible] = useState(PAGE_STEP)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [added, setAdded] = useState(0)

  const [skins, setSkins] = useState<Skin[]>([])
  const [skinsWeaponId, setSkinsWeaponId] = useState<number | null>(null)
  const [skinsLoading, setSkinsLoading] = useState(false)
  const [skinsError, setSkinsError] = useState('')
  const [catItems, setCatItems] = useState<CategoryItem[]>([])
  const [catItemsCategory, setCatItemsCategory] = useState<string | null>(null)
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState('')

  const [skinSelection, setSkinSelection] = useState<SkinSelection | null>(null)
  const [genericSelection, setGenericSelection] = useState<GenericSelection | null>(null)
  const [skinOpen, setSkinOpen] = useState(false)
  const [genericOpen, setGenericOpen] = useState(false)

  const category = kind === 'all' || kind === 'raw' ? null : categoryForKind(kind)
  const skinKind = isSkinKind(kind)
  const activeWeaponId = kind === 'knives' ? knifeId : kind === 'gloves' ? gloveId : weaponId

  const guns = useMemo(() => schema.weapons.filter(isGunWeapon), [schema.weapons])
  const knives = useMemo(() => schema.weapons.filter(isKnifeWeapon), [schema.weapons])
  const gloves = useMemo(() => schema.weapons.filter(isGloveWeapon), [schema.weapons])

  useEffect(() => {
    if (!open) return
    if (!schema.weapons.length) return
    if (guns.length && !guns.some((weapon) => weapon.def_index === weaponId)) setWeaponId(guns[0].def_index)
    if (knives.length && !knives.some((weapon) => weapon.def_index === knifeId)) setKnifeId(knives[0].def_index)
    if (gloves.length && !gloves.some((weapon) => weapon.def_index === gloveId)) setGloveId(gloves[0].def_index)
  }, [open, schema.weapons, guns, knives, gloves, weaponId, knifeId, gloveId])

  useEffect(() => {
    if (!open || !skinKind) return undefined
    let cancelled = false
    setSkinsLoading(true)
    setSkinsError('')
    setSkinsWeaponId(null)
    api(`/api/schema/skins/${activeWeaponId}?game=${schema.game}`)
      .then((response) => {
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        setSkins(Array.isArray(response.skins) ? response.skins : [])
        setSkinsWeaponId(activeWeaponId)
      })
      .catch((cause) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setSkinsError(message)
        setSkins([])
        setSkinsWeaponId(activeWeaponId)
      })
      .finally(() => { if (!cancelled) setSkinsLoading(false) })
    return () => { cancelled = true }
  }, [open, skinKind, activeWeaponId, schema.game])

  useEffect(() => {
    if (!open || !category) return undefined
    let cancelled = false
    setCatLoading(true)
    setCatError('')
    setCatItemsCategory(null)
    const timer = window.setTimeout(async () => {
      try {
        const response = await api(`/api/schema/category/${category}?limit=${CATEGORY_LIMIT}&q=${encodeURIComponent(query)}&game=${schema.game}`)
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        setCatItems(Array.isArray(response.items) ? response.items : [])
        setCatItemsCategory(category)
      } catch (cause) {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setCatError(message)
        setCatItems([])
        setCatItemsCategory(category)
      } finally {
        if (!cancelled) setCatLoading(false)
      }
    }, query ? 300 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, category, query, schema.game])

  useEffect(() => { setVisible(PAGE_STEP) }, [kind, weaponId, knifeId, gloveId, query, rarity, agentTeam])
  useEffect(() => { setRarity(''); setQuery('') }, [kind])
  useEffect(() => { if (!open) setAdded(0) }, [open])

  const activeSkins = skinKind && skinsWeaponId === activeWeaponId ? skins : []
  const activeCatItems = category && catItemsCategory === category ? catItems : []

  const rarities = useMemo(() => {
    const map = new Map<string, string>()
    const source: { rarity?: { name: string; color: string } }[] = skinKind ? activeSkins : activeCatItems
    for (const item of source) {
      const name = item.rarity?.name
      if (name && !map.has(name)) map.set(name, item.rarity?.color || '#555')
    }
    return [...map.entries()].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name))
  }, [skinKind, activeSkins, activeCatItems])

  const filteredSkins = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return activeSkins.filter((skin) => {
      if (needle && !skin.name.toLowerCase().includes(needle)) return false
      if (rarity && (skin.rarity?.name ?? 'unknown') !== rarity) return false
      return true
    })
  }, [activeSkins, query, rarity])

  const filteredCategory = useMemo(() => {
    return activeCatItems.filter((item) => {
      if (kind === 'agents' && !agentMatchesTeam(item.name, agentTeam)) return false
      if (rarity && (item.rarity?.name ?? 'unknown') !== rarity) return false
      return true
    })
  }, [activeCatItems, kind, agentTeam, rarity])

  const total = skinKind ? filteredSkins.length : filteredCategory.length
  const loading = skinKind
    ? skinsLoading || skinsWeaponId !== activeWeaponId
    : catLoading || (category !== null && catItemsCategory !== category)
  const error = skinKind ? skinsError : catError
  const activeWeapon = schema.weapons.find((weapon) => weapon.def_index === activeWeaponId)

  const cards = useMemo<CardItem[]>(() => {
    if (skinKind) {
      return filteredSkins.slice(0, visible).map((skin) => ({
        id: String(skin.paint),
        name: skin.name,
        image: skinImage(activeWeaponId, skin.paint, schema.game),
        accent: skin.rarity?.color,
        meta: skinSource(skin),
        fallback: String(skin.paint),
      }))
    }
    return filteredCategory.slice(0, visible).map((item) => ({
      id: item.def_index,
      name: item.name,
      image: categoryImage(category ?? '', item.def_index, schema.game),
      accent: item.rarity?.color,
      fallback: item.def_index,
    }))
  }, [skinKind, filteredSkins, filteredCategory, visible, activeWeaponId, category])

  const filterState: FilterState = {
    query,
    onQuery: setQuery,
    queryPlaceholder: skinKind ? `search ${activeWeapon?.name ?? 'weapon'} skins` : `search ${category ?? 'category'}`,
    showSearch: kind !== 'all',
    searchDisabled: kind === 'all',
    weapon: kind === 'skins'
      ? { weapons: guns, value: weaponId, onChange: setWeaponId, label: 'Weapon' }
      : kind === 'knives'
        ? { weapons: knives, value: knifeId, onChange: setKnifeId, label: 'Knife' }
        : kind === 'gloves'
          ? { weapons: gloves, value: gloveId, onChange: setGloveId, label: 'Gloves' }
          : undefined,
    rarities,
    rarity,
    onRarity: setRarity,
    showQuality: false,
    agentTeam: kind === 'agents' ? agentTeam : undefined,
    onAgentTeam: kind === 'agents' ? setAgentTeam : undefined,
    onReset: () => { setQuery(''); setRarity(''); setAgentTeam('ct') },
    activeFilters: Number(query.trim().length > 0) + Number(rarity !== '') + Number(kind === 'agents'),
    resultLabel: loading ? 'loading…' : `${total} ${skinKind ? 'skins' : 'items'}`,
    ready: schema.status === 'ready',
  }

  const openCard = (card: CardItem) => {
    if (skinKind) {
      const skin = filteredSkins.find((entry) => String(entry.paint) === String(card.id))
      if (!skin) return
      setSkinSelection({
        weaponId: activeWeaponId,
        weaponName: activeWeapon?.name,
        paint: skin.paint,
        name: skin.name,
        rarity: skin.rarity,
      })
      setSkinOpen(true)
      return
    }
    const item = filteredCategory.find((entry) => entry.def_index === String(card.id))
    if (!item || !category) return
    setGenericSelection({ kind, category, item })
    setGenericOpen(true)
  }

  const handleAdd = (item: GiveItem) => {
    onAdd(item)
    setAdded((current) => current + Math.max(1, item.count ?? 1))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-[1520px] overflow-hidden p-0">
        <div className="flex max-h-[88vh] min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-white/[.06] px-5 py-4 pr-14">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Plus className="size-4 text-primary" />New item
            </DialogTitle>
            {added > 0 && (
              <span className="chip chip-warn shrink-0">{added} staged</span>
            )}
          </div>

          <nav className="no-scrollbar flex shrink-0 gap-0.5 overflow-x-auto border-b border-white/[.06] px-3 py-1.5" aria-label="New item categories">
            {BROWSE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setKind(tab.id)
                  setSkinSelection(null)
                  setGenericSelection(null)
                }}
                className={cn('category-link', kind === tab.id && 'active')}
                aria-current={kind === tab.id ? 'page' : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {schema.status === 'error' ? (
              <p className="py-16 text-center text-xs text-err-soft">{schema.error ?? 'The catalog could not be loaded.'}</p>
            ) : kind === 'all' ? (
              <CatalogOverview schema={schema} onPick={setKind} />
            ) : (
              <div className="workspace">
                <FilterSidebar state={filterState} />
                <section className="new-item-results min-w-0 flex-1" aria-label="New item results">
                  <div className="results-toolbar">
                    <div className="min-w-0 text-[11px] text-muted-foreground">
                      {loading ? 'Loading the catalog…' : <>Showing <b className="font-medium text-foreground/75">{Math.min(visible, total)}</b> of {total} {skinKind ? 'skins' : 'items'}</>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileFilters(true)}>
                        <SlidersHorizontal className="size-3.5" />Filters
                      </Button>
                      <div className="hidden rounded-lg border border-white/[.075] bg-white/[.035] p-0.5 sm:flex">
                        <button onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={cn('view-button', view === 'grid' && 'active')}><Grid2X2 /></button>
                        <button onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={cn('view-button', view === 'list' && 'active')}><List /></button>
                      </div>
                    </div>
                  </div>

                  {loading && <ItemGrid items={[]} view={view} loading onOpen={() => undefined} />}

                  {!loading && error && <p className="py-16 text-center text-xs text-err-soft">{error}</p>}

                  {!loading && !error && total === 0 && (
                    <p className="py-16 text-center text-xs text-muted-foreground">Nothing matches those filters.</p>
                  )}

                  {!loading && !error && total > 0 && (
                    <>
                      <ItemGrid items={cards} view={view} onOpen={openCard} actionLabel="Configure" />
                      {visible < total && (
                        <div className="mt-8 flex justify-center">
                          <Button variant="secondary" size="lg" onClick={() => setVisible((count) => count + PAGE_STEP)}>
                            Show more<ChevronDown className="size-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>

        {skinSelection && (
          <SkinConfigurator
            key={`${skinSelection.weaponId}-${skinSelection.paint}`}
            selection={skinSelection}
            open={skinOpen}
            onOpenChange={setSkinOpen}
            onAdd={handleAdd}
          />
        )}

        {genericSelection && (
          <GenericConfigurator
            key={`${genericSelection.kind}-${genericSelection.item.def_index}`}
            selection={genericSelection}
            open={genericOpen}
            onOpenChange={setGenericOpen}
            onAdd={handleAdd}
          />
        )}

        <MobileFilters open={mobileFilters} onOpenChange={setMobileFilters} state={filterState} />
      </DialogContent>
    </Dialog>
  )
}

function CatalogOverview({ schema, onPick }: { schema: SchemaState; onPick: (kind: Exclude<Kind, 'raw'>) => void }) {
  const rows: { id: Exclude<Kind, 'raw'>; label: string; count?: number }[] = [
    { id: 'skins', label: 'Skins', count: schema.weapons.filter(isGunWeapon).length },
    { id: 'knives', label: 'Knives', count: schema.weapons.filter(isKnifeWeapon).length },
    { id: 'gloves', label: 'Gloves', count: schema.weapons.filter(isGloveWeapon).length },
    { id: 'stickers', label: 'Stickers', count: schema.counts.stickers },
    { id: 'agents', label: 'Agents', count: schema.counts.agents },
    { id: 'cases', label: 'Cases', count: schema.counts.crates },
    { id: 'keys', label: 'Keys', count: schema.counts.keys },
    { id: 'keychains', label: 'Keychains', count: schema.counts.keychains },
    { id: 'music', label: 'Music', count: schema.counts.music_kits },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <button
          key={row.id}
          onClick={() => onPick(row.id)}
          className="flex flex-col items-start gap-1 rounded-xl border border-white/[.07] bg-card/75 p-4 text-left transition hover:border-white/20 hover:bg-card-hover"
        >
          <span className="text-sm font-medium text-foreground">{row.label}</span>
          <span className="num font-mono text-2xl leading-tight text-foreground/80">
            {schema.status === 'loading' ? '…' : row.count ?? '—'}
          </span>
        </button>
      ))}
    </div>
  )
}
