import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, validate } from '../utils/http.js';
import { AppError, badRequest } from '../utils/errors.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later' },
});

const dummyHash = bcrypt.hashSync('not-a-real-password', 10);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
  if (!user || !ok) throw new AppError(401, 'Incorrect email or password');
  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(10, 'New password must be at least 10 characters').max(200),
});

router.post('/change-password', requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!user || !(await bcrypt.compare(req.body.current_password, user.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  const hash = await bcrypt.hash(req.body.new_password, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  res.json({ ok: true });
}));

export default router;
