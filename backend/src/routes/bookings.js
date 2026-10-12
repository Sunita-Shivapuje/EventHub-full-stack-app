import { Router } from 'express';
import { wrap, authenticate, requireRole } from '../middleware/auth.js';
import { parse, pageSchema } from '../validators.js';
import * as bookings from '../services/bookingService.js';

const r = Router();
r.use(authenticate, requireRole('attendee'));

r.get('/', wrap(async (req, res) => res.json(await bookings.listAttendeeBookings(req.user.id, parse(pageSchema, req.query)))));
r.get('/:id', wrap(async (req, res) => res.json({ booking: await bookings.getAttendeeBooking(req.user.id, req.params.id) })));
r.post('/:id/cancel', wrap(async (req, res) => res.json({ booking: await bookings.cancelBooking(req.user.id, req.params.id) })));

export default r;
