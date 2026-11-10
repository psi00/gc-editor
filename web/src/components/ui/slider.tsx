import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../../lib/utils'

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  /** Per-thumb accessible names. A single-value slider should name its value. */
  thumbLabels?: string[]
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, thumbLabels, ...props }, ref) => {
  const thumbs = props.value?.length ?? props.defaultValue?.length ?? 1
  // the caller's aria-label belongs to the control, not to a "minimum" thumb
  const controlLabel = props['aria-label']
  return (
    <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-edge/10">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }).map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          className="block size-3.5 rounded-full border-[3px] border-primary bg-card-hover shadow-[0_0_0_3px_hsl(var(--primary)/.2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={thumbLabels?.[index] ?? controlLabel ?? (index === 0 ? 'Minimum' : 'Maximum')}
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = 'Slider'
