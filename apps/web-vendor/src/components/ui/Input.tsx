import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
}

function FieldShell({ label, hint, error, required, className, children }: FieldShellProps) {
  const reactId = useId();
  const id = `field-${reactId}`;
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/60 mb-2"
        >
          {label}
          {required && <span className="text-electric-500 ml-1">*</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="text-xs text-danger mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-slate-900/45 mt-1.5 italic">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, id: providedId, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {(autoId) => (
        <input
          ref={ref}
          id={providedId ?? autoId}
          required={required}
          className={cn(
            'input-field w-full rounded-3xl px-6 py-4 text-sm placeholder:text-slate-900/35',
            error && 'border-danger/60 shadow-[0_0_0_4px_rgba(251,113,133,0.18)]',
            className,
          )}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id: providedId, rows = 4, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {(autoId) => (
        <textarea
          ref={ref}
          id={providedId ?? autoId}
          rows={rows}
          required={required}
          className={cn(
            'input-field w-full rounded-3xl px-6 py-4 text-sm resize-none placeholder:text-slate-900/35',
            error && 'border-danger/60 shadow-[0_0_0_4px_rgba(251,113,133,0.18)]',
            className,
          )}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

interface ReadOnlyFieldProps {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}

export function ReadOnlyField({ label, value, hint, className }: ReadOnlyFieldProps) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/45 mb-2">
        {label} <span className="font-normal italic text-slate-900/35">(read-only)</span>
      </label>
      <div className="rounded-3xl px-6 py-4 text-sm bg-slate-900/5 border border-slate-900/10 text-slate-900/60 cursor-not-allowed">
        {value || '—'}
      </div>
      {hint && <p className="text-[11px] text-slate-900/45 mt-1.5 italic">{hint}</p>}
    </div>
  );
}
