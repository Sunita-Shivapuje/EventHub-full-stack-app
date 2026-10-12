import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db.js';
import { wrap } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import organizerRoutes from './routes/organizer.js';
import bookingRoutes from './routes/bookings.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', wrap(async (_req, res) => {
    await query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/organizer', organizerRoutes);
  app.use('/api/bookings', bookingRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
