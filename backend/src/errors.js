export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest   = (m, code = 'BAD_REQUEST', d) => new AppError(400, code, m, d);
export const unauthorized = (m = 'Authentication required', code = 'UNAUTHORIZED') => new AppError(401, code, m);
export const forbidden    = (m = 'You do not have permission to do that', code = 'FORBIDDEN') => new AppError(403, code, m);
export const notFound     = (m = 'Resource not found', code = 'NOT_FOUND') => new AppError(404, code, m);
export const conflict     = (m, code = 'CONFLICT', d) => new AppError(409, code, m, d);
export const validation   = (details) => new AppError(422, 'VALIDATION_ERROR', 'Some fields are invalid', details);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
