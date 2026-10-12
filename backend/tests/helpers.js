import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

export const app = createApp();
export const http = () => request(app);

export const resetDb = () => pool.query('TRUNCATE bookings, events, users RESTART IDENTITY CASCADE');

export async function signup(role, name = `${role} user`) {
  const email = `${role}-${randomUUID().slice(0, 8)}@test.dev`;
  const res = await http().post('/api/auth/register').send({ name, email, password: 'Password123!', role });
  if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

const HOUR = 3_600_000;
export const when = (hoursFromNow, durationHours = 2) => ({
  startsAt: new Date(Date.now() + hoursFromNow * HOUR).toISOString(),
  endsAt: new Date(Date.now() + (hoursFromNow + durationHours) * HOUR).toISOString(),
});

export const eventBody = (o = {}) => ({
  title: 'Test Event', description: 'desc', category: 'Music', location: 'Test Hall',
  ...when(48), capacity: 10, priceCents: 1000, ...o,
});

export async function makeEvent(org, overrides = {}, { publish = true } = {}) {
  const res = await http().post('/api/organizer/events').set(org.auth).send(eventBody(overrides));
  if (res.status !== 201) throw new Error(`createEvent failed: ${JSON.stringify(res.body)}`);
  const event = res.body.event;
  if (publish) {
    const p = await http().post(`/api/organizer/events/${event.id}/publish`).set(org.auth);
    if (p.status !== 200) throw new Error(`publish failed: ${JSON.stringify(p.body)}`);
    return p.body.event;
  }
  return event;
}

export const book = (att, eventId, quantity, key) => {
  const r = http().post(`/api/events/${eventId}/bookings`).set(att.auth);
  if (key) r.set('Idempotency-Key', key);
  return r.send({ quantity });
};

export const eventRow = async (id) => (await pool.query('SELECT * FROM events WHERE id = $1', [id])).rows[0];
export const bookingCount = async (eventId) =>
  (await pool.query('SELECT count(*)::int AS n FROM bookings WHERE event_id = $1', [eventId])).rows[0].n;
export const confirmedTickets = async (eventId) =>
  (await pool.query(`SELECT COALESCE(SUM(quantity),0)::int AS n FROM bookings WHERE event_id = $1 AND status = 'confirmed'`, [eventId])).rows[0].n;
