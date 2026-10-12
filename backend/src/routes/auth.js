import { Router } from 'express';
import { wrap, authenticate } from '../middleware/auth.js';
import { parse, registerSchema, loginSchema } from '../validators.js';
import * as auth from '../services/authService.js';

const r = Router();
r.post('/register', wrap(async (req, res) => res.status(201).json(await auth.register(parse(registerSchema, req.body)))));
r.post('/login', wrap(async (req, res) => res.json(await auth.login(parse(loginSchema, req.body)))));
r.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
export default r;
