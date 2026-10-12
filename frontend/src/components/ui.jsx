import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatTime } from '../utils.js';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span>{label}</span>
    </div>
  );
}

const alertStyles = {
  error: 'border-rose-300 bg-rose-50 text-rose-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  info: 'border-indigo-200 bg-brand-soft text-ink',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
};
export function Alert({ kind = 'info', children, className = '' }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${alertStyles[kind]} ${className}`}>
      {children}
    </div>
  );
}

const btn = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-white text-ink border border-line hover:bg-paper disabled:text-muted',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  ghost: 'text-brand hover:bg-brand-soft',
};
export function Button({ variant = 'primary', busy = false, className = '', children, ...rest }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${btn[variant]} ${className}`}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
export const LinkButton = ({ variant = 'secondary', className = '', ...rest }) => (
  <Link {...rest} className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${btn[variant]} ${className}`} />
);

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm text-rose-700" role="alert">{error}</p>}
    </div>
  );
}
export const inputClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-muted/70 focus:border-brand';

const eventBadge = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300',
  published: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  completed: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-300',
};
export function StatusBadge({ status, label }) {
  const text = label || status.charAt(0).toUpperCase() + status.slice(1);
  const cls = eventBadge[status] || (status === 'confirmed' ? eventBadge.published : eventBadge.cancelled);
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-sm text-muted">Page {page} of {totalPages}</span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, busy, error, danger }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onMouseDown={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="dlg-title" className="font-display text-xl font-bold">{title}</h2>
        <div className="mt-3 space-y-3 text-sm text-muted">{children}</div>
        {error && <Alert kind="error" className="mt-4">{error}</Alert>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>Go back</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}


export function Ticket({ stub, children, to, muted = false }) {
  const body = (
    <div className={`relative flex overflow-hidden rounded-xl border border-line bg-white ${muted ? 'opacity-70' : ''}`}>
      <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-ink px-2 py-4 text-center text-white sm:w-24">
        {stub}
      </div>
      <div className="relative flex-1 border-l-2 border-dashed border-line p-4">
        <span className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full border border-line bg-paper" />
        <span className="absolute -bottom-2 -left-[9px] h-4 w-4 rounded-full border border-line bg-paper" />
        {children}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block transition-shadow hover:shadow-md rounded-xl">{body}</Link> : body;
}

export function DateStub({ iso }) {
  const d = new Date(iso);
  return (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-white/70">{d.toLocaleString(undefined, { month: 'short' })}</span>
      <span className="font-display text-3xl font-bold leading-none">{d.getDate()}</span>
      <span className="mt-1 text-xs text-white/70">{formatTime(iso)}</span>
    </>
  );
}
