import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ActivityKind = 'rcon' | 'give' | 'save' | 'inventory' | 'schema' | 'settings' | 'error' | 'info'

export type ActivityEntry = {
  id: number
  at: string
  kind: ActivityKind
  label: string
  raw?: string
  ok?: boolean
  detail?: string
}

type NewEntry = Omit<ActivityEntry, 'id' | 'at'>
type ActivityContextValue = {
  entries: ActivityEntry[]
  log: (entry: NewEntry) => void
  clear: () => void
}

const ActivityContext = createContext<ActivityContextValue | null>(null)
const MAX_ENTRIES = 400
let nextId = 1

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  const log = useCallback((entry: NewEntry) => {
    setEntries((current) => [{ ...entry, id: nextId++, at: new Date().toISOString() }, ...current].slice(0, MAX_ENTRIES))
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  const value = useMemo(() => ({ entries, log, clear }), [entries, log, clear])
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity() {
  const value = useContext(ActivityContext)
  if (!value) throw new Error('useActivity must be used inside ActivityProvider')
  return value
}
