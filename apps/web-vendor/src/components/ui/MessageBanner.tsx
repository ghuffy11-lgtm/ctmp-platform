'use client';

import Link from 'next/link';
import { Info, AlertTriangle, AlertCircle } from 'lucide-react';
import type { VendorMessage } from '@/lib/vendor-messages';

interface Props {
  message: VendorMessage;
  className?: string;
}

const SEVERITY_STYLES = {
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
    actionClass: 'text-blue-700 hover:text-blue-900',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    actionClass: 'text-amber-700 hover:text-amber-900',
  },
  danger: {
    container: 'bg-rose-50 border-rose-200 text-rose-900',
    icon: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    actionClass: 'text-rose-700 hover:text-rose-900',
  },
} as const;

export function MessageBanner({ message, className }: Props) {
  const style = SEVERITY_STYLES[message.severity];
  return (
    <div
      role="status"
      className={`flex gap-3 rounded-3xl border px-5 py-4 ${style.container} ${className ?? ''}`}
    >
      <div className="mt-0.5">{style.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{message.title}</p>
        <p className="text-sm mt-1 leading-relaxed">{message.body}</p>
        {message.action && (
          <Link
            href={message.action.href}
            className={`inline-block text-sm font-semibold mt-2 underline-offset-4 hover:underline ${style.actionClass}`}
          >
            {message.action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
