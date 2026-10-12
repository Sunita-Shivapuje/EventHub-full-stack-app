import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, Button, EmptyState, Pagination, Spinner, Ticket, DateStub, inputClass } from '../components/ui.jsx';
import { availabilityLabel, endOfDayISO, formatDateTime, money, startOfDayISO } from '../utils.js';

const PAGE_SIZE = 9;

export function EventCard({ event }) {
  const avail = availabilityLabel(event);
  return (
    <Ticket to={`/events/${event.id}`} stub={<DateStub iso={event.startsAt} />}>
      <p className="text-xs font-semibold text-brand">{event.category}</p>
      <h3 className="mt-0.5 font-display text-lg font-bold leading-snug">{event.title}</h3>
      <p className="mt-1 truncate text-sm text-muted">{event.location}</p>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold">{money(event.priceCents)}</span>
        <span className={event.remaining <= 0 ? 'font-semibold text-rose-700' : event.remaining <= 10 ? 'font-semibold text-amber-700' : 'text-muted'}>{avail}</span>
      </div>
    </Ticket>
  );
}

export default function Events() {
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) || d;
  const page = Math.max(1, Number(get('page', 1)) || 1);
  const [q, setQ] = useState(get('q'));
  const [location, setLocation] = useState(get('location'));

  const update = (patch) => setParams((prev) => {
    const sp = new URLSearchParams(prev);
    for (const [k, v] of Object.entries({ page: '', ...patch })) (v ? sp.set(k, v) : sp.delete(k));
    return sp;
  });


  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== get('q') || location !== get('location')) update({ q, location });
    }, 350);
    return () => clearTimeout(t);
    
  }, [q, location]);

  const cats = useFetch(() => api('/api/events/categories'), []);
  const from = get('from');
  const to = get('to');
  const invalidRange = from && to && from > to;

  const { data, error, loading } = useFetch(async () => {
    if (invalidRange) return null;
    const sp = new URLSearchParams({ sort: get('sort', 'start_asc'), page, pageSize: PAGE_SIZE });
    for (const k of ['q', 'category', 'location']) if (get(k)) sp.set(k, get(k));
    if (from) sp.set('from', startOfDayISO(from));
    if (to) sp.set('to', endOfDayISO(to));
    return api(`/api/events?${sp}`);
  }, [params.toString()]);

  const filtered = ['q', 'category', 'location', 'from', 'to'].some((k) => get(k));
  const clear = () => { setQ(''); setLocation(''); setParams({}); };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Find your next event</h1>
      <p className="mt-1 text-muted">Browse upcoming events and reserve your tickets.</p>

      <form onSubmit={(e) => e.preventDefault()} className="mt-6 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter events">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input id="q" type="search" placeholder="Title or keyword" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cat" className="mb-1 block text-xs font-medium text-muted">Category</label>
          <select id="cat" className={inputClass} value={get('category')} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {(cats.data?.categories || []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="loc" className="mb-1 block text-xs font-medium text-muted">Location</label>
          <input id="loc" placeholder="City or venue" className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-muted">From</label>
          <input id="from" type="date" className={inputClass} value={from} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-muted">To</label>
          <input id="to" type="date" className={inputClass} value={to} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-6">
          <div>
            <label htmlFor="sort" className="mb-1 block text-xs font-medium text-muted">Sort by start time</label>
            <select id="sort" className={inputClass} value={get('sort', 'start_asc')} onChange={(e) => update({ sort: e.target.value === 'start_asc' ? '' : e.target.value })}>
              <option value="start_asc">Soonest first</option>
              <option value="start_desc">Latest first</option>
            </select>
          </div>
          {filtered && <Button type="button" variant="ghost" onClick={clear}>Clear filters</Button>}
        </div>
      </form>

      <div className="mt-6">
        {invalidRange && <Alert kind="warning">The “From” date must be on or before the “To” date.</Alert>}
        {error && <Alert kind="error">{error.message}</Alert>}
        {loading && !invalidRange && <Spinner label="Finding events…" />}
        {!loading && !error && data && data.items.length === 0 && (
          <EmptyState title={filtered ? 'No events match your filters' : 'No upcoming events yet'}
            action={filtered && <Button variant="secondary" onClick={clear}>Clear filters</Button>}>
            {filtered ? 'Try a different search, widen the dates, or clear the filters.' : 'Check back soon — organizers are publishing new events.'}
          </EmptyState>
        )}
        {!loading && data && data.items.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted">{data.total} event{data.total === 1 ? '' : 's'}</p>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onPage={(p) => update({ page: p === 1 ? '' : p })} />
          </>
        )}
      </div>
    </div>
  );
}
