import { Router } from 'express';
import { wrap, authenticate, requireRole } from '../middleware/auth.js';
import { parse, eventFieldsSchema, eventUpdateSchema, pageSchema } from '../validators.js';
import * as events from '../services/eventService.js';
import * as bookings from '../services/bookingService.js';

const r = Router();
r.use(authenticate, requireRole('organizer')); 

r.get('/events', wrap(async (req, res) => res.json({ events: await events.listOrganizerEvents(req.user.id) })));
r.post('/events', wrap(async (req, res) => {
  
  res.status(201).json({ event: await events.createEvent(req.user.id, parse(eventFieldsSchema, req.body)) });
}));
r.get('/events/:id', wrap(async (req, res) => {
  const row = await events.getOwnedEvent(req.user.id, req.params.id);
  res.json({ event: events.mapEvent(row) });
}));
r.patch('/events/:id', wrap(async (req, res) => {
  res.json({ event: await events.updateEvent(req.user.id, req.params.id, parse(eventUpdateSchema, req.body)) });
}));
r.post('/events/:id/publish', wrap(async (req, res) => res.json({ event: await events.publishEvent(req.user.id, req.params.id) })));
r.post('/events/:id/unpublish', wrap(async (req, res) => res.json({ event: await events.unpublishEvent(req.user.id, req.params.id) })));
r.post('/events/:id/cancel', wrap(async (req, res) => res.json({ event: await events.cancelEvent(req.user.id, req.params.id) })));
r.get('/events/:id/summary', wrap(async (req, res) => res.json({ summary: await events.getEventSummary(req.user.id, req.params.id) })));
r.get('/events/:id/bookings', wrap(async (req, res) => {
  res.json(await bookings.listEventBookings(req.user.id, req.params.id, parse(pageSchema, req.query)));
}));

export default r;
