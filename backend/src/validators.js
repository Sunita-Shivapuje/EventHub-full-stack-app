import { z } from 'zod';
import { validation } from './errors.js';
import { MAX_TICKETS_PER_BOOKING } from './domain/rules.js';

const text = (max) => z.string({ required_error: 'Required' }).trim().min(1, 'Required').max(max, `Max ${max} characters`);
const isoDate = z.string({ required_error: 'Required' }).datetime({ offset: true, message: 'Must be an ISO-8601 date-time' });

export const registerSchema = z.object({
  name: text(100),
  email: z.string({ required_error: 'Required' }).trim().toLowerCase().email('Enter a valid email').max(254),
  password: z.string({ required_error: 'Required' }).min(8, 'At least 8 characters').max(128),
  role: z.enum(['attendee', 'organizer'], { errorMap: () => ({ message: 'Role must be attendee or organizer' }) }),
});

export const loginSchema = z.object({
  email: z.string({ required_error: 'Required' }).trim().toLowerCase().email('Enter a valid email'),
  password: z.string({ required_error: 'Required' }).min(1, 'Required'),
});


export const eventFieldsSchema = z.object({
  title: text(200),
  description: z.string().max(5000).default(''),
  category: text(60),
  location: text(200),
  startsAt: isoDate,
  endsAt: isoDate,
  capacity: z.number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number').positive('Must be at least 1').max(1_000_000),
  priceCents: z.number({ required_error: 'Required', invalid_type_error: 'Must be a number' })
    .int('Must be a whole number of cents').min(0, 'Cannot be negative').max(100_000_000),
});
export const eventUpdateSchema = eventFieldsSchema.partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

export const bookingSchema = z.object({
  quantity: z.number({ required_error: 'Required', invalid_type_error: 'Must be a whole number' })
    .int('Must be a whole number').min(1, 'Must be at least 1')
    .max(MAX_TICKETS_PER_BOOKING, `You can book at most ${MAX_TICKETS_PER_BOOKING} tickets at once`),
});

export const listEventsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['start_asc', 'start_desc']).default('start_asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
}).refine((o) => !o.from || !o.to || new Date(o.from) <= new Date(o.to), { message: '"from" must not be after "to"', path: ['to'] });

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['confirmed', 'cancelled']).optional(),
});


export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const details = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  throw validation(details);
}
