import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes, ChevronDown, CircleAlert, Database, Grid2X2, Images, Layers, List,
  Loader2, PackageSearch, RotateCcw, SlidersHorizontal, Terminal,
} from 'lucide-react'
import { api, store } from '../lib/api'
import { useReport } from '../lib/report'
import { rconHint } from '../lib/rcon-hints'
import type { SchemaState, GiveResponse, RconHealth } from '../lib/app-types'
import {
  BROWSE_TABS, isSkinKind, categoryForKind, isGunWeapon, isKnifeWeapon, isGloveWeapon,
  skinImage, categoryImage, agentMatchesTeam, skinSource,
  type Kind, type Skin, type CategoryItem, type Weapon,
} from '../lib/catalog'
import { CategoryBar } from '../components/shell/category-bar'
import { FilterSidebar, MobileFilters, type FilterState } from '../components/shell/sidebar'
import { ItemGrid } from '../components/catalog/item-grid'
import type { CardItem } from '../components/catalog/item-card'
import { EmptyState } from '../components/common/empty-state'
import { SkinConfigurator, type SkinSelection } from '../components/give/skin-configurator'
import { GenericConfigurator, type GenericSelection } from '../components/give/generic-configurator'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'

const PAGE_STEP = 24
const CATEGORY_LIMIT = 500

