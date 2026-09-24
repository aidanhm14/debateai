import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const COOKIE = '__Host-debatable-lab';
export const SESSION_SECONDS = 8 * 60 * 60;
export function authConfig(raw = process.env.SYNTHETIC_LAB_AUTH) {
  try {
    const c = JSON.parse(raw || '{}');
    if (!/^[a-f0-9]{32}$/.test(c.salt) || !/^[a-f0-9]{64}$/.test(c.hash) || !/^[a-f0-9]{64}$/.test(c.key)) return null;
    return c;
  } catch { return null; }
}
export async function verifyPassword(password, config) {
  if (!config || typeof password !== 'string' || password.length > 256) return false;
  const actual = await derive(password, config.salt, 32);
  return timingSafeEqual(actual, Buffer.from(config.hash, 'hex'));
}
const mac = (value, config) => createHmac('sha256', config.key).update(value).digest('base64url');
export function issueSession(config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, id: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${mac(payload, config)}`;
}
export function readSession(cookie, config, now = Date.now()) {
  if (!config || typeof cookie !== 'string' || cookie.length > 16000) return null;
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || token.length > 512) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const wanted = mac(payload, config), a = Buffer.from(signature), b = Buffer.from(wanted);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    return Number.isInteger(value.exp) && value.exp > seconds && value.exp <= seconds + SESSION_SECONDS && /^[a-f0-9]{32}$/.test(value.id) ? value : null;
  } catch { return null; }
}
export function sessionCookie(token = '') {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? SESSION_SECONDS : 0}`;
}
export function permittedOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === 'https://itsdebatable.com' || (process.env.CONTEXT !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || ''));
}
