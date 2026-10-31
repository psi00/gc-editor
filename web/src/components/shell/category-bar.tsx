import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type CategoryTab = { id: string; label: string }

/**
 * One left-aligned, content-width category bar shared by Live and Gallery. Tabs
 * keep their position between modes; a trailing action (Manual entry) sits
 * outside the peer row so it cannot shift the tabs.
 */
export function CategoryBar({ label, tabs, value, onChange, trailing }: {
  label: string
  tabs: CategoryTab[]
  value: string
  onChange: (id: string) => void
  trailing?: ReactNode
}) {
  return (
    <div className="category-bar">
      <div className="page-shell flex items-center gap-2 px-2 py-1.5">
        <nav className="no-scrollbar flex min-w-0 gap-0.5 overflow-x-auto" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn('category-link', value === tab.id && 'active')}
              aria-current={value === tab.id ? 'page' : undefined}
              data-category={tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {trailing && <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
    </div>
  )
}
