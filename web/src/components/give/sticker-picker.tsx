import { useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { api } from '../../lib/api'
import type { CategoryItem } from '../../lib/catalog'
import { categoryImage, getImageGame } from '../../lib/catalog'
import { Input } from '../ui/input'
import { SafeImage } from '../common/safe-image'

type StickerPickerProps = {
  slot: number
  value: string
  onPick: (id: string) => void
  onClear: () => void
  onClose: () => void
}

const MIN_QUERY = 2
const LIMIT = 100
const RENDERED = 60

/**
 * Server-side sticker search. The catalogue has 11k+ rows, so this requires a
 * query, debounces it, and asks for at most 100 rows per request.
 */
export function StickerPicker({ slot, value, onPick, onClear, onClose }: StickerPickerProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < MIN_QUERY) {
      setItems([])
      setError('')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    const timer = window.setTimeout(async () => {
      try {
        const response = await api(`/api/schema/category/stickers?limit=${LIMIT}&q=${encodeURIComponent(needle)}&game=${getImageGame()}`)
        if (cancelled) return
        if (response.error) throw new Error(String(response.error))
        setItems(Array.isArray(response.items) ? response.items : [])
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query])

  return (
    <div className="sticker-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Sticker slot {slot + 1}</span>
        <div className="flex items-center gap-1">
          {value && <button onClick={onClear} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-white">clear</button>}
          <button onClick={onClose} aria-label="Close sticker search" className="rounded p-1 text-muted-foreground hover:text-white"><X className="size-3.5" /></button>
        </div>
      </div>

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`search ${'11k+'} stickers`}
          aria-label="Search stickers"
          className="h-8 pl-8 text-xs"
          autoFocus
        />
      </div>

      <div className="sticker-options">
        {loading && <p className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />searching stickers…</p>}
        {!loading && error && <p className="px-1 py-2 text-[11px] text-err-soft">{error}</p>}
        {!loading && !error && query.trim().length < MIN_QUERY && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">Type at least {MIN_QUERY} characters to search.</p>
        )}
        {!loading && !error && query.trim().length >= MIN_QUERY && items.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">No stickers match that search.</p>
        )}
        {!loading && items.slice(0, RENDERED).map((item) => (
          <button
            key={item.def_index}
            className="sticker-option"
            onClick={() => onPick(String(item.def_index))}
          >
            <SafeImage
              src={categoryImage('stickers', item.def_index, getImageGame())}
              alt={item.name}
              fallbackClassName="sticker-fallback"
              fallback={String(item.def_index)}
            />
            <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{item.def_index}</span>
          </button>
        ))}
      </div>

      {items.length >= LIMIT && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Showing the first {Math.min(RENDERED, LIMIT)} of {LIMIT}+ matches (server cap). Narrow the query for more precision.
        </p>
      )}
    </div>
  )
}
