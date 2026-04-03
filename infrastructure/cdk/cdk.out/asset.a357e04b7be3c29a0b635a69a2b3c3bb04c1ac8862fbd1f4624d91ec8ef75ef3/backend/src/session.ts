import type { IncomingMessage } from 'http';
import type { RequestWithUserId } from './types';
import { getSession } from './services/auth';

const COOKIE_NAME = 'session';

function parseCookie(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function getSessionTokenFromRequest(req: IncomingMessage): string | undefined {
  const cookie = parseCookie(req.headers.cookie);
  const fromCookie = cookie[COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

/** Resolves session from cookie or Authorization and sets req.userId if valid. */
export async function resolveSession(req: RequestWithUserId): Promise<void> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return;
  const session = await getSession(token);
  if (session) req.userId = session.userId;
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}
