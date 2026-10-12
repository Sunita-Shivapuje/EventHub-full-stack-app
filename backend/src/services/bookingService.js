import { randomBytes } from 'node:crypto';
import { pool, query, withTransaction } from '../db.js';
import { notFound, conflict, isUuid, AppError } from '../errors.js';
import { calcTotalCents, cancellationEligibility } from '../domain/rules.js';
import { completePastEvents, getOwnedEvent } from './eventService.js';

const BOOKING_SELECT = `
  SELECT b.*, e.title AS event_title, e.starts_at AS event_starts_at, e.ends_at AS event_ends_at,
         e.location AS event_location, e.status AS event_status, e.details_changed_at AS event_details_changed_at
    FROM bookings b JOIN events e ON e.id = b.event_id`;

export function mapBooking(r, now = new Date()) {
  const elig = cancellationEligibility(
    { bookingStatus: r.status, eventStatus: r.event_status, eventStartsAt: r.event_starts_at },
    now,
  );
  return {
    id: r.id,
    reference: r.reference,
    quantity: r.quantity,
    unitPriceCents: r.unit_price_cents,
    totalCents: Number(r.total_cents),
    status: r.status,
    cancellationReason: r.cancellation_reason,
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    event: {
      id: r.event_id,
      title: r.event_title,
      startsAt: new Date(r.event_starts_at).toISOString(),
      endsAt: new Date(r.event_ends_at).toISOString(),
      location: r.event_location,
      status: r.event_status,
      detailsChangedAt: r.event_details_changed_at ? new Date(r.event_details_changed_at).toISOString() : null,
    },
    cancellable: elig.ok,
    cancellationBlockedReason: elig.ok ? null : elig.message,
    ...(r.attendee_name ? { attendee: { id: r.attendee_id, name: r.attendee_name, email: r.attendee_email } } : {}),
  };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
function newReference() {
  let s = '';
  for (const b of randomBytes(8)) s += ALPHABET[b % ALPHABET.length];
  return `EH-${s}`;
}

async function fetchBooking(id, client = pool) {
  const { rows } = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  return rows[0];
}


export async function createBooking(user, eventId, quantity, idempotencyKey = null) {
  if (!isUuid(eventId)) throw notFound('Event not found');
  await completePastEvents();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await withTransaction(async (c) => {
        if (idempotencyKey) {
          const { rows } = await c.query(
            'SELECT id, event_id FROM bookings WHERE attendee_id = $1 AND idempotency_key = $2',
            [user.id, idempotencyKey],
          );
          if (rows.length) {
            if (rows[0].event_id !== eventId) {
              throw conflict('This Idempotency-Key was already used for a different event', 'IDEMPOTENCY_KEY_REUSED');
            }
            return { id: rows[0].id, replayed: true };
          }
        }

        const reserve = await c.query(
          `UPDATE events SET reserved_count = reserved_count + $2
            WHERE id = $1 AND status = 'published' AND starts_at > now()
              AND reserved_count + $2 <= capacity
        RETURNING price_cents`,
          [eventId, quantity],
        );

        if (reserve.rowCount === 0) {
          const { rows } = await c.query(
            'SELECT status, capacity, reserved_count, starts_at <= now() AS started FROM events WHERE id = $1',
            [eventId],
          );
          const ev = rows[0];
          if (!ev || ev.status === 'draft') throw notFound('Event not found');
          if (ev.status === 'cancelled') throw conflict('This event has been cancelled', 'EVENT_NOT_BOOKABLE');
          if (ev.status === 'completed' || ev.started) throw conflict('This event has already started or finished', 'EVENT_NOT_BOOKABLE');
          const remaining = ev.capacity - ev.reserved_count;
          if (remaining <= 0) throw conflict('This event is sold out', 'SOLD_OUT', { remaining: 0 });
          throw conflict(`Only ${remaining} ticket${remaining === 1 ? '' : 's'} left`, 'INSUFFICIENT_CAPACITY', { remaining });
        }

        
        const unit = reserve.rows[0].price_cents;
        const { rows } = await c.query(
          `INSERT INTO bookings (reference, attendee_id, event_id, quantity, unit_price_cents, total_cents, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [newReference(), user.id, eventId, quantity, unit, calcTotalCents(unit, quantity), idempotencyKey],
        );
        return { id: rows[0].id, replayed: false };
      });
      return { booking: mapBooking(await fetchBooking(result.id)), replayed: result.replayed };
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'bookings_idempotency_unique') {
       
        const { rows } = await query('SELECT id FROM bookings WHERE attendee_id = $1 AND idempotency_key = $2', [user.id, idempotencyKey]);
        if (rows.length) return { booking: mapBooking(await fetchBooking(rows[0].id)), replayed: true };
      }
      if (err.code === '23505' && err.constraint === 'bookings_reference_unique') continue; 
      throw err;
    }
  }
  throw new AppError(500, 'REFERENCE_GENERATION_FAILED', 'Could not generate a booking reference');
}

export async function listAttendeeBookings(userId, { page, pageSize, status }) {
  const params = [userId];
  let where = 'b.attendee_id = $1';
  if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
  const { rows: c } = await query(`SELECT count(*)::int AS total FROM bookings b WHERE ${where}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `${BOOKING_SELECT} WHERE ${where} ORDER BY b.created_at DESC, b.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const now = new Date();
  return { items: rows.map((r) => mapBooking(r, now)), page, pageSize, total: c[0].total, totalPages: Math.max(1, Math.ceil(c[0].total / pageSize)) };
}


export async function getAttendeeBooking(userId, bookingId) {
  if (!isUuid(bookingId)) throw notFound('Booking not found');
  const { rows } = await query(`${BOOKING_SELECT} WHERE b.id = $1 AND b.attendee_id = $2`, [bookingId, userId]);
  if (!rows.length) throw notFound('Booking not found');
  return mapBooking(rows[0]);
}


export async function cancelBooking(userId, bookingId) {
  if (!isUuid(bookingId)) throw notFound('Booking not found');
  await completePastEvents();
  await withTransaction(async (c) => {
    const first = await c.query('SELECT event_id FROM bookings WHERE id = $1 AND attendee_id = $2', [bookingId, userId]);
    if (!first.rows.length) throw notFound('Booking not found');

    await c.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [first.rows[0].event_id]);
    const { rows } = await c.query(
      `SELECT b.id, b.quantity, b.status, b.event_id, e.status AS event_status, e.starts_at
         FROM bookings b JOIN events e ON e.id = b.event_id
        WHERE b.id = $1 AND b.attendee_id = $2 FOR UPDATE OF b`,
      [bookingId, userId],
    );
    const b = rows[0];
    const elig = cancellationEligibility({ bookingStatus: b.status, eventStatus: b.event_status, eventStartsAt: b.starts_at });
    if (!elig.ok) throw conflict(elig.message, elig.code);

    await c.query(
      `UPDATE bookings SET status = 'cancelled', cancellation_reason = 'attendee_cancelled',
              cancelled_at = now(), updated_at = now() WHERE id = $1`,
      [bookingId],
    );
    await c.query('UPDATE events SET reserved_count = reserved_count - $2 WHERE id = $1', [b.event_id, b.quantity]);
  });
  return mapBooking(await fetchBooking(bookingId));
}

export async function listEventBookings(organizerId, eventId, { page, pageSize, status }) {
  await getOwnedEvent(organizerId, eventId); 
  const params = [eventId];
  let where = 'b.event_id = $1';
  if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
  const { rows: c } = await query(`SELECT count(*)::int AS total FROM bookings b WHERE ${where}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(
    `SELECT b.*, e.title AS event_title, e.starts_at AS event_starts_at, e.ends_at AS event_ends_at,
            e.location AS event_location, e.status AS event_status, e.details_changed_at AS event_details_changed_at,
            u.name AS attendee_name, u.email AS attendee_email
       FROM bookings b JOIN events e ON e.id = b.event_id JOIN users u ON u.id = b.attendee_id
      WHERE ${where} ORDER BY b.created_at DESC, b.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows.map((r) => mapBooking(r)), page, pageSize, total: c[0].total, totalPages: Math.max(1, Math.ceil(c[0].total / pageSize)) };
}
