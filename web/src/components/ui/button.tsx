import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[#4a94ff]',
        secondary: 'border border-white/[.07] bg-white/[.055] text-foreground hover:border-white/[.13] hover:bg-white/[.09]',
        ghost: 'text-muted-foreground hover:bg-white/[.055] hover:text-foreground',
        outline: 'border border-white/[.1] bg-transparent text-foreground hover:bg-white/[.05]',
        danger: 'border border-[#f44336]/40 bg-[#f44336]/10 text-[#ff8a80] hover:bg-[#f44336]/20',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-xl px-5',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
