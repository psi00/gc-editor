import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleAlert, Database, FileText, FolderOpen, Grid2X2, History, List, Loader2, RotateCcw, Save, SlidersHorizontal, SquareDashedMousePointer, Trash2, TriangleAlert, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useReport } from '../lib/report'
import type { InvDefaultEquips, InvItem, InvResponse, SchemaState, SettingsInfo } from '../lib/app-types'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { EmptyState } from '../components/common/empty-state'
import { ItemGrid } from '../components/catalog/item-grid'
import type { CardItem } from '../components/catalog/item-card'
import { InventoryItemDialog } from '../components/inventory/inv-item-dialog'
import { itemKey, itemNameTag, resolveInventory, type ResolvedInventory } from '../lib/inventory-catalog'
import { BROWSE_TABS, isKnifeDef, type Kind, type Quality } from '../lib/catalog'
import { cn } from '../lib/utils'
import { CategoryBar } from '../components/shell/category-bar'
import { FilterSidebar, MobileFilters, type FilterState } from '../components/shell/sidebar'

const ROW_CAP = 500
const INTEGER_ATTRS = new Set(['6', '7', '80'])

type Confirm =
  | { type: 'delete'; item: InvItem }
  | { type: 'bulk-delete'; items: InvItem[] }
  | { type: 'empty-save' }
  | { type: 'reload' }
  | { type: 'restore'; backup: BackupEntry }
  | null
type SortOrder = 'def-asc' | 'def-desc' | 'added-desc' | 'added-asc'
type BackupEntry = { name: string; file: string; time: string; count: number | null }

