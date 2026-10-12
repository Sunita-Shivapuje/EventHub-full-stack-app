import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useFetch } from '../hooks.js';
import { Alert, ConfirmDialog, LinkButton, Spinner, StatusBadge, Button } from '../components/ui.jsx';
import { MAX_TICKETS, availabilityLabel, formatDateTime, money, newIdempotencyKey, timeZoneName } from '../utils.js';

function BookingPanel({ event, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(null);

  const bookable = event.status === 'published' && new Date(event.startsAt) > new Date();
  const max = Math.min(MAX_TICKETS, event.remaining);

  if (event.status === 'cancelled') return <Alert kind="error">This event has been cancelled by the organizer.</Alert>;
  if (event.status === 'completed' || (event.status === 'published' && !bookable)) return <Alert kind="info">This event has already started or finished, so booking is closed.</Alert>;
  if (event.status === 'draft') return <Alert kind="warning">Draft preview — attendees cannot see or book this event until you publish it.</Alert>;
  if (event.remaining <= 0) return <Alert kind="warning">Sold out. If someone cancels, tickets will reappear here.</Alert>;
  if (!user) return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Sign in as an attendee to book tickets.</p>
      <LinkButton to="/login" state={{ from: `/events/${event.id}` }} variant="primary" className="w-full">Sign in to book</LinkButton>
    </div>
  );
  if (user.role !== 'attendee') return <Alert kind="info">Organizer accounts manage events. Sign in with an attendee account to book.</Alert>;

  const valid = Number.isInteger(qty) && qty >= 1 && qty <= max;

  function openDialog() {
    key.current = newIdempotencyKey(); 
    setError('');
    setOpen(true);
  }

  async function confirm() {
    setBusy(true); setError('');
    try {
      const d = await api(`/api/events/${event.id}/bookings`, { method: 'POST', body: { quantity: qty }, headers: { 'Idempotency-Key': key.current } });
      navigate(`/bookings/${d.booking.id}`, { state: { justBooked: true } });
    } catch (err) {
      setError(err.message);
      if (['SOLD_OUT', 'INSUFFICIENT_CAPACITY', 'EVENT_NOT_BOOKABLE'].includes(err.code)) { reload(); }
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qty" className="mb-1 block text-sm font-medium">Tickets</label>
        <div className="flex items-center gap-2">
          <Button variant="secondary" aria-label="Fewer tickets" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</Button>
          <input id="qty" type="number" min={1} max={max} step={1} value={Number.isNaN(qty) ? '' : qty}
            onChange={(e) => setQty(e.target.value === '' ? NaN : Number(e.target.value))}
            className="w-20 rounded-lg border border-line bg-white px-3 py-2 text-center text-sm" />
          <Button variant="secondary" aria-label="More tickets" disabled={qty >= max} onClick={() => setQty(qty + 1)}>+</Button>
        </div>
        {!valid && <p className="mt-1 text-sm text-rose-700">Choose between 1 and {max} tickets.</p>}
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">Total (calculated at booking)</span>
        <span className="font-display text-xl font-bold">{valid ? money(event.priceCents * qty) : '—'}</span>
      </div>
      <Button className="w-full" disabled={!valid} onClick={openDialog}>Book tickets</Button>
      <p className="text-xs text-muted">This reserves your tickets. No payment is collected.</p>

      <ConfirmDialog open={open} title="Confirm your booking" confirmLabel="Confirm booking" busy={busy} error={error}
        onConfirm={confirm} onCancel={() => setOpen(false)}>
        <p><strong className="text-ink">{qty} × {event.title}</strong><br />{formatDateTime(event.startsAt)}<br />{event.location}</p>
        <p>Total: <strong className="text-ink">{money(event.priceCents * qty)}</strong> (reservation only — nothing is charged).</p>
        <p>You can cancel any time before the event starts.</p>
      </ConfirmDialog>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api(`/api/events/${id}`), [id]);
  if (loading && !data) return <Spinner />;
  if (error) return (
    <div className="py-16 text-center">
      <h1 className="font-display text-2xl font-bold">{error.status === 404 ? 'Event not found' : 'Something went wrong'}</h1>
      <p className="mt-2 text-muted">{error.status === 404 ? 'It may have been removed or is not published yet.' : error.message}</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-brand hover:underline">Browse events</Link>
    </div>
  );
  const e = data.event;
  const avail = availabilityLabel(e);

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <article className="lg:col-span-2">
        <Link to="/" className="text-sm font-semibold text-brand hover:underline">← All events</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-brand">{e.category}</span>
          <StatusBadge status={e.status} />
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{e.title}</h1>
        <p className="mt-1 text-sm text-muted">Hosted by {e.organizerName}</p>

        {e.detailsChangedAt && e.status !== 'cancelled' && (
          <Alert kind="warning" className="mt-4">The organizer updated the date, time or venue of this event. Please check the details below.</Alert>
        )}
        <dl className="mt-6 grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
          <div><dt className="text-xs font-medium text-muted">Starts</dt><dd className="font-semibold">{formatDateTime(e.startsAt)} <span className="text-xs font-normal text-muted">{timeZoneName()}</span></dd></div>
          <div><dt className="text-xs font-medium text-muted">Ends</dt><dd className="font-semibold">{formatDateTime(e.endsAt)}</dd></div>
          <div><dt className="text-xs font-medium text-muted">Where</dt><dd className="font-semibold">{e.location}</dd></div>
          <div><dt className="text-xs font-medium text-muted">Ticket price</dt><dd className="font-semibold">{money(e.priceCents)}</dd></div>
        </dl>
        <h2 className="mt-8 font-display text-xl font-bold">About this event</h2>
        <p className="mt-2 max-w-prose whitespace-pre-line leading-relaxed">{e.description || 'The organizer has not added a description yet.'}</p>
        {e.isOwner && <LinkButton to={`/organizer/events/${e.id}`} className="mt-6">Open organizer dashboard</LinkButton>}
      </article>

      <aside className="h-fit rounded-xl border border-line bg-white p-5 lg:sticky lg:top-6">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-display text-2xl font-bold">{money(e.priceCents)}</span>
          {avail && <span className={`text-sm font-semibold ${e.remaining <= 0 ? 'text-rose-700' : e.remaining <= 10 ? 'text-amber-700' : 'text-muted'}`}>{avail}</span>}
        </div>
        <BookingPanel event={e} reload={reload} />
      </aside>
    </div>
  );
}
