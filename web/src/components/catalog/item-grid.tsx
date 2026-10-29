import { CardSkeleton, ItemCard, type CardItem } from './item-card'
import { cn } from '../../lib/utils'

type ItemGridProps = {
  items: CardItem[]
  view: 'grid' | 'list'
  loading?: boolean
  onOpen: (item: CardItem) => void
  skeletonCount?: number
  actionLabel?: string
  selectable?: boolean
  selectedIds?: Set<number>
  onSelect?: (item: CardItem) => void
}

export function ItemGrid({
  items, view, loading, onOpen, skeletonCount = 9, actionLabel, selectable, selectedIds, onSelect,
}: ItemGridProps) {
  if (loading) {
    return (
      <div className={cn(view === 'grid' ? 'item-grid' : 'space-y-3')} aria-busy="true" aria-label="Loading items">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <CardSkeleton key={index} view={view} />
        ))}
      </div>
    )
  }

  return (
    <div className={cn(view === 'grid' ? 'item-grid' : 'space-y-3')}>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          view={view}
          onOpen={() => onOpen(item)}
          actionLabel={actionLabel}
          selectable={selectable}
          selected={selectedIds?.has(Number(item.id))}
          onSelect={() => onSelect?.(item)}
        />
      ))}
    </div>
  )
}
