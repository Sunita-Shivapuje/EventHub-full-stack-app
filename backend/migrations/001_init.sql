

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('attendee', 'organizer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id       UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title              TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
  description        TEXT        NOT NULL DEFAULT '',
  category           TEXT        NOT NULL CHECK (length(btrim(category)) > 0),
  location           TEXT        NOT NULL CHECK (length(btrim(location)) > 0),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  capacity           INTEGER     NOT NULL CHECK (capacity > 0),

  reserved_count     INTEGER     NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  price_cents        INTEGER     NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status             TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  details_changed_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_time_range   CHECK (ends_at > starts_at),
  CONSTRAINT events_no_oversell  CHECK (reserved_count <= capacity)
);
CREATE INDEX events_status_starts_idx ON events (status, starts_at);
CREATE INDEX events_organizer_idx     ON events (organizer_id);
CREATE INDEX events_category_idx      ON events (lower(category));

CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT        NOT NULL,
  attendee_id         UUID        NOT NULL REFERENCES users (id)  ON DELETE RESTRICT,
  event_id            UUID        NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  quantity            INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price_cents    INTEGER     NOT NULL CHECK (unit_price_cents >= 0),
  total_cents         BIGINT      NOT NULL CHECK (total_cents >= 0),
  status              TEXT        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancellation_reason TEXT        CHECK (cancellation_reason IN ('attendee_cancelled', 'event_cancelled')),
  cancelled_at        TIMESTAMPTZ,
  idempotency_key     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_reference_unique   UNIQUE (reference),
  CONSTRAINT bookings_idempotency_unique UNIQUE (attendee_id, idempotency_key),
  CONSTRAINT bookings_total_matches      CHECK (total_cents = unit_price_cents::bigint * quantity),
  CONSTRAINT bookings_cancel_consistent  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX bookings_attendee_idx ON bookings (attendee_id, created_at DESC);
CREATE INDEX bookings_event_idx    ON bookings (event_id, status);
