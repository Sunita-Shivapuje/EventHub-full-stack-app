EventHub

Event discovery and ticket reservation. Organizers create, publish and manage events; attendees search events, reserve tickets, and view or cancel their bookings. A booking is a reservation only. No payment is taken.

Stack: React + Vite + Tailwind CSS, Node.js (Express), PostgreSQL, Zod for validation, JWT in an httpOnly cookie, Vitest + Supertest for tests.

Live app: add URL | Repo: add URL

Run locally

Needs Node 20+ and PostgreSQL 13+.

bash
# backend
cd backend
cp .env.example .env        # then edit DATABASE_URL
npm install
npm run migrate             # create tables
npm run seed                # demo users and events
npm run dev                 # API on :4000

# frontend (second terminal)
cd frontend
npm install
npm run dev                 # app on :5173, proxies /api to :4000

Demo logins (seeded, fake data): attendee@eventhub.demo / Attendee123! and organizer@eventhub.demo / Organizer123!. A second organizer (organizer2@eventhub.demo, same password) is there for checking ownership rules. You can also register either role on the sign-up page.

Environment variables
Variable	Purpose
DATABASE_URL	Postgres connection string (DATABASE_SSL=true if the host needs TLS)
TEST_DATABASE_URL	Separate database for tests. Tables get truncated, so the name must contain "test"
JWT_SECRET	Long random string. Required in production
CORS_ORIGINS, COOKIE_SAMESITE, COOKIE_SECURE	Only needed if frontend and API are on different sites
SERVE_FRONTEND, RUN_MIGRATIONS	Production single-service mode (see Deployment)
MAX_TICKETS_PER_BOOKING, CANCELLATION_CUTOFF_HOURS, DEFAULT_CURRENCY	Business rules (defaults: 10, 0, INR)
Tests
bash
cd backend && npm test     # needs TEST_DATABASE_URL

131 backend tests run against a real Postgres database: unit tests for the rules and validation, API tests for permissions and booking behaviour, and concurrency tests that fire parallel requests (for example 25 buyers for 5 seats, and two buyers wanting 4 of the last 5). The atomicity test forces a failure after the booking row is written and checks nothing survives. I also temporarily removed the row lock to confirm the concurrency tests fail without it. cd frontend && npm test covers the money and date helpers.

Core data model
users 1 ──< events 1 ──< bookings >── 1 users
(organizer)                          (attendee)
Table	Main columns
users	id, name, email (unique, case-insensitive), password_hash, role (attendee / organizer)
events	id, organizer_id, title, description, category, location, start_time, end_time, capacity, price_cents, currency, status, schedule_changed_at, cancelled_at
bookings	id, reference (unique), attendee_id, event_id, quantity, unit_price_cents, total_cents, currency, status, cancelled_at, cancelled_reason, idempotency_key
Money is stored as integer minor units, never floats. Times are timestamptz (UTC); the browser shows and enters local time.
Database checks back up the app rules: capacity > 0, price_cents >= 0, end_time > start_time, quantity > 0, total_cents = quantity * unit_price_cents, and cancelled bookings must carry a cancel time and reason.
UNIQUE (attendee_id, idempotency_key) makes retries safe. Foreign keys use ON DELETE RESTRICT, so history is never lost.
Indexes cover event status and start time, organizer, category, and bookings by attendee and by event (a partial index covers confirmed bookings only).
Remaining capacity is not stored. It is always capacity - SUM(quantity) over confirmed bookings, so it cannot drift.
How overbooking is prevented

Booking runs in one transaction:

SELECT ... FROM events WHERE id = $1 FOR UPDATE locks the event row. Concurrent bookings for that event queue here.
Remaining capacity is recalculated from confirmed bookings.
If the event is not published, has started, or the quantity does not fit, the request is rejected and nothing is written.
The booking is inserted with the current price copied in and the total computed on the server.

