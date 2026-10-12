import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, Button, ConfirmDialog, Spinner, StatusBadge } from '../components/ui.jsx';
import { formatDateTime, money } from '../utils.js';
import { bookingStatusLabel } from './MyBookings.jsx';

export default function BookingDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch(() => api(`/api/bookings/${id}`), [id]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelled, setCancelled] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return (
    <div className="py-16 text-center">
      <h1 className="font-display text-2xl font-bold">{error.status === 404 ? 'Booking not found' : 'Something went wrong'}</h1>
      <p className="mt-2 text-muted">{error.status === 404 ? 'This booking does not exist or belongs to another account.' : error.message}</p>
      <Link to="/bookings" className="mt-4 inline-block font-semibold text-brand hover:underline">Back to my bookings</Link>
    </div>
  );
  const b = data.booking;

  async function cancel() {
    setBusy(true); setCancelError('');
    try {
      await api(`/api/bookings/${b.id}/cancel`, { method: 'POST' });
      setCancelled(true); setOpen(false); reload();
    } catch (err) {
      setCancelError(err.message); reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/bookings" className="text-sm font-semibold text-brand hover:underline">← My bookings</Link>
      {location.state?.justBooked && b.status === 'confirmed' && (
        <Alert kind="success" className="mt-4"><strong>Booking confirmed.</strong> Your tickets are reserved. Keep your reference handy: <span className="font-mono font-semibold">{b.reference}</span>.</Alert>
      )}
      {cancelled && <Alert kind="success" className="mt-4">Booking cancelled. Your tickets have been released.</Alert>}
      {b.event.status === 'cancelled' && <Alert kind="error" className="mt-4"><strong>This event was cancelled by the organizer.</strong> Your booking is closed and kept here for your records.</Alert>}
      {b.event.detailsChangedAt && b.event.status !== 'cancelled' && b.status === 'confirmed' && (
        <Alert kind="warning" className="mt-4">The organizer changed the date, time or venue after you booked. Check the details below{b.cancellable ? ' — you can cancel if they no longer suit you' : ''}.</Alert>
      )}

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <div className="bg-ink px-6 py-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={b.status} label={bookingStatusLabel(b)} />
            <span className="font-mono text-sm tracking-wider text-white/80">{b.reference}</span>
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold">{b.event.title}</h1>
          <p className="mt-1 text-sm text-white/70">{formatDateTime(b.event.startsAt)} · {b.event.location}</p>
        </div>
        <div className="relative border-t-2 border-dashed border-line px-6 py-5">
          <span className="absolute -left-2 -top-[9px] h-4 w-4 rounded-full border border-line bg-paper" />
          <span className="absolute -right-2 -top-[9px] h-4 w-4 rounded-full border border-line bg-paper" />
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-muted">Tickets</dt><dd className="font-semibold">{b.quantity}</dd></div>
            <div><dt className="text-muted">Price each</dt><dd className="font-semibold">{money(b.unitPriceCents)}</dd></div>
            <div><dt className="text-muted">Total</dt><dd className="font-semibold">{money(b.totalCents)}</dd></div>
            <div><dt className="text-muted">Booked</dt><dd className="font-semibold">{formatDateTime(b.createdAt)}</dd></div>
          </dl>
          {b.cancelledAt && <p className="mt-4 text-sm text-muted">Cancelled on {formatDateTime(b.cancelledAt)}.</p>}
          <p className="mt-4 text-xs text-muted">Reservation only — no payment has been collected. The price shown was locked in when you booked.</p>
        </div>
      </div>

      <div className="mt-6">
        {b.cancellable ? (
          <Button variant="danger" onClick={() => { setCancelError(''); setOpen(true); }}>Cancel booking</Button>
        ) : b.status === 'confirmed' ? (
          <Alert kind="info">Cancellation is unavailable: {b.cancellationBlockedReason}</Alert>
        ) : null}
        {cancelError && !open && <Alert kind="error" className="mt-3">{cancelError}</Alert>}
      </div>

      <ConfirmDialog open={open} danger title="Cancel this booking?" confirmLabel="Yes, cancel booking" busy={busy} error={cancelError}
        onConfirm={cancel} onCancel={() => setOpen(false)}>
        <p>You are cancelling <strong className="text-ink">{b.quantity} ticket{b.quantity === 1 ? '' : 's'}</strong> for {b.event.title}. The tickets go back on sale and this cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
