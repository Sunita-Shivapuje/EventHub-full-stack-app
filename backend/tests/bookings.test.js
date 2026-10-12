import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { http, resetDb, signup, makeEvent, book, eventRow, bookingCount, confirmedTickets } from './helpers.js';

let org, att, att2;
beforeEach(async () => {
  await resetDb();
  org = await signup('organizer');
  att = await signup('attendee');
  att2 = await signup('attendee');
});

describe('4. booking validation', () => {
  it('rejects zero, negative, fractional, non-numeric and excessive quantities', async () => {
    const ev = await makeEvent(org, { capacity: 100 });
    for (const q of [0, -1, 1.5, '2', null, 11, undefined]) {
      const res = await book(att, ev.id, q);
      expect(res.status, `quantity=${q}`).toBe(422);
    }
    expect(await bookingCount(ev.id)).toBe(0);
    expect((await eventRow(ev.id)).reserved_count).toBe(0);
  });
});

describe('5. server-calculated totals', () => {
  it('ignores client-supplied totals, prices and user ids', async () => {
    const ev = await makeEvent(org, { priceCents: 1999 });
    const res = await http().post(`/api/events/${ev.id}/bookings`).set(att.auth)
      .send({ quantity: 3, totalCents: 1, unitPriceCents: 1, priceCents: 1, attendeeId: att2.user.id });
    expect(res.status).toBe(201);
    expect(res.body.booking.unitPriceCents).toBe(1999);
    expect(res.body.booking.totalCents).toBe(5997);
    const row = (await pool.query('SELECT * FROM bookings WHERE id = $1', [res.body.booking.id])).rows[0];
    expect(row.attendee_id).toBe(att.user.id); 
    expect(res.body.booking.reference).toMatch(/^EH-[A-Z2-9]{8}$/);
  });
});

describe('6. capacity limits', () => {
  it('rejects bookings above remaining capacity, and says sold out at zero', async () => {
    const ev = await makeEvent(org, { capacity: 5 });
    expect((await book(att, ev.id, 4)).status).toBe(201);
    const over = await book(att2, ev.id, 2);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('INSUFFICIENT_CAPACITY');
    expect(over.body.error.details.remaining).toBe(1);
    expect((await book(att2, ev.id, 1)).status).toBe(201);
    const soldOut = await book(att, ev.id, 1);
    expect(soldOut.body.error.code).toBe('SOLD_OUT');
    expect((await eventRow(ev.id)).reserved_count).toBe(5);
    expect((await http().get(`/api/events/${ev.id}`)).body.event.remaining).toBe(0);
  });
});

describe('7. concurrent bookings', () => {
  it('the spec example: 5 left, two attendees each request 4 at once -> exactly one succeeds', async () => {
    const ev = await makeEvent(org, { capacity: 5 });
    const results = await Promise.all([book(att, ev.id, 4), book(att2, ev.id, 4)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await confirmedTickets(ev.id)).toBe(4);
    expect((await eventRow(ev.id)).reserved_count).toBe(4);
  });

  it('stress: 40 simultaneous bookings never exceed capacity, and the counter matches the bookings', async () => {
    const capacity = 25;
    const ev = await makeEvent(org, { capacity });
    const buyers = await Promise.all(Array.from({ length: 40 }, () => signup('attendee')));
    const results = await Promise.all(buyers.map((b, i) => book(b, ev.id, (i % 3) + 1)));

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok.length + rejected.length).toBe(40); 
    const sold = ok.reduce((s, r) => s + r.body.booking.quantity, 0);
    expect(sold).toBeLessThanOrEqual(capacity);
    expect(await confirmedTickets(ev.id)).toBe(sold);
    expect((await eventRow(ev.id)).reserved_count).toBe(sold);
    expect(sold).toBeGreaterThan(capacity - 3); 
  });

  it('database CHECK constraint is a backstop even if application code were bypassed', async () => {
    const ev = await makeEvent(org, { capacity: 3 });
    await expect(pool.query('UPDATE events SET reserved_count = 4 WHERE id = $1', [ev.id])).rejects.toThrow(/events_no_oversell/);
  });
});

