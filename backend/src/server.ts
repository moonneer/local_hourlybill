import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { createStorage } from './storage';
import { handleApi } from './routes/api';
import { resolveSession } from './session';
import * as auth from './services/auth';
import { sendJson } from './utils';
import { PORT, STATIC_DIR, MIME_TYPES } from './config';
import type { RequestWithUserId } from './types';

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> {
  const filePath = path.normalize(path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

function main(): void {
  const storage = createStorage();

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host ?? 'localhost';
    const urlObj = new URL(req.url ?? '/', `http://${host}`);

    if (urlObj.pathname.startsWith('/api/')) {
      try {
        await resolveSession(req as RequestWithUserId);
        await handleApi(req as RequestWithUserId, res, urlObj, storage);
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        const statusCode = e.statusCode ?? 500;
        sendJson(res, statusCode, { error: e.message ?? 'Server error.' });
      }
      return;
    }

    // When auth is configured, redirect unauthenticated users from / and /index.html to login
    if ((urlObj.pathname === '/' || urlObj.pathname === '/index.html') && auth.authAvailable()) {
      await resolveSession(req as RequestWithUserId);
      const reqWithUser = req as RequestWithUserId;
      if (!reqWithUser.userId) {
        const redirectTo = `/login.html${urlObj.search ? `?redirect=${encodeURIComponent(urlObj.pathname + urlObj.search)}` : ''}`;
        res.writeHead(302, { Location: redirectTo });
        res.end();
        return;
      }
    }

    await serveStatic(req, res, urlObj.pathname);
  });

  server.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Time entries editor running at http://localhost:${PORT}`);
  });
}

main();
