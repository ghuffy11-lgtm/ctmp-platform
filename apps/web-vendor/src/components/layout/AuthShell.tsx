import Link from 'next/link';
import { cn } from '@/lib/cn';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  /** Wider container (e.g. for the registration form). */
  wide?: boolean;
}

export function AuthShell({ title, subtitle, children, className, wide }: AuthShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className={cn('w-full', wide ? 'max-w-3xl' : 'max-w-md')}>
        <Link href="/login" className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-electric-500 rounded-2xl flex items-center justify-center text-[#0A1428] font-bold text-2xl leading-none">
            V
          </div>
          <div className="heading-font tracking-tighter leading-none">
            <div className="text-2xl font-semibold">VENDOR</div>
            <div className="text-electric-500 text-[10px] tracking-[4px] font-medium mt-0.5">CONNECT</div>
          </div>
        </Link>
        <div className={cn('glass rounded-3xl p-10', className)}>
          <div className="text-center mb-8">
            <h1 className="heading-font text-3xl font-semibold tracking-tighter">{title}</h1>
            {subtitle && <p className="text-slate-900/60 text-sm mt-2">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
