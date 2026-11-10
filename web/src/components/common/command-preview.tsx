import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The exact RCON command line, with a copy affordance. This is the one place
 * where the wire format is shown verbatim, so it is also the one place worth
 * copying out of. Until the server has answered, it shows a placeholder rather
 * than a locally-rebuilt guess: two different lines for one selection is worse
 * than a beat of waiting.
 */
export function CommandPreview({ command, className, placeholder = 'building the command…' }: {
  command: string
  className?: string
  placeholder?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  const empty = command.trim() === ''

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const copy = useCallback(() => {
    if (empty || !navigator.clipboard) return
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    }).catch(() => setCopied(false))
  }, [command, empty])

  return (
    <div className={cn('command-preview', className)}>
      <pre className={cn('log-surface', empty && 'text-muted-foreground')}>{empty ? placeholder : command}</pre>
      {!empty && (
        <button
          type="button"
          className="command-copy"
          onClick={copy}
          aria-label={copied ? 'Command copied' : 'Copy command'}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
    </div>
  )
}
