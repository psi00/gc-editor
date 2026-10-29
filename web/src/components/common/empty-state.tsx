import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, children, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      {children && <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  )
}