describe('8. atomicity', () => {
  it('if the booking INSERT fails, the reserved capacity is rolled back and no booking exists', async () => {
    const ev = await makeEvent(org, { capacity: 5 });
    await pool.query(`CREATE OR REPLACE FUNCTION fail_booking_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END; $$ LANGUAGE plpgsql`);
    await pool.query('CREATE TRIGGER fail_insert BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION fail_booking_insert()');
    try {
      const res = await book(att, ev.id, 3);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/simulated|trigger|stack/i); 
    } finally {
      await pool.query('DROP TRIGGER fail_insert ON bookings');
      await pool.query('DROP FUNCTION fail_booking_insert()');
    }
    expect(await bookingCount(ev.id)).toBe(0);
    expect((await eventRow(ev.id)).reserved_count).toBe(0);
    expect((await book(att, ev.id, 5)).status).toBe(201); 
  });

  it('a rejected booking leaves no partial record', async () => {
    const ev = await makeEvent(org, { capacity: 2 });
    await book(att, ev.id, 3);
    expect(await bookingCount(ev.id)).toBe(0);
    expect((await eventRow(ev.id)).reserved_count).toBe(0);
  });
});

describe('duplicate-request safeguards (idempotency)', () => {
  it('a retried request with the same Idempotency-Key returns the original booking', async () => {
    const ev = await makeEvent(org, { capacity: 10 });
    const first = await book(att, ev.id, 2, 'key-abcdef-123');
    const second = await book(att, ev.id, 2, 'key-abcdef-123');
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.booking.id).toBe(first.body.booking.id);
    expect(await bookingCount(ev.id)).toBe(1);
    expect((await eventRow(ev.id)).reserved_count).toBe(2);
  });
  it('simultaneous double-submit with the same key creates exactly one booking', async () => {
    const ev = await makeEvent(org, { capacity: 10 });
    const results = await Promise.all(Array.from({ length: 6 }, () => book(att, ev.id, 2, 'double-click-key-1')));
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(results.map((r) => r.body.booking.id)).size).toBe(1);
    expect(await bookingCount(ev.id)).toBe(1);
    expect((await eventRow(ev.id)).reserved_count).toBe(2);
  });
  it('the same key cannot be reused for a different event, and malformed keys are rejected', async () => {
    const e1 = await makeEvent(org);
    const e2 = await makeEvent(org);
    await book(att, e1.id, 1, 'shared-key-0001');
    expect((await book(att, e2.id, 1, 'shared-key-0001')).body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await book(att, e2.id, 1, 'bad key!')).status).toBe(400);
  });
});

