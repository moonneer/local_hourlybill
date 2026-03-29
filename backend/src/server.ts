import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createStorage } from './storage';
import { handleApi } from './routes/api';
import { resolveSession } from './session';
import { sendJson } from './utils';
import { PORT, STATIC_DIR, MIME_TYPES } from './config';
import type { RequestWithUserId } from './types';

const isDev = process.env.NODE_ENV === 'development';

/** Check if the static dist directory exists (only relevant in production). */
function staticDirExists(): boolean {
  try {
    return fsSync.statSync(STATIC_DIR).isDirectory();
  } catch {
    return false;
  }
}

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> {
  const safePathname = pathname === '/' ? 'index.html' : pathname;
  const filePath = path.normalize(path.join(STATIC_DIR, safePathname));
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
    // SPA fallback: serve index.html for client-side routing
    try {
      const indexPath = path.join(STATIC_DIR, 'index.html');
      const data = await fs.readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  }
}

function main(): void {
  const storage = createStorage();
  const serveFiles = !isDev && staticDirExists();

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

    if (serveFiles) {
      await serveStatic(req, res, urlObj.pathname);
      return;
    }

    // Dev mode: Vite handles the frontend
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found — in dev mode, the Vite server handles the frontend.');
  });

  server.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`HourlyBill API server running at http://localhost:${PORT}`);
  });
}

main();
