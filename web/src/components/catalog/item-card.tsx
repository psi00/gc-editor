import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { SafeImage } from '../common/safe-image'
import { cn } from '../../lib/utils'

export type CardItem = {
  id: string | number
  name: string
  image?: string | null
  accent?: string
  /** short meta segments, joined with a middle dot */
  meta: string[]
  badge?: { label: string; tone: 'st' | 'sv' } | null
  footer?: string
  fallback?: string
  /** name tag text, shown as a distinct line under the title */
  nameTag?: string
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

export function ItemCard({
  item, view, onOpen, actionLabel = 'Configure', selectable, selected, onSelect,
}: ItemCardProps) {
  const accent = item.accent || '#5e7bff'

  return (
    <article
      className={cn('item-card', view === 'list' && 'item-card-list', selected && 'is-selected')}
      style={{ '--accent': accent } as CSSProperties}
    >
      <div className="item-art">
        <button className="item-image-button" onClick={onOpen} aria-label={selectable ? `${selected ? 'Deselect' : 'Select'} ${item.name}` : `${actionLabel} ${item.name}`}>
          <SafeImage
            src={item.image}
            alt={item.name}
            className="item-image"
            fallback={item.fallback}
          />
        </button>
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
        {item.badge && (
          <span className={cn('item-badge absolute left-3 top-3', item.badge.tone === 'st' && 'st', item.badge.tone === 'sv' && 'sv')}>
            {item.badge.label}
          </span>
        )}
        {!selectable && <span className="card-action" aria-hidden>{actionLabel}</span>}
      </div>

      <div className="item-body">
        <button className="item-title" onClick={onOpen}>{item.name}</button>
        {item.nameTag && <p className="item-nametag" title={item.nameTag}>“{item.nameTag}”</p>}
        <p className="item-subtitle">
          {item.meta.map((part, index) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden>·</span>}
              {part}
            </span>
          ))}
        </p>
        <div className="item-footer">
          <span className="truncate font-mono">{item.footer ?? ''}</span>
        </div>
      </div>

      <span className="rarity-spine" aria-hidden />
    </article>
  )
}

export function CardSkeleton({ view }: { view: 'grid' | 'list' }) {
  return (
    <div className={cn('skeleton', view === 'list' && 'item-card-list')} aria-hidden>
      <div className="skeleton-art" />
      <div className="py-3">
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
    </div>
  )
}
