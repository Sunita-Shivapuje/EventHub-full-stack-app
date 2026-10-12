import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, EmptyState, LinkButton, Pagination, Spinner, StatusBadge, Ticket, DateStub, inputClass } from '../components/ui.jsx';
import { formatDateTime, money } from '../utils.js';

export const bookingStatusLabel = (b) =>
  b.status === 'confirmed' ? 'Confirmed' : b.cancellationReason === 'event_cancelled' ? 'Cancelled — event cancelled' : 'Cancelled';

export default function MyBookings() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, error, loading } = useFetch(
    () => api(`/api/bookings?page=${page}&pageSize=10${status ? `&status=${status}` : ''}`), [page, status]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">My bookings</h1>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted">Show</label>
          <select id="status" className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All bookings</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {error && <Alert kind="error">{error.message}</Alert>}
        {loading && <Spinner />}
        {!loading && data?.items.length === 0 && (
          <EmptyState title={status ? 'No bookings with that status' : 'No bookings yet'}
            action={<LinkButton to="/" variant="primary">Browse events</LinkButton>}>
            When you book tickets they will show up here with their reference numbers.
          </EmptyState>
        )}
        {!loading && data?.items.map((b) => (
          <Ticket key={b.id} to={`/bookings/${b.id}`} stub={<DateStub iso={b.event.startsAt} />} muted={b.status === 'cancelled'}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} label={bookingStatusLabel(b)} />
              <span className="font-mono text-xs text-muted">{b.reference}</span>
            </div>
            <h3 className="mt-1 font-display text-lg font-bold">{b.event.title}</h3>
            <p className="text-sm text-muted">{formatDateTime(b.event.startsAt)} · {b.event.location}</p>
            <p className="mt-2 text-sm"><strong>{b.quantity}</strong> ticket{b.quantity === 1 ? '' : 's'} · <strong>{money(b.totalCents)}</strong></p>
          </Ticket>
        ))}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
