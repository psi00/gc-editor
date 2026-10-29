import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ToastTone = 'ok' | 'err' | 'info'

type ToastItem = { id: number; title: string; body?: string; tone: ToastTone }
type ToastContextValue = { toast: (item: { title: string; body?: string; tone?: ToastTone }) => void }

const ToastContext = createContext<ToastContextValue | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(({ title, body, tone = 'ok' }: { title: string; body?: string; tone?: ToastTone }) => {
    const id = nextId++
    setItems((current) => [...current.slice(-2), { id, title, body, tone }])
    const timer = window.setTimeout(() => dismiss(id), 4500)
    timers.current.push(timer)
  }, [dismiss])

  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)) }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 && (
        <div className="toast" aria-live="polite">
          {items.map((item) => (
            <div key={item.id} className={cn('toast-item', item.tone === 'err' && 'err', item.tone === 'ok' && 'ok')} role="status">
              <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', item.tone === 'err' ? 'bg-[#f44336]/15 text-[#ff8a80]' : item.tone === 'info' ? 'bg-white/10 text-white/70' : 'bg-primary/15 text-primary')}>
                {item.tone === 'err' ? <CircleAlert className="size-3.5" /> : item.tone === 'info' ? <Info className="size-3.5" /> : <Check className="size-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{item.title}</span>
                {item.body && <span className="mt-0.5 block break-words font-mono text-[11px] leading-relaxed text-white/55">{item.body}</span>}
              </span>
              <button onClick={() => dismiss(item.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-muted-foreground hover:text-white">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
