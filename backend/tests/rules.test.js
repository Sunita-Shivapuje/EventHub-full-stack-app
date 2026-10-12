import { describe, it, expect } from 'vitest';
import {
  canTransitionEvent, canTransitionBooking, calcTotalCents, cancellationEligibility, validateSchedule,
} from '../src/domain/rules.js';

describe('event lifecycle rules (unit)', () => {
  it('allows the documented transitions', () => {
    expect(canTransitionEvent('draft', 'published')).toBe(true);
    expect(canTransitionEvent('draft', 'cancelled')).toBe(true);
    expect(canTransitionEvent('published', 'completed')).toBe(true);
    expect(canTransitionEvent('published', 'cancelled')).toBe(true);
  });
  it('rejects invalid transitions and treats completed/cancelled as terminal', () => {
    expect(canTransitionEvent('draft', 'completed')).toBe(false);
    expect(canTransitionEvent('completed', 'published')).toBe(false);
    expect(canTransitionEvent('cancelled', 'published')).toBe(false);
    expect(canTransitionEvent('cancelled', 'draft')).toBe(false);
    expect(canTransitionEvent('nonsense', 'published')).toBe(false);
  });
  it('booking can only go confirmed -> cancelled', () => {
    expect(canTransitionBooking('confirmed', 'cancelled')).toBe(true);
    expect(canTransitionBooking('cancelled', 'confirmed')).toBe(false);
    expect(canTransitionBooking('cancelled', 'cancelled')).toBe(false);
  });
});

describe('schedule validation (unit)', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  it('rejects end <= start', () => {
    expect(validateSchedule({ startsAt: '2030-02-01T10:00:00Z', endsAt: '2030-02-01T10:00:00Z' }).endsAt).toBeTruthy();
    expect(validateSchedule({ startsAt: '2030-02-01T10:00:00Z', endsAt: '2030-02-01T09:00:00Z' }).endsAt).toBeTruthy();
  });
  it('accepts a valid range and can require a future start', () => {
    expect(validateSchedule({ startsAt: '2030-02-01T10:00:00Z', endsAt: '2030-02-01T12:00:00Z' })).toEqual({});
    expect(validateSchedule({ startsAt: '2029-12-01T10:00:00Z', endsAt: '2029-12-01T12:00:00Z' }, { requireFuture: true, now }).startsAt).toBeTruthy();
  });
});

describe('money and cancellation policy (unit)', () => {
  it('computes totals in integer cents with no float drift', () => {
    expect(calcTotalCents(1999, 3)).toBe(5997);
    expect(calcTotalCents(10, 3)).toBe(30); 
    expect(calcTotalCents(0, 5)).toBe(0);
  });
  const base = { bookingStatus: 'confirmed', eventStatus: 'published', eventStartsAt: '2030-01-02T00:00:00Z' };
  const now = new Date('2030-01-01T00:00:00Z');
  it('allows cancelling a confirmed booking before the event starts', () => {
    expect(cancellationEligibility(base, now).ok).toBe(true);
  });
  it('blocks already-cancelled, cancelled-event, completed-event and past-cutoff bookings', () => {
    expect(cancellationEligibility({ ...base, bookingStatus: 'cancelled' }, now).code).toBe('ALREADY_CANCELLED');
    expect(cancellationEligibility({ ...base, eventStatus: 'cancelled' }, now).code).toBe('EVENT_CANCELLED');
    expect(cancellationEligibility({ ...base, eventStatus: 'completed' }, now).code).toBe('EVENT_COMPLETED');
    expect(cancellationEligibility({ ...base, eventStartsAt: '2029-12-31T23:00:00Z' }, now).code).toBe('CANCELLATION_CUTOFF_PASSED');
  });
});
