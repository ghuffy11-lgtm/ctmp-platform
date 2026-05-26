import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'strong' | 'subtle';
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'xl' | 'none';
}

const PADDING: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  xl: 'p-10',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, variant = 'default', hover = false, padding = 'lg', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        variant === 'strong' ? 'glass-strong' : variant === 'subtle' ? 'glass-subtle' : 'glass',
        'rounded-3xl',
        PADDING[padding],
        hover && 'card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
