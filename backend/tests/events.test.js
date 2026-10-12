import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { http, resetDb, signup, makeEvent, eventBody, when, book, eventRow } from './helpers.js';

let org, org2, att;
beforeEach(async () => {
  await resetDb();
  org = await signup('organizer');
  org2 = await signup('organizer');
  att = await signup('attendee');
});

describe('authentication', () => {
  it('rejects unauthenticated access to protected routes (401)', async () => {
    expect((await http().get('/api/organizer/events')).status).toBe(401);
    expect((await http().get('/api/bookings')).status).toBe(401);
    expect((await http().get('/api/organizer/events').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });
  it('enforces roles (403): attendees cannot manage events, organizers cannot book', async () => {
    expect((await http().post('/api/organizer/events').set(att.auth).send(eventBody())).status).toBe(403);
    const ev = await makeEvent(org);
    expect((await book(org, ev.id, 1)).status).toBe(403);
  });
  it('login works and does not reveal whether an email exists', async () => {
    const bad1 = await http().post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'whatever1' });
    const bad2 = await http().post('/api/auth/login').send({ email: att.user.email, password: 'wrong-password' });
    expect(bad1.status).toBe(401);
    expect(bad2.body.error.message).toBe(bad1.body.error.message);
    const ok = await http().post('/api/auth/login').send({ email: att.user.email, password: 'Password123!' });
    expect(ok.status).toBe(200);
    expect((await http().get('/api/auth/me').set({ Authorization: `Bearer ${ok.body.token}` })).body.user.role).toBe('attendee');
  });
  it('never exposes password hashes', async () => {
    const res = await http().post('/api/auth/login').send({ email: att.user.email, password: 'Password123!' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('1. event validation', () => {
  const create = (o) => http().post('/api/organizer/events').set(org.auth).send(eventBody(o));
  it('rejects end time before/equal to start time', async () => {
    const { startsAt } = when(48);
    expect((await create({ startsAt, endsAt: startsAt })).status).toBe(422);
    const res = await create({ startsAt, endsAt: new Date(Date.parse(startsAt) - 3600_000).toISOString() });
    expect(res.status).toBe(422);
    expect(res.body.error.details.endsAt).toBeTruthy();
  });
  it('rejects non-positive / fractional / non-numeric capacity', async () => {
    for (const capacity of [0, -5, 2.5, '10', null]) expect((await create({ capacity })).status).toBe(422);
  });
  it('rejects negative, fractional, and non-numeric price (money is integer cents)', async () => {
    for (const priceCents of [-1, 10.5, '10']) expect((await create({ priceCents })).status).toBe(422);
    expect((await create({ priceCents: 0 })).status).toBe(201); 
  });
  it('rejects missing required fields and past start times', async () => {
    expect((await create({ title: '   ' })).status).toBe(422);
    expect((await create({ ...when(-5) })).status).toBe(422);
  });
  it('ignores a client-supplied status and organizerId', async () => {
    const res = await create({ status: 'published', organizerId: org2.user.id });
    expect(res.status).toBe(201);
    expect(res.body.event.status).toBe('draft');
    expect(res.body.event.organizerId).toBe(org.user.id);
  });
});

describe('2. event visibility', () => {
  it('draft and cancelled events are not listed, and drafts are hidden from others', async () => {
    const draft = await makeEvent(org, { title: 'Draft One' }, { publish: false });
    const live = await makeEvent(org, { title: 'Live One' });
    const cancelled = await makeEvent(org, { title: 'Cancelled One' });
    await http().post(`/api/organizer/events/${cancelled.id}/cancel`).set(org.auth);

    const list = await http().get('/api/events');
    const titles = list.body.items.map((e) => e.title);
    expect(titles).toEqual(['Live One']);
    expect((await http().get(`/api/events/${draft.id}`)).status).toBe(404);
    expect((await http().get(`/api/events/${draft.id}`).set(att.auth)).status).toBe(404);
    expect((await http().get(`/api/events/${draft.id}`).set(org.auth)).status).toBe(200); 
    expect((await http().get(`/api/events/${live.id}`)).body.event.remaining).toBe(10);
  });
  it('draft and cancelled events cannot be booked', async () => {
    const draft = await makeEvent(org, {}, { publish: false });
    const cancelled = await makeEvent(org);
    await http().post(`/api/organizer/events/${cancelled.id}/cancel`).set(org.auth);
    expect((await book(att, draft.id, 1)).status).toBe(404);
    const res = await book(att, cancelled.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_NOT_BOOKABLE');
  });
  it('completed events are not listed or bookable', async () => {
    const ev = await makeEvent(org);
    await pool.query(`UPDATE events SET starts_at = now() - interval '5 hours', ends_at = now() - interval '3 hours' WHERE id = $1`, [ev.id]);
    expect((await http().get('/api/events')).body.items).toHaveLength(0);
    expect((await eventRow(ev.id)).status).toBe('completed');
    expect((await book(att, ev.id, 1)).status).toBe(409);
  });
});

describe('3. organizer ownership', () => {
  it("another organizer cannot read, edit, publish, cancel, or view bookings/summary of someone's event", async () => {
    const ev = await makeEvent(org);
    const url = `/api/organizer/events/${ev.id}`;
    expect((await http().get(url).set(org2.auth)).status).toBe(404);
    expect((await http().patch(url).set(org2.auth).send({ title: 'Hacked' })).status).toBe(404);
    expect((await http().post(`${url}/cancel`).set(org2.auth)).status).toBe(404);
    expect((await http().post(`${url}/unpublish`).set(org2.auth)).status).toBe(404);
    expect((await http().get(`${url}/summary`).set(org2.auth)).status).toBe(404);
    expect((await http().get(`${url}/bookings`).set(org2.auth)).status).toBe(404); 
    expect((await eventRow(ev.id)).title).toBe('Test Event');
    expect((await eventRow(ev.id)).status).toBe('published');
  });
  it('invalid ids are 404, not 500', async () => {
    expect((await http().get('/api/organizer/events/not-a-uuid').set(org.auth)).status).toBe(404);
    expect((await http().get('/api/events/not-a-uuid')).status).toBe(404);
  });
});

describe('13. lifecycle rules', () => {
  it('rejects invalid event transitions', async () => {
    const draft = await makeEvent(org, {}, { publish: false });
    expect((await http().post(`/api/organizer/events/${draft.id}/unpublish`).set(org.auth)).status).toBe(409);
    await http().post(`/api/organizer/events/${draft.id}/publish`).set(org.auth);
    expect((await http().post(`/api/organizer/events/${draft.id}/publish`).set(org.auth)).status).toBe(409);
    await http().post(`/api/organizer/events/${draft.id}/cancel`).set(org.auth);
    for (const action of ['publish', 'unpublish', 'cancel']) {
      const r = await http().post(`/api/organizer/events/${draft.id}/${action}`).set(org.auth);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('INVALID_TRANSITION');
    }
    expect((await http().patch(`/api/organizer/events/${draft.id}`).set(org.auth).send({ title: 'x' })).body.error.code).toBe('EVENT_NOT_EDITABLE');
  });
  it('cannot unpublish an event that has active bookings', async () => {
    const ev = await makeEvent(org);
    await book(att, ev.id, 1);
    const res = await http().post(`/api/organizer/events/${ev.id}/unpublish`).set(org.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_ACTIVE_BOOKINGS');
  });
  it('a completed event cannot be re-published or edited', async () => {
    const ev = await makeEvent(org);
    await pool.query(`UPDATE events SET starts_at = now() - interval '5 hours', ends_at = now() - interval '3 hours' WHERE id = $1`, [ev.id]);
    expect((await http().post(`/api/organizer/events/${ev.id}/publish`).set(org.auth)).body.error.code).toBe('INVALID_TRANSITION');
    expect((await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ title: 'x' })).status).toBe(409);
  });
});

describe('capacity edits and schedule changes', () => {
  it('cannot lower capacity below tickets already reserved', async () => {
    const ev = await makeEvent(org, { capacity: 10 });
    await book(att, ev.id, 6);
    const bad = await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ capacity: 5 });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('CAPACITY_BELOW_RESERVED');
    expect((await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ capacity: 6 })).status).toBe(200);
  });
  it('flags time/location changes when bookings exist, and validates the merged schedule', async () => {
    const ev = await makeEvent(org);
    const b = (await book(att, ev.id, 1)).body.booking;
    const bad = await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ endsAt: new Date(Date.parse(ev.startsAt) - 1000).toISOString() });
    expect(bad.status).toBe(422);
    const ok = await http().patch(`/api/organizer/events/${ev.id}`).set(org.auth).send({ location: 'New Venue' });
    expect(ok.body.event.detailsChangedAt).toBeTruthy();
    const seen = await http().get(`/api/bookings/${b.id}`).set(att.auth);
    expect(seen.body.booking.event.location).toBe('New Venue');
    expect(seen.body.booking.event.detailsChangedAt).toBeTruthy();
  });
});

