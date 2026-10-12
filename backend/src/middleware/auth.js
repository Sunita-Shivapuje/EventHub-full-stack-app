import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { unauthorized, forbidden } from '../errors.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}


async function loadUser(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Your session is invalid or has expired', 'INVALID_TOKEN');
  }
  const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.sub]);
  if (!rows.length) throw unauthorized('Your session is invalid or has expired', 'INVALID_TOKEN');
  return rows[0];
}

export const authenticate = wrap(async (req, _res, next) => {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
});


export const optionalAuth = wrap(async (req, _res, next) => {
  req.user = (await loadUser(req)) || null;
  next();
});

export const requireRole = (role) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== role) return next(forbidden(`This action requires an ${role} account`, 'WRONG_ROLE'));
  next();
};
