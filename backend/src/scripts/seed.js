
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { createBooking } from '../services/bookingService.js';

const PASSWORD = 'Password123!';
const day = 86_400_000;
const at = (days, hour = 18) => {
  const d = new Date(Date.now() + days * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

async function upsertUser(name, email, role, hash) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
    [name, email, hash, role],
  );
  return rows[0]?.id ?? null;
}

const hash = await bcrypt.hash(PASSWORD, config.bcryptRounds);
const org1 = await upsertUser('Olivia Organizer', 'organizer@example.com', 'organizer', hash);
const org2 = await upsertUser('Omar Organizer', 'organizer2@example.com', 'organizer', hash);
const att1 = await upsertUser('Alex Attendee', 'attendee@example.com', 'attendee', hash);
const att2 = await upsertUser('Asha Attendee', 'attendee2@example.com', 'attendee', hash);

if (!org1) {
  console.log('Demo data already present - nothing to do.');
} else {
  const events = [
    [org1, 'Indie Music Night', 'An evening of live indie bands.', 'Music', 'Blue Door Club, Bengaluru', at(5), at(5, 22), 120, 1500, 'published'],
    [org1, 'Intro to Rust Workshop', 'Hands-on beginner workshop. Bring a laptop.', 'Technology', 'Cowork Hub, Indiranagar', at(9, 9), at(9, 13), 5, 0, 'published'],
    [org1, 'Sunday Farmers Market', 'Local produce, bakers and coffee.', 'Food', 'Cubbon Park Lawn', at(14, 7), at(14, 12), 300, 0, 'published'],
    [org1, 'Startup Pitch Evening', 'Ten founders, five minutes each.', 'Business', 'The Hive, Koramangala', at(20, 17), at(20, 20), 80, 2500, 'draft'],
    [org2, 'Trail Run 10K', 'Scenic 10K trail run with chip timing.', 'Sports', 'Nandi Hills base camp', at(12, 5), at(12, 9), 200, 800, 'published'],
    [org2, 'Watercolour for Beginners', 'Relaxed two-hour painting class.', 'Art', 'Studio 9, Jayanagar', at(7, 11), at(7, 13), 12, 1200, 'published'],
  ];
  const ids = [];
  for (const e of events) {
    const { rows } = await pool.query(
      `INSERT INTO events (organizer_id, title, description, category, location, starts_at, ends_at, capacity, price_cents, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, e);
    ids.push(rows[0].id);
  }

  await createBooking({ id: att1 }, ids[0], 2);
  await createBooking({ id: att2 }, ids[0], 4);
  await createBooking({ id: att1 }, ids[1], 3);
  await createBooking({ id: att2 }, ids[4], 1);
  console.log('Seeded 4 demo users, 6 events and sample bookings.');
}
console.log(`Demo logins (password for all: ${PASSWORD})`);
console.log('  organizer: organizer@example.com   (and organizer2@example.com)');
console.log('  attendee:  attendee@example.com    (and attendee2@example.com)');
await pool.end();
