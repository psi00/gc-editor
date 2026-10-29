import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../../lib/utils'

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const thumbs = props.value?.length ?? props.defaultValue?.length ?? 1
  return (
    <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }).map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          className="block size-3.5 rounded-full border-[3px] border-primary bg-[#23262d] shadow-[0_0_0_3px_rgba(35,123,255,.2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={index === 0 ? 'Minimum' : 'Maximum'}
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = 'Slider'