Any error rolls the whole transaction back. Editing capacity and cancelling an event take the same event lock, so they cannot interleave with a booking.

Cancellation locks the booking row and runs UPDATE ... WHERE status = 'confirmed'. Because capacity is derived from confirmed bookings, flipping the status is the release, and a repeated or simultaneous cancel can only succeed once.

Double clicks and retries: the UI disables the button while a request is in flight and sends one Idempotency-Key per booking attempt. A repeat returns the original booking (HTTP 200) instead of creating another.

Rules
Event lifecycle: draft to published or cancelled; published to draft (only with no confirmed bookings), completed, or cancelled. Completed and cancelled are final. Status can only change through the publish / unpublish / cancel endpoints, never through a request body. Published events past their end time read as completed immediately and are saved as completed by a background sweep.
Editing: draft and published events only. Capacity cannot go below tickets already booked. Changing time or venue when bookings exist stamps schedule_changed_at, and attendees see a notice.
Cancelling an event: its confirmed bookings become cancelled with reason event_cancelled. Rows are kept, so history stays visible.
Booking: whole number from 1 to 10, event published and not yet started.
Cancellation cutoff: attendees can cancel until the event starts (configurable). The API explains why when it refuses, and the UI shows that message.
Roles: an organizer can do everything an attendee can, plus manage their own events. Role is read from the database on every request.
Dashboard metrics: capacity; tickets reserved (sum of confirmed quantities); remaining; confirmed and cancelled booking counts; reserved value (sum of confirmed totals, from price snapshots, not money collected); cancelled value.
API

Errors look like { "error": { "code", "message", "details?" } }. Status codes: 400 validation, 401 not signed in, 403 wrong role or not your event, 404 not found (including other people's bookings and drafts), 409 conflicts such as sold out or invalid transition, 422 reused idempotency key.

Route	Who	Purpose
POST /api/auth/register, /login, /logout; GET /api/auth/me	any	Session
GET /api/events?q&category&location&from&to&sort&page&pageSize	public	Published upcoming events
GET /api/events/:id, GET /api/categories	public	Detail (drafts only for owner), filter list
POST /api/events, PATCH /api/events/:id	organizer	Create, edit own event
POST /api/events/:id/publish, /unpublish, /cancel	organizer	Lifecycle
GET /api/organizer/events, GET /api/events/:id/summary, GET /api/events/:id/bookings	organizer (owner)	Dashboard
POST /api/bookings (+ Idempotency-Key), GET /api/bookings, GET /api/bookings/:id, POST /api/bookings/:id/cancel	signed in (own)	Book, history, cancel
GET /api/health	public	Database check
Deployment

The API can serve the built frontend, so one service is enough. On Render or similar, create a Postgres database, then:

Build: npm --prefix frontend ci && npm --prefix frontend run build && npm --prefix backend ci
Start: npm --prefix backend start
Env: NODE_ENV=production, DATABASE_URL, JWT_SECRET, SERVE_FRONTEND=true, RUN_MIGRATIONS=true, plus DATABASE_SSL=true if required. Health check path: /api/health.
Run npm run seed once in the backend shell to load the demo accounts.

Free tiers sleep when idle, so the first request after a pause can take up to a minute.

Trade-offs and known gaps
Anyone can pick the organizer role at sign-up. Fine for an assessment, not for production.
Not built: email verification, password reset, refresh tokens, payments or refunds, waitlists, notifications, an admin role. Login and register are rate limited; other routes are not.
Search uses ILIKE. For a large catalogue, switch to pg_trgm or full-text search.
Date filters in the UI use the browser's local day; the API treats plain dates as UTC days.
Cancelling an event cancels its bookings automatically; there is no refund step because no payment exists.

AI USED 
I used Claude AI as a supporting tool to help me develop the EventHub project, understand technical concepts, and resolve coding errors.
Claude AI also assisted with debugging, improving the code, and troubleshooting deployment issues throughout the project.