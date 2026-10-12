import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, EmptyState, Pagination, Spinner, StatusBadge, inputClass } from '../components/ui.jsx';
import EventActions from '../components/EventActions.jsx';
import { formatDateTime, money } from '../utils.js';
import { bookingStatusLabel } from './MyBookings.jsx';

const Metric = ({ label, value, hint }) => (
  <div className="rounded-xl border border-line bg-white p-4">
    <dt className="text-xs font-medium text-muted">{label}</dt>
    <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
    {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
  </div>
);

export default function EventDashboard() {
  const { id } = useParams();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const ev = useFetch(() => api(`/api/organizer/events/${id}`), [id]);
  const sum = useFetch(() => api(`/api/organizer/events/${id}/summary`), [id]);
  const bookings = useFetch(() => api(`/api/organizer/events/${id}/bookings?page=${page}&pageSize=15${status ? `&status=${status}` : ''}`), [id, page, status]);

  const refresh = () => { ev.reload(); sum.reload(); bookings.reload(); };

  if (ev.loading && !ev.data) return <Spinner />;
  if (ev.error) return (
    <div className="py-16 text-center">
      <h1 className="font-display text-2xl font-bold">{ev.error.status === 404 ? 'Event not found' : 'Something went wrong'}</h1>
      <p className="mt-2 text-muted">{ev.error.status === 404 ? 'It does not exist or is not one of your events.' : ev.error.message}</p>
      <Link to="/organizer" className="mt-4 inline-block font-semibold text-brand hover:underline">Back to my events</Link>
    </div>
  );
  const e = ev.data.event;
  const s = sum.data?.summary;

  return (
    <div>
      <Link to="/organizer" className="text-sm font-semibold text-brand hover:underline">← My events</Link>
      {location.state?.saved && <Alert kind="success" className="mt-4">{location.state.saved}</Alert>}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <StatusBadge status={e.status} />
          <h1 className="mt-1 font-display text-3xl font-bold">{e.title}</h1>
          <p className="text-sm text-muted">{formatDateTime(e.startsAt)} – {formatDateTime(e.endsAt)} · {e.location} · {money(e.priceCents)}</p>
          {e.status === 'published' && <Link to={`/events/${e.id}`} className="text-sm font-semibold text-brand hover:underline">View public page</Link>}
          {e.status === 'draft' && <Link to={`/events/${e.id}`} className="text-sm font-semibold text-brand hover:underline">Preview as attendee</Link>}
        </div>
        <EventActions event={e} onChanged={refresh} />
      </div>

      {e.status === 'cancelled' && <Alert kind="warning" className="mt-4">This event is cancelled. Bookings are kept for history and no longer hold capacity.</Alert>}
      {e.status === 'draft' && <Alert kind="info" className="mt-4">This is a draft. Attendees cannot see or book it until you publish.</Alert>}

      <h2 className="mt-8 font-display text-xl font-bold">Capacity and bookings</h2>
      {sum.error && <Alert kind="error" className="mt-3">{sum.error.message}</Alert>}
      {s && (
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total capacity" value={s.capacity} />
          <Metric label="Tickets booked" value={s.ticketsBooked} hint="Confirmed bookings only" />
          <Metric label="Remaining" value={s.remaining} />
          <Metric label="Confirmed bookings" value={s.confirmedBookings} />
          <Metric label="Cancelled bookings" value={s.cancelledBookings} hint={`${s.ticketsCancelled} tickets released`} />
          <Metric label="Booked value" value={money(s.confirmedTotalCents)} hint="Sum of price snapshots (no payments collected)" />
          <Metric label="Cancelled value" value={money(s.cancelledTotalCents)} />
        </dl>
      )}

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Bookings</h2>
        <div>
          <label htmlFor="st" className="sr-only">Filter by status</label>
          <select id="st" className={inputClass} value={status} onChange={(x) => { setStatus(x.target.value); setPage(1); }}>
            <option value="">All bookings</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        {bookings.error && <Alert kind="error">{bookings.error.message}</Alert>}
        {bookings.loading && !bookings.data && <Spinner />}
        {bookings.data?.items.length === 0 && <EmptyState title="No bookings yet">Bookings will appear here as attendees reserve tickets.</EmptyState>}
        {bookings.data?.items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs text-muted">
                <tr><th className="px-4 py-2">Reference</th><th className="px-4 py-2">Attendee</th><th className="px-4 py-2">Tickets</th><th className="px-4 py-2">Total</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Booked</th></tr>
              </thead>
              <tbody>
                {bookings.data.items.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                    <td className="px-4 py-3"><div className="font-semibold">{b.attendee.name}</div><div className="text-xs text-muted">{b.attendee.email}</div></td>
                    <td className="px-4 py-3">{b.quantity}</td>
                    <td className="px-4 py-3">{money(b.totalCents)}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} label={bookingStatusLabel(b)} /></td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bookings.data && <Pagination page={bookings.data.page} totalPages={bookings.data.totalPages} onPage={setPage} />}
      </div>
    </div>
  );
}