describe('discovery & filtering (database-backed)', () => {
  it('searches, filters, sorts and paginates', async () => {
    await makeEvent(org, { title: 'Jazz Night', category: 'Music', location: 'Bengaluru', ...when(24) });
    await makeEvent(org, { title: 'Rock Fest', category: 'Music', location: 'Mumbai', ...when(72) });
    await makeEvent(org, { title: 'Python Meetup', category: 'Technology', location: 'Bengaluru', ...when(48) });

    const get = (qs) => http().get(`/api/events?${qs}`);
    expect((await get('q=jazz')).body.items.map((e) => e.title)).toEqual(['Jazz Night']);
    expect((await get('category=music')).body.total).toBe(2);
    expect((await get('location=bengal')).body.total).toBe(2);
    expect((await get('sort=start_desc')).body.items[0].title).toBe('Rock Fest');
    expect((await get('sort=start_asc')).body.items[0].title).toBe('Jazz Night');
    const p2 = (await get('pageSize=2&page=2')).body;
    expect(p2.items).toHaveLength(1);
    expect(p2.totalPages).toBe(2);
    const from = encodeURIComponent(new Date(Date.now() + 40 * 3600_000).toISOString());
    const to = encodeURIComponent(new Date(Date.now() + 60 * 3600_000).toISOString());
    expect((await get(`from=${from}&to=${to}`)).body.items.map((e) => e.title)).toEqual(['Python Meetup']);
    expect((await get('q=%25')).body.total).toBe(0); 
    expect((await get('q=zzzz')).body.items).toEqual([]); 
    expect((await get('from=garbage')).status).toBe(422);
    expect((await get(`from=${to}&to=${from}`)).status).toBe(422);
    expect((await get('sort=hax')).status).toBe(422);
  });
});
