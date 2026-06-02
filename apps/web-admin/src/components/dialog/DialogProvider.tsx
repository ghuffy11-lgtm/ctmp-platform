'use client';

// BUG-078 (2026-06-01): browser-native confirm()/alert() popups are replaced by
// in-app modal dialogs everywhere in admin. Owner directive — native popups feel
// like a "notification", not part of the app, and disrupt the workflow.
//
// Two hooks:
//   const confirm = useConfirm();
//   if (await confirm({ title, body, destructive: true })) { ... }
//
//   const notify = useNotify();
//   await notify({ title, body, variant: 'error' });

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Variant = 'info' | 'error' | 'success';

interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface NotifyOptions {
  title?: string;
  body: ReactNode;
  variant?: Variant;
  acknowledgeLabel?: string;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  notify: (opts: NotifyOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useConfirm must be used inside <DialogProvider>');
  return ctx.confirm;
}

export function useNotify() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useNotify must be used inside <DialogProvider>');
  return ctx.notify;
}

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void };
type PendingNotify = NotifyOptions & { resolve: () => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [notifyState, setNotifyState] = useState<PendingNotify | null>(null);
  const confirmRef = useRef(confirmState);
  const notifyRef = useRef(notifyState);
  confirmRef.current = confirmState;
  notifyRef.current = notifyState;

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const notify = useCallback((opts: NotifyOptions) => {
    return new Promise<void>((resolve) => {
      setNotifyState({ ...opts, resolve });
    });
  }, []);

  const closeConfirm = useCallback((result: boolean) => {
    const s = confirmRef.current;
    if (!s) return;
    s.resolve(result);
    setConfirmState(null);
  }, []);

  const closeNotify = useCallback(() => {
    const s = notifyRef.current;
    if (!s) return;
    s.resolve();
    setNotifyState(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const c = confirmRef.current;
      const n = notifyRef.current;
      if (n) { closeNotify(); return; }
      if (c && !c.destructive) closeConfirm(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeConfirm, closeNotify]);

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {confirmState && (
        <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      )}
      {notifyState && (
        <NotifyDialog state={notifyState} onClose={closeNotify} />
      )}
    </DialogContext.Provider>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: PendingConfirm;
  onClose: (result: boolean) => void;
}) {
  const destructive = !!state.destructive;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={() => { if (!destructive) onClose(false); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-on-surface">{state.title}</h2>
        </div>
        <div className="px-6 py-4 text-sm text-on-surface-variant">{state.body}</div>
        <div className="px-6 py-3 bg-surface-variant/30 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-surface-variant transition-colors"
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={
              destructive
                ? 'px-4 py-2 text-sm font-medium rounded-md bg-error text-on-error hover:bg-error/90 transition-colors'
                : 'px-4 py-2 text-sm font-medium rounded-md bg-primary text-on-primary hover:bg-primary/90 transition-colors'
            }
          >
            {state.confirmLabel ?? (destructive ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifyDialog({
  state,
  onClose,
}: {
  state: PendingNotify;
  onClose: () => void;
}) {
  const variant = state.variant ?? 'info';
  const accent =
    variant === 'error'
      ? 'border-error'
      : variant === 'success'
      ? 'border-success'
      : 'border-border';
  const title = state.title ?? (variant === 'error' ? 'Error' : variant === 'success' ? 'Success' : 'Notice');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-card border ${accent} rounded-xl shadow-2xl max-w-md w-full overflow-hidden`}
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        </div>
        <div className="px-6 py-4 text-sm text-on-surface-variant whitespace-pre-wrap">{state.body}</div>
        <div className="px-6 py-3 bg-surface-variant/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-on-primary hover:bg-primary/90 transition-colors"
          >
            {state.acknowledgeLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