export function LivePage({ schema, onReloadSchema, rconHealth, onOpenSettings }: {
  schema: SchemaState
  onReloadSchema: () => void
  rconHealth: RconHealth
  onOpenSettings: () => void
}) {
  const report = useReport()

  const [kind, setKind] = useState<Kind>('skins')
  const [weaponId, setWeaponId] = useState(7)
  const [knifeId, setKnifeId] = useState(515)
  const [gloveId, setGloveId] = useState(5027)
  const [agentTeam, setAgentTeam] = useState<'ct' | 't'>('ct')
  const [skinQuery, setSkinQuery] = useState('')
  const [catQuery, setCatQuery] = useState('')
  const [rarity, setRarity] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [visible, setVisible] = useState(PAGE_STEP)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

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

  // keep the selections valid for the schema that is actually loaded
  useEffect(() => {
    if (!schema.weapons.length) return
    if (guns.length && !guns.some((weapon) => weapon.def_index === weaponId)) setWeaponId(guns[0].def_index)
    if (knives.length && !knives.some((weapon) => weapon.def_index === knifeId)) setKnifeId(knives[0].def_index)
    if (gloves.length && !gloves.some((weapon) => weapon.def_index === gloveId)) setGloveId(gloves[0].def_index)
  }, [schema.weapons, guns, knives, gloves, weaponId, knifeId, gloveId])

  useEffect(() => {
    if (!skinKind) return
    let cancelled = false
    setSkinsLoading(true)
    setSkinsError('')
    setSkinsWeaponId(null)
    api(`/api/schema/skins/${activeWeaponId}`)
      .then((response) => {
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        const list: Skin[] = Array.isArray(response.skins) ? response.skins : []
        setSkins(list)
        setSkinsWeaponId(activeWeaponId)
        const named = list.find((skin) => skin.name.includes(' | '))
        const weaponName = named ? named.name.split(' | ')[0] : `weapon ${activeWeaponId}`
        report({ kind: 'schema', label: `${weaponName} skins loaded`, ok: true, detail: `${list.length} skins` })
      })
      .catch((cause) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setSkinsError(message)
        setSkins([])
        setSkinsWeaponId(activeWeaponId)
        report({ kind: 'error', label: `load skins for weapon ${activeWeaponId}`, raw: message, ok: false })
      })
      .finally(() => { if (!cancelled) setSkinsLoading(false) })
    return () => { cancelled = true }
  }, [skinKind, activeWeaponId, reloadKey, report])

  useEffect(() => {
    if (!category) return
    let cancelled = false
    setCatLoading(true)
    setCatError('')
    setCatItemsCategory(null)
    const timer = window.setTimeout(async () => {
      try {
        const response = await api(`/api/schema/category/${category}?limit=${CATEGORY_LIMIT}&q=${encodeURIComponent(catQuery)}`)
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        const list: CategoryItem[] = Array.isArray(response.items) ? response.items : []
        setCatItems(list)
        setCatItemsCategory(category)
        if (catQuery === '') {
          report({
            kind: 'schema',
            label: `${category} loaded`,
            ok: true,
            detail: `${list.length} rows${list.length >= CATEGORY_LIMIT ? ` (server cap ${CATEGORY_LIMIT})` : ''}`,
          })
        }
      } catch (cause) {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setCatError(message)
        setCatItems([])
        setCatItemsCategory(category)
        report({ kind: 'error', label: `load category ${category}`, raw: message, ok: false })
      } finally {
        if (!cancelled) setCatLoading(false)
      }
    }, catQuery ? 300 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [category, catQuery, reloadKey, report])

  // only trust data fetched for the current weapon/category: avoids rendering
  // the previous weapon's paints (and bogus /imgs URLs) for one frame.
  const activeSkins = skinKind && skinsWeaponId === activeWeaponId ? skins : []
  const activeCatItems = category && catItemsCategory === category ? catItems : []
  const dataReady = skinKind ? skinsWeaponId === activeWeaponId : category !== null && catItemsCategory === category

  const rarities = useMemo(() => {
    const map = new Map<string, string>()
    const source: { rarity?: { name: string; color: string } }[] = skinKind ? activeSkins : activeCatItems
    for (const item of source) {
      const name = item.rarity?.name
      if (name && !map.has(name)) map.set(name, item.rarity?.color || '#555')
    }
    return [...map.entries()].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name))
  }, [skinKind, activeSkins, activeCatItems])

  useEffect(() => {
    if (!dataReady) return
    if (rarity && !rarities.some((entry) => entry.name === rarity)) setRarity('')
  }, [dataReady, rarities, rarity])

  useEffect(() => { setVisible(PAGE_STEP) }, [kind, weaponId, knifeId, gloveId, skinQuery, catQuery, rarity, agentTeam])

  const filteredSkins = useMemo(() => {
    const needle = skinQuery.trim().toLowerCase()
    return activeSkins.filter((skin) => {
      if (needle && !skin.name.toLowerCase().includes(needle)) return false
      if (rarity && (skin.rarity?.name ?? 'unknown') !== rarity) return false
      return true
    })
  }, [activeSkins, skinQuery, rarity])

  const filteredCategory = useMemo(() => {
    return activeCatItems.filter((item) => {
      if (kind === 'agents' && !agentMatchesTeam(item.name, agentTeam)) return false
      if (rarity && (item.rarity?.name ?? 'unknown') !== rarity) return false
      return true
    })
  }, [activeCatItems, kind, agentTeam, rarity])

  const categoryCapped = !skinKind && activeCatItems.length >= CATEGORY_LIMIT
  const total = skinKind ? filteredSkins.length : filteredCategory.length
  const loading = skinKind
    ? skinsLoading || skinsWeaponId !== activeWeaponId
    : catLoading || (category !== null && catItemsCategory !== category)
  const error = skinKind ? skinsError : catError
  const cacheEmpty = schema.status === 'ready' && !schema.cached
  const activeWeapon = schema.weapons.find((weapon) => weapon.def_index === activeWeaponId)

  const cards = useMemo<CardItem[]>(() => {
    if (skinKind) {
      return filteredSkins.slice(0, visible).map((skin) => ({
        id: String(skin.paint),
        name: skin.name,
        image: skinImage(activeWeaponId, skin.paint),
        accent: skin.rarity?.color,
        meta: skinSource(skin),
        fallback: String(skin.paint),
      }))
    }
    return filteredCategory.slice(0, visible).map((item) => ({
      id: item.def_index,
      name: item.name,
      image: categoryImage(category ?? '', item.def_index),
      accent: item.rarity?.color,
      fallback: item.def_index,
    }))
  }, [skinKind, filteredSkins, filteredCategory, visible, activeWeaponId, category, kind])

  const activeFilters =
    Number((skinKind ? skinQuery : catQuery).trim().length > 0) +
    Number(rarity !== '') +
    Number(kind === 'agents')

  const totalNoun = skinKind ? 'skins' : 'items'
  const resultLabel = loading
    ? 'loading…'
    : `${total}${categoryCapped ? '+' : ''} ${totalNoun}`

  const resetFilters = () => {
    setSkinQuery('')
    setCatQuery('')
    setRarity('')
    setAgentTeam('ct')
  }

  const filterState: FilterState = {
    query: skinKind ? skinQuery : catQuery,
    onQuery: skinKind ? setSkinQuery : setCatQuery,
    queryPlaceholder: skinKind
      ? `search ${activeWeapon?.name ?? 'weapon'} skins`
      : `search ${category ?? 'category'}`,
    showSearch: kind !== 'raw',
    searchDisabled: kind === 'raw',
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
    onReset: resetFilters,
    activeFilters,
    resultLabel,
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

  const schemaNotice = schema.status === 'error' ? (
    <EmptyState
      icon={<Database className="size-6" />}
      title="Catalog cache could not be loaded"
      action={<Button onClick={onReloadSchema}><RotateCcw className="size-4" />Retry</Button>}
    >
      {schema.error ?? 'The API did not respond while reading /api/schema/weapons and /api/schema/counts.'}
    </EmptyState>
  ) : schema.status === 'ready' && cacheEmpty ? (
    <EmptyState
      icon={<PackageSearch className="size-6" />}
      title="No catalog cache yet"
      action={
        <>
          <Button onClick={onReloadSchema}><RotateCcw className="size-4" />Reload cache</Button>
          <Button variant="secondary" onClick={() => setKind('raw')}><Terminal className="size-4" />Give by def index</Button>
        </>
      }
    >
      <p>Run this once while online to fill the catalogue:</p>
      <pre className="log-surface mt-3 text-left">{'npm run fetch-schema\nnpm run prefetch-images'}</pre>
      <p className="mt-2 text-xs">Both write to gitignored <span className="font-mono">data/</span> and <span className="font-mono">imgs/</span>. Nothing is fetched at runtime.</p>
    </EmptyState>
  ) : null

  return (
    <>
      <CategoryBar
        label="Schema categories"
        tabs={BROWSE_TABS}
        value={kind}
        onChange={(id) => { setKind(id as Kind); setSkinSelection(null); setGenericSelection(null) }}
        trailing={
          <>
            <span className="category-divider" aria-hidden />
            <button
              onClick={() => { setKind('raw'); setSkinSelection(null); setGenericSelection(null) }}
              className={cn('category-link', kind === 'raw' && 'active')}
              aria-current={kind === 'raw' ? 'page' : undefined}
              aria-label="Manual entry"
            >
              <Terminal className="size-3.5" /><span className="hidden sm:inline">Manual</span>
            </button>
          </>
        }
      />

      <main className="page-shell pb-16 pt-7">
        {rconHealth === 'auth' && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-err/30 bg-err/[.06] px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-err-soft" />
              <p className="min-w-0 text-xs leading-relaxed text-err-soft">
                RCON auth failed — gives will return ERR until the password in Settings matches the GC. An empty
                password in config.txt accepts anything.
              </p>
            </div>
            <Button variant="secondary" size="sm" className="self-start sm:self-auto" onClick={onOpenSettings}>Open settings</Button>
          </div>
        )}

        {kind === 'raw' ? (
          <RawGivePanel />
        ) : kind === 'all' ? (
          schemaNotice ?? (
            <BrowseOverview
              weapons={schema.weapons}
              counts={schema.counts}
              loading={schema.status === 'loading'}
              onPick={(next) => setKind(next)}
            />
          )
        ) : (
          <div className="workspace">
            <FilterSidebar state={filterState} />

            <section className="min-w-0 flex-1" aria-label="Catalog results">
              <div className="results-toolbar">
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">
                    {loading ? 'Loading the catalog…' : <>Showing <b className="font-medium text-foreground/75">{Math.min(visible, total)}</b> of {total}{categoryCapped ? '+' : ''} {totalNoun}{categoryCapped ? ' (server cap)' : ''}</>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileFilters(true)}>
                    <SlidersHorizontal className="size-3.5" />Filters
                    {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
                  </Button>
                  <div className="hidden rounded-lg border border-white/[.075] bg-white/[.035] p-0.5 sm:flex">
                    <button onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={cn('view-button', view === 'grid' && 'active')}><Grid2X2 /></button>
                    <button onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={cn('view-button', view === 'list' && 'active')}><List /></button>
                  </div>
                </div>
              </div>

              {schema.status === 'loading' && <ItemGrid items={[]} view={view} loading onOpen={() => undefined} />}

              {schemaNotice}

              {schema.status === 'ready' && !cacheEmpty && loading && <ItemGrid items={[]} view={view} loading onOpen={openCard} />}

              {schema.status === 'ready' && !cacheEmpty && !loading && error && (
                <EmptyState
                  icon={<Database className="size-6" />}
                  title="Could not load this category"
                  action={<Button onClick={() => setReloadKey((key) => key + 1)}><RotateCcw className="size-4" />Retry</Button>}
                >
                  <span className="font-mono text-xs text-err-soft">{error}</span>
                </EmptyState>
              )}

              {schema.status === 'ready' && !cacheEmpty && !loading && !error && total === 0 && (
                <EmptyState
                  icon={<Images className="size-6" />}
                  title={kind === 'gloves' ? 'No gloves match' : 'Nothing matches those filters'}
                  action={<Button variant="secondary" onClick={resetFilters}><RotateCcw className="size-4" />Clear filters</Button>}
                >
                  {categoryCapped
                    ? 'The category is capped at 500 rows per request — narrow the search instead of clearing it.'
                    : 'Adjust the weapon, rarity, or search text.'}
                </EmptyState>
              )}

              {schema.status === 'ready' && !cacheEmpty && !loading && !error && total > 0 && (
                <>
                  <ItemGrid items={cards} view={view} onOpen={openCard} />
                  {visible < total && (
                    <div className="mt-8 flex flex-col items-center gap-2">
                      <Button variant="secondary" size="lg" onClick={() => setVisible((count) => count + PAGE_STEP)}>
                        Show more<ChevronDown className="size-4" />
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{total - visible} more loaded in this view</span>
                    </div>
                  )}
                  {categoryCapped && (
                    <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                      <Layers className="mt-0.5 size-3 shrink-0" />
                      The server returns at most {CATEGORY_LIMIT} rows per request{catQuery ? ' for this search' : ''}. This is not the full
                      catalogue — refine the search (stickers alone have 11k+ rows).
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {kind !== 'raw' && kind !== 'all' && <MobileFilters open={mobileFilters} onOpenChange={setMobileFilters} state={filterState} />}

      {skinSelection && (
        <SkinConfigurator
          key={`${skinSelection.weaponId}-${skinSelection.paint}`}
          selection={skinSelection}
          open={skinOpen}
          onOpenChange={setSkinOpen}
        />
      )}

      {genericSelection && (
        <GenericConfigurator
          key={`${genericSelection.kind}-${genericSelection.item.def_index}`}
          selection={genericSelection}
          open={genericOpen}
          onOpenChange={setGenericOpen}
        />
      )}
    </>
  )
}

function BrowseOverview({ weapons, counts, loading, onPick }: {
  weapons: Weapon[]
  counts: Record<string, number>
  loading: boolean
  onPick: (kind: Exclude<Kind, 'raw'>) => void
}) {
  const rows: { id: Exclude<Kind, 'raw'>; label: string; count?: number; hint: string }[] = [
    { id: 'skins', label: 'Skins', count: weapons.filter(isGunWeapon).length, hint: 'weapons · every paint' },
    { id: 'knives', label: 'Knives', count: weapons.filter(isKnifeWeapon).length, hint: 'weapons · every finish' },
    { id: 'gloves', label: 'Gloves', count: weapons.filter(isGloveWeapon).length, hint: 'weapons · every finish' },
    { id: 'stickers', label: 'Stickers', count: counts.stickers, hint: 'search the full set' },
    { id: 'agents', label: 'Agents', count: counts.agents, hint: 'CT and T models' },
    { id: 'cases', label: 'Cases', count: counts.crates, hint: 'containers' },
    { id: 'keys', label: 'Keys', count: counts.keys, hint: 'case keys' },
    { id: 'music', label: 'Music', count: counts.music_kits, hint: 'music kits' },
  ]

  return (
    <section aria-label="Catalog categories">
      <h2 className="text-lg font-medium">Browse the catalog</h2>
      <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
        Pick a category to load it from the local CS:GO cache. Every item opens a configurator that shows the exact
        give_item line before sending.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() => onPick(row.id)}
            className="flex flex-col items-start gap-1 rounded-xl border border-white/[.07] bg-card/75 p-4 text-left transition hover:border-white/20 hover:bg-card-hover"
          >
            <span className="text-sm font-medium text-foreground">{row.label}</span>
            <span className="num font-mono text-2xl leading-tight text-foreground/80">
              {loading ? '…' : row.count ?? '—'}
            </span>
            <span className="text-[11px] text-muted-foreground">{row.hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RawGivePanel() {
  const report = useReport()
  const [def, setDef] = useState('7')
  const [countText, setCountText] = useState('1')
  const [autosave, setAutosave] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GiveResponse | null>(null)
  const [error, setError] = useState('')

  const defIndex = Number(def)
  const defValid = def.trim() !== '' && Number.isInteger(defIndex) && defIndex > 0
  const count = Number(countText)
  const countValid = Number.isInteger(count) && count >= 1 && count <= 100
  const canSubmit = !submitting && defValid && countValid

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const response: GiveResponse = await api('/api/rcon/give', {
        method: 'POST',
        body: JSON.stringify({ host: store.host, port: store.port, password: store.password, autosave, item: { def_index: defIndex, count } }),
      })
      setResult(response)
      report(
        {
          kind: 'give',
          label: `raw give_item ${defIndex}${count !== 1 ? ` ×${count}` : ''}`,
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
      report({ kind: 'error', label: 'raw give', raw: message, ok: false }, { title: 'Give request failed', body: message }, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="panel">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-primary">
          <Terminal className="size-3.5" />Manual entry
        </div>
        <h2 className="text-lg font-medium">Give by def index</h2>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label>
            <span className="field-label">Def index</span>
            <Input
              value={def}
              onChange={(event) => setDef(event.target.value)}
              inputMode="numeric"
              className={cn('h-9 text-xs', !defValid && 'border-err-strong/70')}
              aria-invalid={!defValid}
            />
          </label>
          <label>
            <span className="field-label">Count (1–100)</span>
            <Input
              value={countText}
              onChange={(event) => setCountText(event.target.value)}
              inputMode="numeric"
              className={cn('h-9 text-xs', !countValid && 'border-err-strong/70')}
              aria-invalid={!countValid}
            />
          </label>
        </div>
        {!defValid && <p className="mt-2 text-[11px] text-err-soft">Def index must be a positive whole number.</p>}
        {!countValid && <p className="mt-2 text-[11px] text-err-soft">Count must be between 1 and 100.</p>}

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
          <Checkbox checked={autosave} onCheckedChange={(checked) => setAutosave(checked === true)} />
          Run <span className="font-mono text-[11px] text-foreground/80">save_inventory</span> after adding
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
            {submitting ? 'Sending…' : 'Give item'}
          </Button>
        </div>

        {error && <div className="log-surface err mt-4">{error}</div>}
        {result && (
          <div className={cn('log-surface mt-4', result.ok ? 'ok' : 'err')}>
            {result.command && <>{result.command}{'\n'}</>}
            {result.raw}
            {result.saved && <>{'\n'}save_inventory -&gt; {result.saved}</>}
          </div>
        )}
        {result && (!result.ok || /^err/i.test(result.saved ?? '')) && (
          <p className="mt-2 text-[11px] leading-relaxed text-warn-soft/75">{rconHint(result.ok ? result.saved ?? '' : result.raw)}</p>
        )}
      </div>
    </div>
  )
}
