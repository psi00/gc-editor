import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

function initials(text: string) {
  const cleaned = text.replace(/^stattrak[™\s]*/i, '').replace(/^souvenir\s*/i, '').replace(/^[★\s]+/, '').trim()
  const letters = cleaned.replace(/[^a-z0-9]/gi, '')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

type SafeImageProps = {
  /** Local `/imgs/*` URL. A missing file is expected and never fatal. */
  src?: string | null
  alt: string
  className?: string
  /** Text shown when the image is missing or fails to load. */
  fallback?: string
  fallbackClassName?: string
  eager?: boolean
}

/**
 * Single image component with fallback for every local asset. Replaces the
 * previous per-component error handling; 404s render a placeholder instead of
 * breaking the card or dialog.
 */
export function SafeImage({ src, alt, className, fallback, fallbackClassName, eager }: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [src])

  if (!src || failed) {
    return (
      <span className={cn(fallbackClassName ?? 'art-fallback')} role="img" aria-label={alt}>
        {fallback ?? initials(alt)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