/** Timestamped copies sit next to inventory.txt as `<name>.<stamp>.bak`. */
function backupTime(time: string) {
  const parsed = new Date(time)
  return Number.isNaN(parsed.getTime())
    ? time
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const SORTS: { id: SortOrder; label: string }[] = [
  { id: 'def-asc', label: 'Def index, low to high' },
  { id: 'def-desc', label: 'Def index, high to low' },
  { id: 'added-desc', label: 'Last added first' },
  { id: 'added-asc', label: 'First added first' },
]

/** Trim 6-decimal attribute strings to the value the domain actually stores. */
function normalizeAttr(key: string, value: string | undefined) {
  if (value == null || value === '') return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  if (INTEGER_ATTRS.has(key)) return String(Math.trunc(parsed))
  if (key === '8') return String(parsed)
  return value
}

function normalizeItem(item: InvItem): InvItem {
  const attributes = Object.fromEntries(
    Object.entries(item.attributes ?? {}).map(([key, value]) => [key, normalizeAttr(key, value) ?? value]),
  )
  return { ...item, attributes }
}

type GalleryKind = Exclude<Kind, 'raw'>

function galleryKindOf(item: InvItem, resolved?: ResolvedInventory): GalleryKind {
  if (!resolved) return 'all'
  if (resolved.isMusic) return 'music'
  if (resolved.isGlove) return 'gloves'
  if (isKnifeDef(item.def_index)) return 'knives'
  if (resolved.isSkin) return 'skins'
  if (resolved.category === 'stickers') return 'stickers'
  if (resolved.category === 'agents') return 'agents'
  if (resolved.category === 'crates') return 'cases'
  if (resolved.category === 'keys') return 'keys'
  return 'all'
}

export function OfflinePage({ settings, schema, onDirtyChange }: {
  settings: SettingsInfo | null
  schema: SchemaState
  onDirtyChange?: (dirty: boolean) => void
}) {
  const report = useReport()

  const [path, setPath] = useState('')
  const [items, setItems] = useState<InvItem[]>([])
  const [defaultEquips, setDefaultEquips] = useState<InvDefaultEquips>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOrder>('def-asc')
  const [kind, setKind] = useState<GalleryKind>('all')
  const [rarity, setRarity] = useState('')
  const [quality, setQuality] = useState<Quality>('all')
  const [mobileFilters, setMobileFilters] = useState(false)
  const [editPath, setEditPath] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [catalog, setCatalog] = useState<Map<string, ResolvedInventory>>(new Map())
  const [resolving, setResolving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [backupsError, setBackupsError] = useState('')

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setError('')
    try {
      const response: InvResponse = await api(`/api/inventory${target.trim() ? `?path=${encodeURIComponent(target.trim())}` : ''}`)
      if (response.error) throw new Error(String(response.error))
      setPath(response.path || '')
      setItems(Array.isArray(response.items) ? response.items.map(normalizeItem) : [])
      setDefaultEquips(response.default_equips || {})
      setWarnings(Array.isArray(response.warnings) ? response.warnings : [])
      setDirty(false)
      setSelectedId(null)
      setSelecting(false)
      setSelectedIds(new Set())
      report({
        kind: 'inventory',
        label: `inventory loaded · ${response.items?.length ?? 0} items`,
        ok: true,
        detail: response.path,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: 'load inventory.txt', raw: message, ok: false }, { title: 'Could not load inventory', body: message }, 'err')
    } finally {
      setLoading(false)
    }
  }, [report])

  useEffect(() => { void load('') }, [load])

  const openBackups = useCallback(async () => {
    setBackupsOpen(true)
    setBackupsLoading(true)
    setBackupsError('')
    try {
      const target = path.trim() || settings?.inventoryTxt || ''
      const response = await api(`/api/inventory/backups${target ? `?path=${encodeURIComponent(target)}` : ''}`)
      if (response.error) throw new Error(String(response.error))
      setBackups(Array.isArray(response.backups) ? response.backups : [])
    } catch (cause) {
      setBackups([])
      setBackupsError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBackupsLoading(false)
    }
  }, [path, settings?.inventoryTxt])

  // Stage a backup in the editor. Nothing is written until Save + backup, which
  // first copies the current inventory.txt aside.
  const restoreBackup = useCallback(async (backup: BackupEntry) => {
    setConfirm(null)
    setBackupsOpen(false)
    setLoading(true)
    setError('')
    try {
      const response: InvResponse = await api(`/api/inventory?path=${encodeURIComponent(backup.file)}`)
      if (response.error) throw new Error(String(response.error))
      setItems(Array.isArray(response.items) ? response.items.map(normalizeItem) : [])
      setDefaultEquips(response.default_equips || {})
      setWarnings(Array.isArray(response.warnings) ? response.warnings : [])
      setDirty(true)
      setSelectedId(null)
      setSelecting(false)
      setSelectedIds(new Set())
      report(
        { kind: 'inventory', label: `staged backup ${backup.name} · ${response.items?.length ?? 0} items`, ok: true, detail: 'not written until Save + backup' },
        { title: 'Inventory loaded' },
        'info',
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: `read backup ${backup.name}`, raw: message, ok: false }, { title: 'Could not read backup', body: message }, 'err')
    } finally {
      setLoading(false)
    }
  }, [report])

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Resolution only depends on the def/paint/music triples, not on names or
  // positions, so name edits do not refetch the schema.
  const signature = useMemo(() => items.map(itemKey).sort().join('|'), [items])

  useEffect(() => {
    if (items.length === 0) {
      setCatalog(new Map())
      setResolving(false)
      return undefined
    }
    let cancelled = false
    setResolving(true)
    void resolveInventory(items, schema.weapons)
      .then((map) => { if (!cancelled) setCatalog(map) })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, schema.weapons])

  const save = useCallback(async () => {
    setSaving(true)
    setError('')
    try {
      const response = await api('/api/inventory/save', {
        method: 'POST',
        body: JSON.stringify({ path, items, default_equips: defaultEquips }),
      })
      if (!response.ok) throw new Error(String(response.error || 'save failed'))
      report(
        { kind: 'save', label: `inventory saved · ${items.length} items`, ok: true, detail: `${response.path} (timestamped .bak written)` },
        { title: 'Inventory saved' },
        'ok',
      )
      await load(path)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      report({ kind: 'error', label: 'save inventory.txt', raw: message, ok: false }, { title: 'Save failed', body: message }, 'err')
    } finally {
      setSaving(false)
    }
  }, [items, defaultEquips, path, report, load])

  const updateAttribute = (id: number, key: string, value: string | null) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item
      const attributes = { ...item.attributes }
      if (value == null || value === '') delete attributes[key]
      else attributes[key] = value
      return { ...item, attributes }
    }))
    setDirty(true)
  }

  const updateName = (id: number, value: string) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item
      const attributes = { ...item.attributes }
      if (value.trim() === '') delete attributes['111']
      else attributes['111'] = value
      const next: InvItem = { ...item, attributes }
      // Keep the item-level field in sync only when the file already used it.
      if (item.custom_name != null) {
        if (value.trim() === '') delete next.custom_name
        else next.custom_name = value
      }
      return next
    }))
    setDirty(true)
  }

  const updatePosition = (id: number, value: number) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, inventory: value } : item)))
    setDirty(true)
  }

  const stageDelete = (item: InvItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    setDirty(true)
    report(
      { kind: 'info', label: `staged removal of item ${item.id}`, detail: `def ${item.def_index} · not written until save` },
      { title: `Item ${item.id} removed from the editor`, body: 'Nothing is written to inventory.txt until you save' },
      'info',
    )
    setConfirm(null)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelection = () => {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  const stageBulkDelete = (targets: InvItem[]) => {
    const ids = new Set(targets.map((item) => item.id))
    setItems((current) => current.filter((item) => !ids.has(item.id)))
    setDirty(true)
    report(
      { kind: 'info', label: `staged removal of ${ids.size} items`, detail: 'not written until save' },
      { title: `${ids.size} items removed from the editor`, body: 'Nothing is written to inventory.txt until you save' },
      'info',
    )
    setConfirm(null)
    exitSelection()
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const resolved = catalog.get(itemKey(item))
      if (kind !== 'all' && galleryKindOf(item, resolved) !== kind) return false
      if (rarity && resolved?.rarity?.name !== rarity) return false
      if (quality === 'stattrak' && item.quality !== 9) return false
      if (quality === 'souvenir' && item.quality !== 12) return false
      if (quality === 'normal' && (item.quality === 9 || item.quality === 12)) return false
      if (!needle) return true
      return String(item.id).includes(needle)
        || String(item.def_index).includes(needle)
        || itemNameTag(item).toLowerCase().includes(needle)
        || (resolved?.name ?? '').toLowerCase().includes(needle)
    })
  }, [items, query, catalog, kind, rarity, quality])

  const rarities = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      const entry = catalog.get(itemKey(item))?.rarity
      if (entry?.name && !map.has(entry.name)) map.set(entry.name, entry.color)
    }
    return [...map].map(([name, color]) => ({ name, color }))
  }, [items, catalog])

  const activeFilters =
    Number(query.trim().length > 0) +
    Number(kind !== 'all') +
    Number(rarity !== '') +
    Number(quality !== 'all')

  const resetFilters = () => {
    setQuery('')
    setKind('all')
    setRarity('')
    setQuality('all')
  }

  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'def-asc') list.sort((a, b) => a.def_index - b.def_index || a.id - b.id)
    else if (sort === 'def-desc') list.sort((a, b) => b.def_index - a.def_index || a.id - b.id)
    else if (sort === 'added-desc') list.sort((a, b) => b.id - a.id)
    else list.sort((a, b) => a.id - b.id)
    return list
  }, [filtered, sort])

  const shown = sorted.slice(0, ROW_CAP)

  const cards = useMemo<CardItem[]>(() => shown.map((item) => {
    const resolved = catalog.get(itemKey(item))
    const nameTag = itemNameTag(item)
    return {
      id: item.id,
      name: nameTag ? `“${nameTag}”` : resolved?.name || `Item def ${item.def_index}`,
      named: Boolean(nameTag),
      image: resolved?.image ?? null,
      accent: resolved?.rarity?.color,
      meta: resolved?.case ?? undefined,
      badge: item.quality === 9
        ? { label: 'StatTrak', tone: 'st' }
        : item.quality === 12
          ? { label: 'Souvenir', tone: 'sv' }
          : null,
      fallback: String(item.def_index),
    }
  }), [shown, catalog])

  const pathParts = useMemo(() => {
    const value = path.trim()
    if (!value) return { file: settings?.inventoryTxt ?? 'auto-detected path', dir: '' }
    const cut = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'))
    return cut < 0 ? { file: value, dir: '' } : { file: value.slice(cut + 1), dir: value.slice(0, cut) }
  }, [path, settings?.inventoryTxt])

  const selected = items.find((item) => item.id === selectedId) ?? null
  const selectedResolved = selected ? catalog.get(itemKey(selected)) : undefined
  const showSkeletons = (loading && items.length === 0)
    || (resolving && catalog.size === 0 && items.length > 0)

  const filterState: FilterState = {
    query,
    onQuery: setQuery,
    queryPlaceholder: 'search inventory',
    showSearch: true,
    rarities,
    rarity,
    onRarity: setRarity,
    showQuality: true,
    quality,
    onQuality: setQuality,
    onReset: resetFilters,
    activeFilters,
    resultLabel: `${sorted.length} item${sorted.length === 1 ? '' : 's'}`,
    ready: !loading && !resolving,
  }

  return (
    <>
      <CategoryBar
        label="Inventory categories"
        tabs={BROWSE_TABS}
        value={kind}
        onChange={(id) => setKind(id as GalleryKind)}
      />

      <main className="page-shell pb-16 pt-7">
      <div className="panel">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-foreground" title={path || settings?.inventoryTxt || ''}>{pathParts.file}</span>
              {pathParts.dir && <span className="truncate text-[11px] text-muted-foreground" title={pathParts.dir}>{pathParts.dir}</span>}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {loading ? 'Reading inventory.txt…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
              {' · '}
              {dirty ? <span className="text-[#ffd740]">unsaved edits</span> : 'in sync with disk'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditPath((value) => !value)} aria-expanded={editPath}>
              <FolderOpen className="size-3.5" />{editPath ? 'Hide path' : 'Change path'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { if (dirty) setConfirm({ type: 'reload' }); else void load(path) }} disabled={loading || saving}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Reload
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void openBackups()} disabled={loading || saving}>
              <History className="size-3.5" />Backups
            </Button>
            {dirty && <span className="chip chip-warn">Unsaved</span>}
            <Button
              size="sm"
              onClick={() => { if (items.length === 0) setConfirm({ type: 'empty-save' }); else void save() }}
              disabled={!dirty || loading || saving}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {saving ? 'Saving…' : 'Save + backup'}
            </Button>
          </div>
        </div>

        {editPath && (
          <div className="mt-3">
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder={settings?.inventoryTxt ?? 'path to inventory.txt (blank = auto-detect)'}
              aria-label="Path to inventory.txt"
              className="h-9 font-mono text-xs"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Reload reads this path. Blank means auto-detect.
            </p>
          </div>
        )}

        {error && <div className="log-surface err mt-3">{error}</div>}

        {warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#ffb300]/25 bg-[#ffb300]/[.06] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#ffd740]">
              <TriangleAlert className="size-3.5" />{warnings.length} validation warning{warnings.length === 1 ? '' : 's'} from the parser
            </p>
            <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#ffd740]/75">
              {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
            <p className="mt-1.5 text-[11px] text-[#ffd740]/50">Warnings are advisory; the file can still be saved.</p>
          </div>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="mt-4">
          <ItemGrid items={[]} view={view} loading onOpen={() => undefined} />
        </div>
      ) : error && items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<CircleAlert className="size-6" />}
            title="Could not read inventory.txt"
            action={<Button variant="secondary" onClick={() => void load(path)}><RotateCcw className="size-4" />Retry</Button>}
          >{error}</EmptyState>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title="No items in inventory.txt"
            action={<Button variant="secondary" onClick={() => void load(path)}><RotateCcw className="size-4" />Reload</Button>}
          >
            Give an item from the Live catalog, then reload here. Saving with no items writes an empty items block and
            still creates a backup.
          </EmptyState>
        </div>
      ) : (
        <div className="workspace mt-6">
          <FilterSidebar state={filterState} />
          <div className="min-w-0">
            <div className="results-toolbar flex-wrap">
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileFilters(true)}>
                  <SlidersHorizontal className="size-3.5" />Filters
                </Button>
                <div className="min-w-0 text-[11px] text-muted-foreground">
                  Showing <b className="font-medium text-foreground/75">{shown.length}</b> of {sorted.length} item{sorted.length === 1 ? '' : 's'}
                  {sorted.length > ROW_CAP && <span> (cap {ROW_CAP})</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={sort} onValueChange={(value) => setSort(value as SortOrder)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Sort items"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORTS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex shrink-0 rounded-lg border border-white/[.075] bg-white/[.035] p-0.5">
                  <button onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} className={cn('view-button', view === 'grid' && 'active')}><Grid2X2 /></button>
                  <button onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'} className={cn('view-button', view === 'list' && 'active')}><List /></button>
                </div>
                {!selecting && (
                  <Button variant="secondary" size="sm" onClick={() => setSelecting(true)}>
                    <SquareDashedMousePointer className="size-3.5" />Select
                  </Button>
                )}
              </div>
            </div>

          {selecting && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[.055] px-3 py-2">
              <span className="text-[11px] font-medium text-foreground">{selectedIds.size} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set(sorted.map((item) => item.id)))}>
                Select all {sorted.length}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>
                Clear
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => setConfirm({ type: 'bulk-delete', items: items.filter((item) => selectedIds.has(item.id)) })}
                >
                  <Trash2 className="size-3.5" />Delete{selectedIds.size > 0 ? ` ${selectedIds.size}` : ''}
                </Button>
                <Button variant="secondary" size="sm" onClick={exitSelection}>
                  <X className="size-3.5" />Done
                </Button>
              </div>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="mt-6 text-center text-[11px] text-muted-foreground">No items match that filter.</p>
          ) : (
            <ItemGrid
              items={cards}
              view={view}
              loading={showSkeletons}
              onOpen={(card) => {
                if (selecting) toggleSelect(Number(card.id))
                else setSelectedId(Number(card.id))
              }}
              onSelect={(card) => toggleSelect(Number(card.id))}
              selectable={selecting}
              selectedIds={selectedIds}
              actionLabel="Edit"
            />
          )}

          <div className="mt-3 flex flex-wrap items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Database className="mt-0.5 size-3 shrink-0" />
            <span>
              Attribute ids: 6 paint, 7 seed, 8 wear, 80 StatTrak, 113–136 stickers, 137–140/223 tournament fields.
              Deletions are staged until Save + backup; complete item objects are sent so unknown keys survive.
            </span>
          </div>
          </div>
        </div>
      )}

      {selected && (
        <InventoryItemDialog
          item={selected}
          resolved={selectedResolved}
          onClose={() => setSelectedId(null)}
          onName={(value) => updateName(selected.id, value)}
          onAttr={(key, value) => updateAttribute(selected.id, key, value)}
          onPosition={(value) => updatePosition(selected.id, value)}
          onDelete={() => {
            setSelectedId(null)
            setConfirm({ type: 'delete', item: selected })
          }}
        />
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {confirm?.type === 'delete'
              ? 'Remove item from the editor?'
              : confirm?.type === 'bulk-delete'
                ? `Remove ${confirm.items.length} item${confirm.items.length === 1 ? '' : 's'} from the editor?`
                : confirm?.type === 'reload'
                  ? 'Discard unsaved edits and reload?'
                  : confirm?.type === 'restore'
                    ? 'Load this backup into the editor?'
                    : 'Save an empty inventory?'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            {confirm?.type === 'delete' && confirm.item ? (
              <>
                Item <span className="font-mono text-foreground/80">{confirm.item.id}</span> (def{' '}
                <span className="font-mono text-foreground/80">{confirm.item.def_index}</span>) will disappear from this view.
                Nothing is written to <span className="font-mono">inventory.txt</span> until you press Save + backup.
              </>
            ) : confirm?.type === 'bulk-delete' ? (
              <>
                {confirm.items.length} item{confirm.items.length === 1 ? '' : 's'} will disappear from this view:{' '}
                <span className="font-mono text-foreground/80">
                  {confirm.items.slice(0, 12).map((item) => item.id).join(', ')}
                  {confirm.items.length > 12 ? ` +${confirm.items.length - 12} more` : ''}
                </span>.
                Nothing is written to <span className="font-mono">inventory.txt</span> until you press Save + backup.
              </>
            ) : confirm?.type === 'reload' ? (
              <>
                Reloading reads <span className="font-mono">inventory.txt</span> again. Unsaved attribute and name edits
                will be lost, and no backup is written for edits that were never saved.
              </>
            ) : confirm?.type === 'restore' ? (
              <>
                <span className="font-mono text-foreground/80">{confirm.backup.name}</span> (
                {confirm.backup.count == null ? 'unknown item count' : `${confirm.backup.count} item${confirm.backup.count === 1 ? '' : 's'}`},{' '}
                {backupTime(confirm.backup.time)}) replaces the items in the editor. Nothing is written to{' '}
                <span className="font-mono">inventory.txt</span> until you press Save + backup, and the current file is
                copied aside first.
              </>
            ) : (
              <>
                The items list is empty. Saving now writes an empty <span className="font-mono">items</span> block and keeps only
                the preserved sections. A timestamped backup is still created first.
              </>
            )}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm?.type === 'delete' && confirm.item && (
              <Button variant="danger" onClick={() => stageDelete(confirm.item)}>
                <Trash2 className="size-4" />Remove from editor
              </Button>
            )}
            {confirm?.type === 'bulk-delete' && (
              <Button variant="danger" onClick={() => stageBulkDelete(confirm.items)}>
                <Trash2 className="size-4" />Remove {confirm.items.length} item{confirm.items.length === 1 ? '' : 's'}
              </Button>
            )}
            {confirm?.type === 'reload' && (
              <Button variant="danger" onClick={() => { setConfirm(null); void load(path) }}>
                <RotateCcw className="size-4" />Discard and reload
              </Button>
            )}
            {confirm?.type === 'restore' && (
              <Button onClick={() => void restoreBackup(confirm.backup)}>
                <History className="size-4" />Load backup
              </Button>
            )}
            {confirm?.type === 'empty-save' && (
              <Button variant="danger" onClick={() => { setConfirm(null); void save() }}>
                <Save className="size-4" />Save empty inventory
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupsOpen} onOpenChange={setBackupsOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Inventory backups</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Timestamped copies written next to inventory.txt before every save.
          </DialogDescription>
          {backupsLoading ? (
            <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />Reading backups…
            </p>
          ) : backupsError ? (
            <p className="mt-4 text-[11px] text-[#e57373]">{backupsError}</p>
          ) : backups.length === 0 ? (
            <p className="mt-4 text-[11px] text-muted-foreground">No backups yet — saving creates the first one.</p>
          ) : (
            <ul className="mt-4 max-h-[320px] space-y-1 overflow-y-auto">
              {backups.map((backup) => (
                <li key={backup.name} className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-foreground" title={backup.name}>{backup.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {backup.count == null ? 'unreadable backup' : `${backup.count} item${backup.count === 1 ? '' : 's'}`}
                      {' · '}
                      <time dateTime={backup.time}>{backupTime(backup.time)}</time>
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setConfirm({ type: 'restore', backup })}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Backups are written next to the file as <span className="font-mono">inventory.txt.&lt;iso-timestamp&gt;.bak</span>.
      </p>
      </main>

      <MobileFilters open={mobileFilters} onOpenChange={setMobileFilters} state={filterState} />
    </>
  )
}
