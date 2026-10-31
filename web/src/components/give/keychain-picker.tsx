import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { api } from '../../lib/api'
import type { CategoryItem } from '../../lib/catalog'
import { categoryImage } from '../../lib/catalog'
import { Input } from '../ui/input'
import { SafeImage } from '../common/safe-image'

type KeychainPickerProps = {
  value: string
  onPick: (id: string) => void
  onClear: () => void
  onClose: () => void
}

const LIMIT = 500

/**
 * CS2 charms. Keychain ids are not item def_indexes, so this reads the keychain
 * catalogue directly and the id is written to attribute 299 on the weapon.
 */
export function KeychainPicker({ value, onPick, onClear, onClose }: KeychainPickerProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api(`/api/schema/category/keychains?limit=${LIMIT}&game=cs2`)
      .then((response) => {
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        setItems(Array.isArray(response.items) ? response.items : [])
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.name.toLowerCase().includes(needle) || String(item.def_index).includes(needle))
  }, [items, query])

  return (
    <div className="sticker-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Charm</span>
        <div className="flex items-center gap-1">
          {value && <button onClick={onClear} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-white">clear</button>}
          <button onClick={onClose} aria-label="Close charm search" className="rounded p-1 text-muted-foreground hover:text-white"><X className="size-3.5" /></button>
        </div>
      </div>

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search charms"
          aria-label="Search charms"
          className="h-8 pl-8 text-xs"
          autoFocus
        />
      </div>

      <div className="sticker-options">
        {loading && <p className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />loading charms…</p>}
        {!loading && error && <p className="px-1 py-2 text-[11px] text-err-soft">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">No charms match that search.</p>
        )}
        {!loading && filtered.map((item) => (
          <button
            key={item.def_index}
            className="sticker-option"
            onClick={() => onPick(String(item.def_index))}
          >
            <SafeImage
              src={categoryImage('keychains', item.def_index, 'cs2')}
              alt={item.name}
              fallbackClassName="sticker-fallback"
              fallback={String(item.def_index)}
            />
            <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{item.def_index}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
