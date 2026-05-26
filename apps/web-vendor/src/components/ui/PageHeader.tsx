import { cn } from '@/lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-6', className)}>
      <div>
        <h1 className="heading-font text-4xl md:text-5xl font-semibold tracking-tighter">{title}</h1>
        {subtitle && <p className="text-slate-900/60 mt-2 text-sm md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
