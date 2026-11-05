import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { User } from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';

const derive = promisify(scrypt);
const COOKIE = 'copilot_session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
type UserRow = User & { salt: string; password_hash: string };
export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(
  db: AppDatabase,
  demo: boolean,
  onDemoCreated?: (user: User) => Promise<void>,
) {
  const credentials = z.object({
    email: z
      .email()
      .max(160)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(256),
  });
  function current(cookie: string | undefined): User | null {
    const token = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!token) return null;
    return (
      (db
        .prepare(
          'SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
        )
        .get(hashToken(token), Date.now()) as User | undefined) ?? null
    );
  }
  function requireUser(req: Request): User {
    const user = current(req.headers.cookie);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
    return user;
  }
  function start(user: User, res: Response, secure: boolean) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      hashToken(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      maxAge: 7 * 86400000,
      path: '/',
    });
    return user;
  }
  async function register(name: string, email: string, password: string) {
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with that email already exists.');
    const salt = randomBytes(16).toString('hex'),
      passwordHash = ((await derive(password, salt, 64)) as Buffer).toString('hex');
    const user: User = { id: randomUUID(), name, email };
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id, name, email, salt, passwordHash);
    return user;
  }
  function findPublicUser(value: string, byEmail = false): User | null {
    return (
      (db
        .prepare(`SELECT id,name,email FROM users WHERE ${byEmail ? 'email' : 'id'}=?`)
        .get(value) as User | undefined) ?? null
    );
  }
  async function login(email: string, password: string) {
    const user = db
      .prepare('SELECT id,name,email,salt,password_hash FROM users WHERE email=?')
      .get(email) as UserRow | undefined;
    const computed = (await derive(password, user?.salt ?? 'missing-user-salt', 64)) as Buffer;
    if (!user || !timingSafeEqual(computed, Buffer.from(user.password_hash, 'hex')))
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    return { id: user.id, name: user.name, email: user.email };
  }
  function logout(cookie: string | undefined) {
    const token = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  }
  const router = Router();
  router.get('/me', (req, res) => res.json({ user: current(req.headers.cookie), demo }));
  router.post('/auth/register', async (req, res) => {
    const input = credentials.extend({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    res.status(201).json({
      user: start(await register(input.name, input.email, input.password), res, req.secure),
    });
  });
  router.post('/auth/login', async (req, res) => {
    const input = credentials.parse(req.body);
    res.json({ user: start(await login(input.email, input.password), res, req.secure) });
  });
  router.post('/auth/demo', async (req, res) => {
    if (!demo) throw new AppError(404, 'NOT_FOUND', 'Demo mode is disabled.');
    const email = `demo-${randomUUID()}@demo.example`,
      name = z
        .string()
        .trim()
        .min(1)
        .max(60)
        .parse(req.body?.name ?? 'Demo user');
    const user = await register(name, email, randomBytes(24).toString('hex'));
    await onDemoCreated?.(user);
    res.json({ user: start(user, res, req.secure) });
  });
  router.post('/auth/logout', (req, res) => {
    logout(req.headers.cookie);
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  });
  return { router, current, requireUser, findPublicUser };
}
