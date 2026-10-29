import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleAlert, Database, FolderOpen, Grid2X2, List, Loader2, RotateCcw, Save, SquareDashedMousePointer, Trash2, TriangleAlert, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { useReport } from '../lib/report'
import type { InvDefaultEquips, InvItem, InvResponse, SchemaState, SettingsInfo } from '../lib/app-types'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { EmptyState } from '../components/common/empty-state'
import { ItemGrid } from '../components/catalog/item-grid'
import type { CardItem } from '../components/catalog/item-card'
import { InventoryItemDialog } from '../components/inventory/inv-item-dialog'
import { itemKey, itemNameTag, itemPaint, resolveInventory, type ResolvedInventory } from '../lib/inventory-catalog'
import { rarityLabel } from '../lib/catalog'
import { cn } from '../lib/utils'

const ROW_CAP = 500
const INTEGER_ATTRS = new Set(['6', '7', '80'])

type Confirm =
  | { type: 'delete'; item: InvItem }
  | { type: 'bulk-delete'; items: InvItem[] }
  | { type: 'empty-save' }
  | { type: 'reload' }
  | null
type SortOrder = 'def-asc' | 'def-desc' | 'added-desc' | 'added-asc'

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
        { title: 'Inventory saved', body: '.bak copy written before the atomic replace' },
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
    if (!needle) return items
    return items.filter((item) => {
      const resolved = catalog.get(itemKey(item))
      return String(item.id).includes(needle)
        || String(item.def_index).includes(needle)
        || itemNameTag(item).toLowerCase().includes(needle)
        || (resolved?.name ?? '').toLowerCase().includes(needle)
    })
  }, [items, query, catalog])

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
    const paint = itemPaint(item)
    const nameTag = itemNameTag(item)
    return {
      id: item.id,
      name: resolved?.name ?? `Item def ${item.def_index}`,
      image: resolved?.image ?? null,
      accent: resolved?.rarity?.color,
      meta: [rarityLabel(resolved?.rarity?.name) ?? `def ${item.def_index}`],
      nameTag: nameTag || undefined,
      badge: item.quality === 9
        ? { label: 'StatTrak', tone: 'st' }
        : item.quality === 12
          ? { label: 'Souvenir', tone: 'sv' }
          : null,
      footer: `id ${item.id} · def ${item.def_index}${paint != null ? ` · paint ${paint}` : ''}`,
      fallback: String(item.def_index),
    }
  }), [shown, catalog])

  const equipCount = Object.keys(defaultEquips).length
  const selected = items.find((item) => item.id === selectedId) ?? null
  const selectedResolved = selected ? catalog.get(itemKey(selected)) : undefined
  const showSkeletons = (loading && items.length === 0)
    || (resolving && catalog.size === 0 && items.length > 0)

  return (
    <main className="page-shell pb-16 pt-7">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary">
          <FolderOpen className="size-3.5" />Offline editor
        </div>
        <h1 className="text-[30px] font-semibold tracking-[-.04em] sm:text-[34px]">inventory.txt</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Close the game before saving. Click an item to edit its wear, pattern, StatTrak, stickers, and name tag.
          Every save copies the file to a timestamped <span className="font-mono text-[12px] text-foreground/70">.bak</span> first,
          so unknown sections such as <span className="font-mono text-[12px] text-foreground/70">equipped_state</span> and
          <span className="font-mono text-[12px] text-foreground/70"> default_equips</span> survive.
          New items come from the Live catalog.
        </p>
      </div>

      <div className="panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={settings?.inventoryTxt ?? 'path to inventory.txt (blank = auto-detect)'}
            aria-label="Path to inventory.txt"
            className="h-9 flex-1 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { if (dirty) setConfirm({ type: 'reload' }); else void load(path) }} disabled={loading || saving}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Reload
            </Button>
            <Button
              size="sm"
              onClick={() => { if (items.length === 0) setConfirm({ type: 'empty-save' }); else void save() }}
              disabled={loading || saving}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {saving ? 'Saving…' : 'Save + backup'}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="chip max-w-full truncate" title={settings?.inventoryTxt ?? undefined}>
            auto path: {settings?.inventoryTxt ?? 'not resolved'}
          </span>
          <span className="chip">loaded {items.length}</span>
          <span className="chip">default_equips {equipCount}</span>
          {dirty && <span className="chip chip-warn">unsaved changes</span>}
          {!dirty && !loading && items.length > 0 && <span className="chip chip-ok">in sync with file</span>}
          {settings && !settings.inventoryExists && <span className="chip chip-err">inventory.txt not found</span>}
        </div>

        {error && <div className="log-surface err mt-3">{error}</div>}

        {warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-200">
              <TriangleAlert className="size-3.5" />{warnings.length} validation warning{warnings.length === 1 ? '' : 's'} from the parser
            </p>
            <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-relaxed text-amber-100/70">
              {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
            <p className="mt-1.5 text-[10px] text-amber-100/45">Warnings are advisory; the file can still be saved.</p>
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
        <div className="mt-4">
          <div className="results-toolbar flex-wrap">
            <div className="min-w-0 text-[11px] text-muted-foreground">
              Showing <b className="font-medium text-foreground/75">{shown.length}</b> of {sorted.length} item{sorted.length === 1 ? '' : 's'}
              {sorted.length > ROW_CAP && <span> (cap {ROW_CAP})</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="filter by name, id, or def"
                aria-label="Filter inventory items"
                data-search-input
                className="h-8 w-[190px] shrink-0 text-xs"
              />
              <label className="sr-only" htmlFor="inventory-sort">Sort items</label>
              <select
                id="inventory-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOrder)}
                className="h-8 shrink-0 rounded-lg border border-white/[.075] bg-white/[.035] px-2 text-xs text-foreground transition hover:bg-white/[.06]"
              >
                {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
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

          <div className="mt-3 flex flex-wrap items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
            <Database className="mt-0.5 size-3 shrink-0" />
            <span>
              Attribute ids: 6 paint, 7 seed, 8 wear, 80 StatTrak, 113–136 stickers, 137–140/223 tournament fields.
              Deletions are staged until Save + backup; complete item objects are sent so unknown keys survive.
            </span>
          </div>
          {dirty && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-200/80">
              <CircleAlert className="size-3" />Unsaved edits are not written until Save + backup. Reload asks before discarding.
            </p>
          )}
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
            {confirm?.type === 'empty-save' && (
              <Button variant="danger" onClick={() => { setConfirm(null); void save() }}>
                <Save className="size-4" />Save empty inventory
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        Backups are written next to the file as <span className="font-mono">inventory.txt.&lt;iso-timestamp&gt;.bak</span>.
      </p>
    </main>
  )
}
