import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { SafeImage } from '../common/safe-image'
import { cn } from '../../lib/utils'

export type CardItem = {
  id: string | number
  name: string
  image?: string | null
  accent?: string
  /** one short line under the title: case name, quality, artist */
  meta?: string
  badge?: { label: string; tone: 'st' | 'sv' } | null
  fallback?: string
  /** a custom name tag renders the title in quotes and italics */
  named?: boolean
}

type ItemCardProps = {
  item: CardItem
  view: 'grid' | 'list'
  onOpen: () => void
  actionLabel?: string
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
}

/**
 * One card chassis for every category: art first, then title and one short meta
 * line. Art is first so every card's art box is identical whatever the copy
 * length. The whole card is a single control; a transparent hit target covers
 * it so the art and text are not separate tab stops.
 */
export function ItemCard({
  item, view, onOpen, actionLabel = 'Configure', selectable, selected, onSelect,
}: ItemCardProps) {
  const accent = item.accent || '#6d7486'
  const label = selectable
    ? `${selected ? 'Deselect' : 'Select'} ${item.name}`
    : `${actionLabel} ${item.name}`

  return (
    <article
      className={cn('item-card', view === 'list' && 'item-card-list', selected && 'is-selected')}
      style={{ '--accent': accent } as CSSProperties}
    >
      <button className="card-hit" onClick={onOpen} aria-label={label} />

      <div className="item-art">
        <SafeImage src={item.image} alt="" className="item-image" fallback={item.fallback} />
        {item.badge && (
          <span className={cn('item-badge absolute left-3 top-3', item.badge.tone === 'st' && 'st', item.badge.tone === 'sv' && 'sv')}>
            {item.badge.label}
          </span>
        )}
      </div>

      <div className="item-head">
        <span className={cn('item-title', item.named && 'italic')} title={item.name}>{item.name}</span>
        {item.meta && <p className="item-subtitle" title={item.meta}>{item.meta}</p>}
      </div>

      {selectable && (
        <button
          className={cn('item-select', selected && 'on')}
          onClick={onSelect}
          aria-pressed={!!selected}
          aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
        >
          {selected && <Check className="size-3.5" />}
        </button>
      )}

      <span className="rarity-spine" aria-hidden />
    </article>
  )
}

export function CardSkeleton({ view }: { view: 'grid' | 'list' }) {
  return (
    <div className={cn('skeleton', view === 'list' && 'skeleton-list')} aria-hidden>
      <div className="skeleton-art" />
      <div className="py-3">
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
    </div>
  )
}
