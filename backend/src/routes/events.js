import { Router } from 'express';
import { wrap, authenticate, optionalAuth, requireRole } from '../middleware/auth.js';
import { parse, listEventsSchema, bookingSchema } from '../validators.js';
import { badRequest } from '../errors.js';
import * as events from '../services/eventService.js';
import * as bookings from '../services/bookingService.js';

const r = Router();

r.get('/', wrap(async (req, res) => res.json(await events.listPublicEvents(parse(listEventsSchema, req.query)))));
r.get('/categories', wrap(async (_req, res) => res.json({ categories: await events.listCategories() })));
r.get('/:id', optionalAuth, wrap(async (req, res) => res.json({ event: await events.getEventForViewer(req.params.id, req.user) })));


r.post('/:id/bookings', authenticate, requireRole('attendee'), wrap(async (req, res) => {
  const { quantity } = parse(bookingSchema, req.body);
  const key = req.get('Idempotency-Key') || null;
  if (key && !/^[\w.:-]{8,100}$/.test(key)) throw badRequest('Idempotency-Key must be 8-100 URL-safe characters', 'INVALID_IDEMPOTENCY_KEY');
  const { booking, replayed } = await bookings.createBooking(req.user, req.params.id, quantity, key);
  res.status(replayed ? 200 : 201).json({ booking, replayed });
}));

export default r;