describe('9. cancellation frees capacity exactly once', () => {
  it('cancelling releases tickets; repeating the request does not release them again', async () => {
    const ev = await makeEvent(org, { capacity: 10 });
    const b1 = (await book(att, ev.id, 4)).body.booking;
    await book(att2, ev.id, 3);
    expect((await eventRow(ev.id)).reserved_count).toBe(7);

    const c1 = await http().post(`/api/bookings/${b1.id}/cancel`).set(att.auth);
    expect(c1.status).toBe(200);
    expect(c1.body.booking.status).toBe('cancelled');
    expect((await eventRow(ev.id)).reserved_count).toBe(3);

    const c2 = await http().post(`/api/bookings/${b1.id}/cancel`).set(att.auth);
    expect(c2.status).toBe(409);
    expect(c2.body.error.code).toBe('ALREADY_CANCELLED');
    expect((await eventRow(ev.id)).reserved_count).toBe(3); 
    expect((await http().get(`/api/events/${ev.id}`)).body.event.remaining).toBe(7);
  });
  it('simultaneous duplicate cancellations free the tickets once', async () => {
    const ev = await makeEvent(org, { capacity: 10 });
    const b = (await book(att, ev.id, 4)).body.booking;
    await book(att2, ev.id, 2);
    const results = await Promise.all(Array.from({ length: 5 }, () => http().post(`/api/bookings/${b.id}/cancel`).set(att.auth)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect((await eventRow(ev.id)).reserved_count).toBe(2);
    expect(await confirmedTickets(ev.id)).toBe(2);
  });
  it('freed tickets can be booked again', async () => {
    const ev = await makeEvent(org, { capacity: 2 });
    const b = (await book(att, ev.id, 2)).body.booking;
    expect((await book(att2, ev.id, 1)).status).toBe(409);
    await http().post(`/api/bookings/${b.id}/cancel`).set(att.auth);
    expect((await book(att2, ev.id, 2)).status).toBe(201);
  });
  it('cannot cancel once the event has started (cutoff) and says why', async () => {
    const ev = await makeEvent(org);
    const b = (await book(att, ev.id, 2)).body.booking;
    await pool.query(`UPDATE events SET starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' WHERE id = $1`, [ev.id]);
    const res = await http().post(`/api/bookings/${b.id}/cancel`).set(att.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANCELLATION_CUTOFF_PASSED');
    expect((await http().get(`/api/bookings/${b.id}`).set(att.auth)).body.booking.cancellable).toBe(false);
    expect((await eventRow(ev.id)).reserved_count).toBe(2);
  });
});

describe('10 & 11. privacy', () => {
  it("an attendee cannot read or cancel another attendee's booking", async () => {
    const ev = await makeEvent(org);
    const b = (await book(att, ev.id, 2)).body.booking;
    expect((await http().get(`/api/bookings/${b.id}`).set(att2.auth)).status).toBe(404);
    expect((await http().post(`/api/bookings/${b.id}/cancel`).set(att2.auth)).status).toBe(404);
    expect((await http().get('/api/bookings').set(att2.auth)).body.items).toHaveLength(0);
    expect((await http().get(`/api/bookings/${b.id}`).set(att.auth)).status).toBe(200);
    expect((await eventRow(ev.id)).reserved_count).toBe(2);
    expect((await http().get(`/api/bookings/${b.id}`)).status).toBe(401);
  });
  it('the owning organizer sees bookings with attendee details; booking routes are attendee-only', async () => {
    const ev = await makeEvent(org);
    await book(att, ev.id, 2);
    const res = await http().get(`/api/organizer/events/${ev.id}/bookings`).set(org.auth);
    expect(res.status).toBe(200);
    expect(res.body.items[0].attendee.email).toBe(att.user.email);
    expect((await http().get('/api/bookings').set(org.auth)).status).toBe(403);
  });
});

describe('12. price snapshot', () => {
  it('editing the event price does not change existing booking totals', async () => {
    const ev = await makeEvent(org, { priceCents: 2000 });
    const b = (await book(att, ev.id, 2)).body.booking;
    expect(b.totalCents).toBe(4000);
    const edit = await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ priceCents: 9900 });
    expect(edit.status).toBe(200);
    const after = (await http().get(`/api/bookings/${b.id}`).set(att.auth)).body.booking;
    expect(after.unitPriceCents).toBe(2000);
    expect(after.totalCents).toBe(4000);
    const next = (await book(att2, ev.id, 1)).body.booking; 
    expect(next.unitPriceCents).toBe(9900);
  });
});

describe('organizer dashboard metrics & event cancellation', () => {
  it('derives metrics from persisted bookings', async () => {
    const ev = await makeEvent(org, { capacity: 20, priceCents: 500 });
    const b1 = (await book(att, ev.id, 4)).body.booking;
    await book(att2, ev.id, 3);
    await http().post(`/api/bookings/${b1.id}/cancel`).set(att.auth);
    const { summary } = (await http().get(`/api/organizer/events/${ev.id}/summary`).set(org.auth)).body;
    expect(summary).toMatchObject({
      capacity: 20, ticketsBooked: 3, remaining: 17, confirmedBookings: 1, cancelledBookings: 1,
      confirmedTotalCents: 1500, cancelledTotalCents: 2000, counterInSync: true,
    });
  });
  it('cancelling an event keeps booking history, marks bookings as cancelled by the event, and frees capacity', async () => {
    const ev = await makeEvent(org);
    const b = (await book(att, ev.id, 2)).body.booking;
    const res = await http().post(`/api/organizer/events/${ev.id}/cancel`).set(org.auth);
    expect(res.status).toBe(200);
    const after = (await http().get(`/api/bookings/${b.id}`).set(att.auth)).body.booking;
    expect(after.status).toBe('cancelled');
    expect(after.cancellationReason).toBe('event_cancelled');
    expect(after.event.status).toBe('cancelled');
    expect(after.totalCents).toBe(b.totalCents); 
    expect(await bookingCount(ev.id)).toBe(1);
    expect((await eventRow(ev.id)).reserved_count).toBe(0);
    expect((await http().post(`/api/bookings/${b.id}/cancel`).set(att.auth)).status).toBe(409);
  });
});

describe('error format', () => {
  it('uses one consistent error envelope', async () => {
    const res = await http().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    const bad = await http().post('/api/auth/register').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
  });
  it('health endpoint reports database connectivity', async () => {
    expect((await http().get('/health')).body.status).toBe('ok');
  });
});
