import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { config } from '../config.js';
import { conflict, unauthorized } from '../errors.js';
import { signToken } from '../middleware/auth.js';

const publicUser = (r) => ({ id: r.id, name: r.name, email: r.email, role: r.role });

export async function register({ name, email, password, role }) {
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, hash, role],
    );
    return { user: publicUser(rows[0]), token: signToken(rows[0]) };
  } catch (err) {
    if (err.code === '23505') throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
}

export async function login({ email, password }) {
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const ok = rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash));

  if (!ok) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  return { user: publicUser(rows[0]), token: signToken(rows[0]) };
}
