import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The exact RCON command line, with a copy affordance. This is the one place
 * where the wire format is shown verbatim, so it is also the one place worth
 * copying out of.
 */
export function CommandPreview({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const copy = useCallback(() => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    }).catch(() => setCopied(false))
  }, [command])

  return (
    <div className={cn('command-preview', className)}>
      <pre className="log-surface">{command}</pre>
      <button
        type="button"
        className="command-copy"
        onClick={copy}
        aria-label={copied ? 'Command copied' : 'Copy command'}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
