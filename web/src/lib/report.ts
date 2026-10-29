import { useCallback } from 'react'
import { useActivity, type ActivityEntry } from './activity'
import { useToast, type ToastTone } from '../components/common/status-toast'

type EntryInput = Omit<ActivityEntry, 'id' | 'at'>
type ToastInput = { title: string; body?: string } | null

/**
 * One call logs the durable activity entry and optionally raises the
 * short-lived toast. Password material must never be passed in here.
 */
export function useReport() {
  const { log } = useActivity()
  const { toast } = useToast()

  return useCallback(
    (entry: EntryInput, toastItem: ToastInput = null, tone?: ToastTone) => {
      log(entry)
      if (toastItem) {
        toast({
          title: toastItem.title,
          body: toastItem.body,
          tone: tone ?? (entry.ok === false ? 'err' : 'ok'),
        })
      }
    },
    [log, toast],
  )
}
