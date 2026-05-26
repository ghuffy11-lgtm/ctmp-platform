import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'electric' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const SIZE: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs rounded-2xl',
  md: 'px-6 py-3 text-sm rounded-2xl',
  lg: 'px-8 py-4 text-sm rounded-3xl',
  xl: 'px-8 py-6 text-base rounded-3xl',
};

const VARIANT: Record<Variant, string> = {
  electric: 'btn-electric',
  ghost: 'btn-ghost',
  danger:
    'bg-danger/15 border border-danger/50 text-danger hover:bg-danger/25 transition-colors disabled:opacity-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'electric', size = 'md', fullWidth, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold tracking-wide whitespace-nowrap',
        SIZE[size],
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
