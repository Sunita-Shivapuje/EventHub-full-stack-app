import { AppError } from '../errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}


export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  console.error(`[error] ${req.method} ${req.originalUrl} -> ${err.code || ''} ${err.message}`);
  if (!config.isProd && !config.isTest) console.error(err.stack);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } });
}
