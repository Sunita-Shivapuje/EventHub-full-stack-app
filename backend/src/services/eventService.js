import { pool, query, withTransaction } from '../db.js';
import { notFound, conflict, validation, isUuid } from '../errors.js';
import { canTransitionEvent, isEventEditable, validateSchedule } from '../domain/rules.js';

export const mapEvent = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  category: r.category,
  location: r.location,
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
  capacity: r.capacity,
  reserved: r.reserved_count,
  remaining: r.capacity - r.reserved_count,
  priceCents: r.price_cents,
  status: r.status,
  organizerId: r.organizer_id,
  organizerName: r.organizer_name,
  detailsChangedAt: r.details_changed_at ? new Date(r.details_changed_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  ...(r.confirmed_bookings !== undefined ? { confirmedBookings: r.confirmed_bookings } : {}),
});


export async function completePastEvents(client = pool) {
  const { rowCount } = await client.query(
    `UPDATE events SET status = 'completed', updated_at = now()
     WHERE status = 'published' AND ends_at < now()`,
  );
  return rowCount;
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listPublicEvents(f) {
  await completePastEvents();
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const where = [`e.status = 'published'`, `e.starts_at > now()`];

  if (f.q) {
    const p = add(`%${escapeLike(f.q)}%`);
    where.push(`(e.title ILIKE ${p} OR e.description ILIKE ${p} OR e.category ILIKE ${p})`);
  }
  if (f.category) where.push(`lower(e.category) = lower(${add(f.category)})`);
  if (f.location) where.push(`e.location ILIKE ${add(`%${escapeLike(f.location)}%`)}`);
  if (f.from) where.push(`e.starts_at >= ${add(f.from)}`);
  if (f.to) where.push(`e.starts_at <= ${add(f.to)}`);

  const whereSql = where.join(' AND ');
  const dir = f.sort === 'start_desc' ? 'DESC' : 'ASC';
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM events e WHERE ${whereSql}`, params);
  const total = countRows[0].total;

  const limit = add(f.pageSize);
  const offset = add((f.page - 1) * f.pageSize);
  const { rows } = await query(
    `SELECT e.*, u.name AS organizer_name
       FROM events e JOIN users u ON u.id = e.organizer_id
      WHERE ${whereSql}
      ORDER BY e.starts_at ${dir}, e.id
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return { items: rows.map(mapEvent), page: f.page, pageSize: f.pageSize, total, totalPages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

export async function listCategories() {
  const { rows } = await query(
    `SELECT DISTINCT category FROM events WHERE status = 'published' AND starts_at > now() ORDER BY category`,
  );
  return rows.map((r) => r.category);
}


export async function getEventForViewer(id, viewer) {
  if (!isUuid(id)) throw notFound('Event not found');
  await completePastEvents();
  const { rows } = await query(
    `SELECT e.*, u.name AS organizer_name FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || (row.status === 'draft' && (!viewer || viewer.id !== row.organizer_id))) throw notFound('Event not found');
  return { ...mapEvent(row), isOwner: !!viewer && viewer.id === row.organizer_id };
}



export async function listOrganizerEvents(organizerId) {
  await completePastEvents();
  const { rows } = await query(
    `SELECT e.*, (SELECT count(*)::int FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed') AS confirmed_bookings
       FROM events e WHERE e.organizer_id = $1 ORDER BY e.starts_at DESC`,
    [organizerId],
  );
  return rows.map(mapEvent);
}


export async function getOwnedEvent(organizerId, id, client = pool) {
  if (!isUuid(id)) throw notFound('Event not found');
  const { rows } = await client.query('SELECT * FROM events WHERE id = $1 AND organizer_id = $2', [id, organizerId]);
  if (!rows.length) throw notFound('Event not found');
  return rows[0];
}

async function lockOwnedEvent(client, organizerId, id) {
  if (!isUuid(id)) throw notFound('Event not found');
  const { rows } = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
  if (!rows.length || rows[0].organizer_id !== organizerId) throw notFound('Event not found');
  return rows[0];
}

export async function createEvent(organizerId, data) {
  const errors = validateSchedule(data, { requireFuture: true });
  if (Object.keys(errors).length) throw validation(errors);
  const { rows } = await query(
    `INSERT INTO events (organizer_id, title, description, category, location, starts_at, ends_at, capacity, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [organizerId, data.title, data.description ?? '', data.category, data.location, data.startsAt, data.endsAt, data.capacity, data.priceCents],
  );
  return mapEvent(rows[0]);
}

export async function updateEvent(organizerId, id, patch) {
  await completePastEvents();
  return withTransaction(async (c) => {
    const ev = await lockOwnedEvent(c, organizerId, id); 
    if (!isEventEditable(ev.status)) {
      throw conflict(`A ${ev.status} event can no longer be edited`, 'EVENT_NOT_EDITABLE');
    }
    const next = {
      title: patch.title ?? ev.title,
      description: patch.description ?? ev.description,
      category: patch.category ?? ev.category,
      location: patch.location ?? ev.location,
      startsAt: patch.startsAt ?? ev.starts_at.toISOString(),
      endsAt: patch.endsAt ?? ev.ends_at.toISOString(),
      capacity: patch.capacity ?? ev.capacity,
      priceCents: patch.priceCents ?? ev.price_cents,
    };
    const startChanged = new Date(next.startsAt).getTime() !== ev.starts_at.getTime();
    const endChanged = new Date(next.endsAt).getTime() !== ev.ends_at.getTime();
    const schedErrors = validateSchedule(next, { requireFuture: startChanged });
    if (Object.keys(schedErrors).length) throw validation(schedErrors);

    if (next.capacity < ev.reserved_count) {
      throw conflict(
        `Capacity cannot be lower than the ${ev.reserved_count} ticket(s) already booked`,
        'CAPACITY_BELOW_RESERVED',
        { reserved: ev.reserved_count },
      );
    }

   
    const detailsChanged = startChanged || endChanged || next.location !== ev.location;
    let flag = false;
    if (detailsChanged) {
      const { rows } = await c.query('SELECT EXISTS (SELECT 1 FROM bookings WHERE event_id = $1) AS has', [id]);
      flag = rows[0].has;
    }
    const { rows } = await c.query(
      `UPDATE events SET title=$2, description=$3, category=$4, location=$5, starts_at=$6, ends_at=$7,
              capacity=$8, price_cents=$9, updated_at=now(),
              details_changed_at = CASE WHEN $10::boolean THEN now() ELSE details_changed_at END
        WHERE id = $1 RETURNING *`,
      [id, next.title, next.description, next.category, next.location, next.startsAt, next.endsAt, next.capacity, next.priceCents, flag],
    );
    return mapEvent(rows[0]);
  });
}

async function transition(organizerId, id, to) {
  await completePastEvents();
  return withTransaction(async (c) => {
    const ev = await lockOwnedEvent(c, organizerId, id);
    if (!canTransitionEvent(ev.status, to)) {
      throw conflict(`An event cannot move from ${ev.status} to ${to}`, 'INVALID_TRANSITION');
    }
    if (to === 'published') {
      const errors = validateSchedule({ startsAt: ev.starts_at, endsAt: ev.ends_at }, { requireFuture: true });
      if (Object.keys(errors).length) throw validation(errors);
    }
    if (to === 'draft' && ev.reserved_count > 0) {
      throw conflict('This event has active bookings, so it cannot be unpublished. Cancel the event instead.', 'HAS_ACTIVE_BOOKINGS');
    }
    if (to === 'cancelled') {
      
      await c.query(
        `UPDATE bookings SET status = 'cancelled', cancellation_reason = 'event_cancelled',
                cancelled_at = now(), updated_at = now()
          WHERE event_id = $1 AND status = 'confirmed'`,
        [id],
      );
    }
    const { rows } = await c.query(
      `UPDATE events SET status = $2::text, updated_at = now(),
              reserved_count = CASE WHEN $2::text = 'cancelled' THEN 0 ELSE reserved_count END
        WHERE id = $1 RETURNING *`,
      [id, to],
    );
    return mapEvent(rows[0]);
  });
}

export const publishEvent = (organizerId, id) => transition(organizerId, id, 'published');
export const unpublishEvent = (organizerId, id) => transition(organizerId, id, 'draft');
export const cancelEvent = (organizerId, id) => transition(organizerId, id, 'cancelled');


export async function getEventSummary(organizerId, id) {
  const ev = await getOwnedEvent(organizerId, id);
  const { rows } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed')::int                          AS confirmed_bookings,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int                          AS cancelled_bookings,
        COALESCE(SUM(quantity)    FILTER (WHERE status = 'confirmed'), 0)::int      AS tickets_booked,
        COALESCE(SUM(quantity)    FILTER (WHERE status = 'cancelled'), 0)::int      AS tickets_cancelled,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'confirmed'), 0)::text     AS confirmed_total_cents,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'cancelled'), 0)::text     AS cancelled_total_cents
       FROM bookings WHERE event_id = $1`,
    [id],
  );
  const r = rows[0];
  return {
    eventId: id,
    status: ev.status,
    capacity: ev.capacity,
    ticketsBooked: r.tickets_booked,
    remaining: ev.capacity - r.tickets_booked,
    confirmedBookings: r.confirmed_bookings,
    cancelledBookings: r.cancelled_bookings,
    ticketsCancelled: r.tickets_cancelled,
    confirmedTotalCents: Number(r.confirmed_total_cents),
    cancelledTotalCents: Number(r.cancelled_total_cents),
    
    counterInSync: ev.reserved_count === r.tickets_booked,
  };
}
