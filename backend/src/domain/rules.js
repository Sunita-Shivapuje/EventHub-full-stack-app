

export const MAX_TICKETS_PER_BOOKING = 10;

export const EVENT_STATUSES = ['draft', 'published', 'completed', 'cancelled'];


export const EVENT_TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['draft', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const canTransitionEvent = (from, to) => (EVENT_TRANSITIONS[from] || []).includes(to);

export const isEventEditable = (status) => status === 'draft' || status === 'published';


export const BOOKING_TRANSITIONS = { confirmed: ['cancelled'], cancelled: [] };
export const canTransitionBooking = (from, to) => (BOOKING_TRANSITIONS[from] || []).includes(to);


export const calcTotalCents = (unitPriceCents, quantity) => unitPriceCents * quantity;


export function cancellationEligibility({ bookingStatus, eventStatus, eventStartsAt }, now = new Date()) {
  if (bookingStatus === 'cancelled') {
    return { ok: false, code: 'ALREADY_CANCELLED', message: 'This booking is already cancelled.' };
  }
  if (eventStatus === 'cancelled') {
    return { ok: false, code: 'EVENT_CANCELLED', message: 'The organizer cancelled this event.' };
  }
  if (eventStatus === 'completed') {
    return { ok: false, code: 'EVENT_COMPLETED', message: 'This event has already taken place.' };
  }
  if (new Date(eventStartsAt) <= now) {
    return { ok: false, code: 'CANCELLATION_CUTOFF_PASSED', message: 'Cancellations close when the event starts.' };
  }
  return { ok: true };
}


export function validateSchedule({ startsAt, endsAt }, { requireFuture = false, now = new Date() } = {}) {
  const errors = {};
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  if (Number.isNaN(s.getTime())) errors.startsAt = 'Start time is not a valid date';
  if (Number.isNaN(e.getTime())) errors.endsAt = 'End time is not a valid date';
  if (!errors.startsAt && !errors.endsAt && e <= s) errors.endsAt = 'End time must be after the start time';
  if (!errors.startsAt && requireFuture && s <= now) errors.startsAt = 'Start time must be in the future';
  return errors;
}
