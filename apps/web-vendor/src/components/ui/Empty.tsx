import type { LucideIcon } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface EmptyProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Empty({ icon: Icon, title, description, action }: EmptyProps) {
  return (
    <GlassCard padding="xl" className="text-center">
      {Icon && (
        <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-slate-900/5 border border-slate-900/10 mb-5">
          <Icon className="w-8 h-8 text-slate-900/45" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="heading-font text-2xl font-semibold mb-2">{title}</h3>
      {description && <p className="text-slate-900/60 max-w-md mx-auto text-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </GlassCard>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <GlassCard padding="xl" className="text-center">
      <div className="inline-block w-8 h-8 rounded-full border-2 border-electric-500/30 border-t-electric-500 animate-spin mb-3" />
      <p className="text-sm text-slate-900/60">{label}</p>
    </GlassCard>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-rose-400/40 bg-rose-50 px-6 py-4 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-emerald-400/40 bg-emerald-50 px-6 py-4 text-sm text-emerald-700">
      {message}
    </div>
  );
}
