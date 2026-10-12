import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, EmptyState, LinkButton, Spinner, StatusBadge } from '../components/ui.jsx';
import EventActions from '../components/EventActions.jsx';
import { formatDateTime, money } from '../utils.js';

export default function OrganizerEvents() {
  const { data, error, loading, reload } = useFetch(() => api('/api/organizer/events'), []);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">My events</h1>
        <LinkButton to="/organizer/events/new" variant="primary">Create event</LinkButton>
      </div>
      <div className="mt-6 space-y-4">
        {error && <Alert kind="error">{error.message}</Alert>}
        {loading && !data && <Spinner />}
        {data && data.events.length === 0 && (
          <EmptyState title="You have not created any events" action={<LinkButton to="/organizer/events/new" variant="primary">Create your first event</LinkButton>}>
            Events start as drafts. Publish one when it is ready for attendees to find.
          </EmptyState>
        )}
        {data?.events.map((e) => {
          const pct = Math.min(100, Math.round((e.reserved / e.capacity) * 100));
          return (
            <div key={e.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={e.status} />
                    <span className="text-xs font-semibold text-brand">{e.category}</span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold">{e.title}</h2>
                  <p className="text-sm text-muted">{formatDateTime(e.startsAt)} · {e.location} · {money(e.priceCents)}</p>
                </div>
                <div className="w-full sm:w-56">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{e.reserved} / {e.capacity} tickets</span><span>{e.confirmedBookings} booking{e.confirmedBookings === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tickets reserved">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-4"><EventActions event={e} showManage onChanged={reload} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
