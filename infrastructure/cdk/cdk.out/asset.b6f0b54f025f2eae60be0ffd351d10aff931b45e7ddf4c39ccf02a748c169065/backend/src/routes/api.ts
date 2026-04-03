import path from 'path';
import fs from 'fs/promises';
import fsNative from 'fs';
import { spawn } from 'child_process';
import type { URL } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Browser } from 'playwright';
import type { IStorage } from '../storage/types';
import type { RequestWithUserId } from '../types';
import {
  ROOT_DIR,
  STATIC_DIR,
  BACKUP_COUNT,
  TIME_ENTRIES_FILENAME,
  PARSED_EMAILS_FILENAME,
  PIPELINE_LOG_FILENAME,
  PIPELINE_STEPS,
  MIME_TYPES,
} from '../config';
import {
  sendJson,
  sendSseHeaders,
  sendSseEvent,
  buildSenderByEmailId,
  validateQueryEntry,
  safeDownloadName,
  type MessageLike,
} from '../utils';
import * as queries from '../services/queries';
import * as inputs from '../services/inputs';
import * as auth from '../services/auth';
import { getSessionCookieName } from '../session';

const activePipelines = new Map<string, { started_at: number; abort: () => void }>();

function runPixiPython(
  res: ServerResponse,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; onOutput?: (stream: string, chunk: Buffer) => void } = {}
): { child: ReturnType<typeof spawn>; promise: Promise<void> } {
  const { onOutput, env } = options;
  const child = spawn('pixi', args, {
    cwd: ROOT_DIR,
    env: env ?? process.env,
  });
  const promise = new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      sendSseEvent(res, 'log', { stream: 'stdout', text: chunk.toString('utf-8') });
      onOutput?.('stdout', chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      sendSseEvent(res, 'log', { stream: 'stderr', text: chunk.toString('utf-8') });
      onOutput?.('stderr', chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(Object.assign(new Error(`Process terminated with signal ${signal}.`), { code }));
        return;
      }
      if (code !== 0) {
        reject(Object.assign(new Error(`Process exited with code ${code}.`), { code }));
        return;
      }
      resolve();
    });
  });
  return { child, promise };
}

async function collectBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
      if (body.length > maxBytes) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function cookieSecuritySuffix(): string {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function setSessionCookie(res: ServerResponse, token: string, maxAgeSec: number): void {
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${cookieSecuritySuffix()}`
  );
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${getSessionCookieName()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecuritySuffix()}`
  );
}

function parseSessionTokenFromReq(req: IncomingMessage): string | undefined {
  const cookie = (req.headers.cookie ?? '')
    .split(';')
    .find((c) => c.trim().startsWith(`${getSessionCookieName()}=`));
  return cookie ? cookie.split('=')[1]?.trim() : undefined;
}

/** Session-derived user id only in production; optional x-user-id header in non-production for tests. */
function resolveAppUserId(req: RequestWithUserId): string | undefined {
  if (req.userId) return req.userId;
  if (process.env.NODE_ENV !== 'production') {
    const h = req.headers['x-user-id'];
    if (typeof h === 'string' && h.trim()) return h.trim();
  }
  return undefined;
}

async function requireSignedInUser(
  req: RequestWithUserId,
  res: ServerResponse
): Promise<string | null> {
  if (!auth.authAvailable()) {
    sendJson(res, 503, { error: 'Authentication is not configured on this server.' });
    return null;
  }
  const uid = resolveAppUserId(req);
  if (!uid) {
    sendJson(res, 401, { error: 'Sign in required.' });
    return null;
  }
  return uid;
}

export async function handleApi(
  req: RequestWithUserId,
  res: ServerResponse,
  urlObj: URL,
  storage: IStorage
): Promise<void> {
  if (urlObj.pathname === '/api/signup' && req.method === 'POST') {
    const body = await collectBody(req, 10_000);
    let payload: { email?: string; password?: string; firstName?: string; lastName?: string };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    try {
      const user = await auth.createUser(
        String(payload.email ?? ''),
        String(payload.password ?? ''),
        String(payload.firstName ?? ''),
        String(payload.lastName ?? '')
      );
      const { sessionToken, expiresAt } = await auth.createSession(user.userId);
      setSessionCookie(res, sessionToken, 7 * 24 * 60 * 60);
      return void sendJson(res, 201, { user: auth.sanitizeUser(user), sessionToken, expiresAt });
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      return void sendJson(res, e.statusCode ?? 500, { error: e.message ?? 'Signup failed.' });
    }
  }

  if (urlObj.pathname === '/api/login' && req.method === 'POST') {
    const body = await collectBody(req, 10_000);
    let payload: { email?: string; password?: string };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    const email = String(payload.email ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');
    if (!email || !password) {
      return void sendJson(res, 400, { error: 'Email and password are required.' });
    }
    const user = await auth.getUserByEmail(email);
    if (!user || !(await auth.verifyPassword(password, user.passwordHash))) {
      return void sendJson(res, 401, { error: 'Invalid email or password.' });
    }
    const { sessionToken, expiresAt } = await auth.createSession(user.userId);
    setSessionCookie(res, sessionToken, 7 * 24 * 60 * 60);
    return void sendJson(res, 200, { user: auth.sanitizeUser(user), sessionToken, expiresAt });
  }

  if (urlObj.pathname === '/api/logout' && req.method === 'POST') {
    const token = parseSessionTokenFromReq(req);
    if (token) await auth.deleteSession(token);
    clearSessionCookie(res);
    return void sendJson(res, 200, { ok: true });
  }

  if (urlObj.pathname === '/api/me' && req.method === 'GET') {
    if (!auth.authAvailable()) {
      return void sendJson(res, 200, { user: null });
    }
    const uid = resolveAppUserId(req);
    if (!uid) {
      return void sendJson(res, 200, { user: null });
    }
    const user = await auth.getUserById(uid);
    if (!user) {
      const token = parseSessionTokenFromReq(req);
      if (token) await auth.deleteSession(token);
      clearSessionCookie(res);
      return void sendJson(res, 200, { user: null });
    }
    return void sendJson(res, 200, { user: auth.sanitizeUser(user) });
  }

  if (urlObj.pathname === '/api/profile' && req.method === 'GET') {
    if (!auth.authAvailable()) {
      return void sendJson(res, 200, { profile: null });
    }
    const uid = resolveAppUserId(req);
    if (!uid) {
      return void sendJson(res, 200, { profile: null });
    }
    const user = await auth.getUserById(uid);
    if (!user) {
      const token = parseSessionTokenFromReq(req);
      if (token) await auth.deleteSession(token);
      clearSessionCookie(res);
      return void sendJson(res, 200, { profile: null });
    }
    return void sendJson(res, 200, { profile: auth.sanitizeUser(user) });
  }

  if (urlObj.pathname === '/api/profile' && req.method === 'PUT') {
    const uid = resolveAppUserId(req);
    if (!auth.authAvailable() || !uid) {
      return void sendJson(res, 401, { error: 'Sign in required.' });
    }
    const body = await collectBody(req, 50_000);
    let payload: { displayName?: string; avatarUrl?: string };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    const updated = await auth.updateUserProfile(uid, {
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
    });
    if (!updated) return void sendJson(res, 404, { error: 'User not found.' });
    return void sendJson(res, 200, { profile: auth.sanitizeUser(updated) });
  }

  const userId = await requireSignedInUser(req, res);
  if (userId === null) return;

  if (urlObj.pathname === '/api/queries' && req.method === 'GET') {
    const list = await queries.getQueryList(storage, userId);
    return void sendJson(res, 200, { queries: list });
  }

  if (urlObj.pathname === '/api/time-entries-exists' && req.method === 'GET') {
    const queryName = urlObj.searchParams.get('query');
    if (!queryName) {
      return void sendJson(res, 400, { error: 'Missing query parameter.' });
    }
    try {
      const query = await queries.getQueryInfo(storage, userId, queryName);
      const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
      const exists = await storage.fileExists(userId, baseDirInfo.prefix + TIME_ENTRIES_FILENAME);
      return void sendJson(res, 200, { exists });
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      return void sendJson(res, e.statusCode ?? 500, { error: e.message ?? 'Invalid query.' });
    }
  }

  if (urlObj.pathname === '/api/system-senders' && req.method === 'GET') {
    try {
      const data = await storage.readJson(userId, 'system_senders.json');
      return void sendJson(res, 200, data as object);
    } catch {
      return void sendJson(res, 200, { blocked_senders: [], tooltip: 'Unable to access document to estimate time' });
    }
  }

  if (urlObj.pathname === '/api/query-json' && req.method === 'GET') {
    const data = await storage.readJson(userId, 'query.json');
    return void sendJson(res, 200, data as object);
  }

  if (urlObj.pathname === '/api/query-entry' && req.method === 'POST') {
    const body = await collectBody(req, 2_000_000);
    let payload: { query_name?: string; entry?: unknown; is_new?: boolean };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    const queryName = String(payload.query_name ?? '').trim();
    if (!queryName || queryName === 'template') {
      return void sendJson(res, 400, { error: 'query_name is required and cannot be template.' });
    }
    const entry = payload.entry;
    const errors = validateQueryEntry(entry);
    if (errors.length) return void sendJson(res, 400, { error: errors.join(' ') });
    const allQueries = (await storage.readJson(userId, 'query.json')) as Record<string, unknown>;
    if (payload.is_new && allQueries[queryName]) {
      return void sendJson(res, 409, { error: `Query '${queryName}' already exists.` });
    }
    const entryObj = entry as Record<string, unknown>;
    if (!entryObj.requested_timestamp && payload.is_new) {
      entryObj.requested_timestamp = new Date().toISOString();
    }
    allQueries[queryName] = entryObj;
    await storage.writeJson(userId, 'query.json', allQueries);
    return void sendJson(res, 200, { saved: queryName });
  }

  if (urlObj.pathname === '/api/inputs' && req.method === 'GET') {
    const data = await inputs.readInputs(storage, userId);
    return void sendJson(res, 200, data);
  }

  if (urlObj.pathname === '/api/inputs' && req.method === 'POST') {
    const body = await collectBody(req, 100_000);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    try {
      const data = await inputs.updateInputs(storage, userId, payload);
      return void sendJson(res, 200, data);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      return void sendJson(res, e.statusCode ?? 500, { error: e.message ?? 'Failed to update inputs.' });
    }
  }

  if (urlObj.pathname === '/api/logo-upload' && req.method === 'POST') {
    const body = await collectBody(req, 10_000_000);
    let payload: { data_url?: string; filename?: string };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    const dataUrl = String(payload.data_url ?? '');
    const filename = String(payload.filename ?? '').trim();
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return void sendJson(res, 400, { error: 'data_url must be a base64 image data URL.' });
    }
    const mime = match[1].toLowerCase();
    const base64Data = match[2];
    const extFromMime = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '';
    const safeStem = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = extFromMime || (filename.toLowerCase().endsWith('.png') ? '.png' : '.jpg');
    const outputName = `logo_${stamp}${safeStem ? `_${safeStem}` : ''}${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');
    if (storage.useS3()) {
      await storage.writeBuffer(userId, `uploads/${outputName}`, buffer);
    } else {
      const uploadsDir = path.join(STATIC_DIR, 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, outputName), buffer);
    }
    return void sendJson(res, 200, { path: `uploads/${outputName}` });
  }

  if (urlObj.pathname === '/api/run-pipeline' && req.method === 'GET') {
    const queryName = String(urlObj.searchParams.get('query') ?? '').trim();
    req.socket?.setTimeout(0);
    res.socket?.setTimeout(0);
    sendSseHeaders(res);
    if (!queryName) {
      sendSseEvent(res, 'complete', { success: false, error: 'Missing query parameter.' });
      res.end();
      return;
    }
    let query: Record<string, unknown>;
    try {
      query = await queries.getQueryInfo(storage, userId, queryName);
    } catch (err: unknown) {
      const e = err as { message?: string };
      sendSseEvent(res, 'complete', { success: false, error: e.message ?? `Query '${queryName}' not found.` });
      res.end();
      return;
    }
    if (activePipelines.has(queryName)) {
      sendSseEvent(res, 'complete', { success: false, error: `Pipeline already running for '${queryName}'.` });
      res.end();
      return;
    }
    const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
    let logStream: fsNative.WriteStream | null = null;
    const logLines: string[] = [];
    let pipelineFinished = false;
    let clientDisconnected = false;
    const writeLog = (text: string) => {
      logLines.push(text);
      if (logStream && !logStream.destroyed && !logStream.writableEnded) {
        try {
          logStream.write(text);
        } catch {
          // ignore
        }
      }
    };
    const endLog = async () => {
      if (storage.useS3() && logLines.length) {
        try {
          await storage.writeText(userId, baseDirInfo.prefix + PIPELINE_LOG_FILENAME, logLines.join(''));
        } catch {
          // ignore
        }
      }
      if (logStream) {
        const s = logStream;
        logStream = null;
        try {
          s.end();
        } catch {
          // ignore
        }
      }
    };
    if (!storage.useS3() && baseDirInfo.path) {
      try {
        await fs.mkdir(baseDirInfo.path, { recursive: true });
        const logPath = path.join(baseDirInfo.path, PIPELINE_LOG_FILENAME);
        logStream = fsNative.createWriteStream(logPath, { flags: 'w' });
        logStream.on('error', () => { logStream = null; });
      } catch {
        logStream = null;
      }
    }
    writeLog(`[${new Date().toISOString()}] Pipeline start: ${queryName}\n`);
    let currentChild: ReturnType<typeof spawn> | null = null;
    const abort = () => {
      if (currentChild && !currentChild.killed) {
        try {
          currentChild.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
    };
    activePipelines.set(queryName, { started_at: Date.now(), abort });
    req.on('close', () => {
      clientDisconnected = true;
      if (!pipelineFinished) {
        abort();
        writeLog(`\n[${new Date().toISOString()}] Client disconnected. Aborting pipeline.\n`);
      }
    });
    sendSseEvent(res, 'start', { query: queryName, steps: PIPELINE_STEPS.map((s) => s.name) });
    writeLog(`Steps: ${PIPELINE_STEPS.map((step) => step.script).join(' -> ')}\n`);
    (async () => {
      const total = PIPELINE_STEPS.length;
      for (let idx = 0; idx < total; idx++) {
        if (clientDisconnected) throw new Error('Pipeline aborted (client disconnected).');
        const step = PIPELINE_STEPS[idx];
        sendSseEvent(res, 'step_start', { step: idx + 1, total, name: step.name, script: step.script });
        writeLog(`\n[${new Date().toISOString()}] Step ${idx + 1}/${total}: ${step.name}\n`);
        if (step.script === 'scripts/2_generate_time_entries.py') {
          const canonicalKey = baseDirInfo.prefix + TIME_ENTRIES_FILENAME;
          if (await storage.fileExists(userId, canonicalKey)) {
            writeLog(`Backing up existing ${TIME_ENTRIES_FILENAME}...\n`);
            sendSseEvent(res, 'log', { stream: 'meta', text: `Backing up existing ${TIME_ENTRIES_FILENAME}...\n` });
            try {
              await queries.rotateBackups(storage, userId, baseDirInfo, canonicalKey);
              writeLog(`Backed up to time_entries.bak1.json (rotating last ${BACKUP_COUNT}).\n`);
              sendSseEvent(res, 'log', { stream: 'meta', text: `Backed up to time_entries.bak1.json (rotating last ${BACKUP_COUNT}).\n` });
            } catch (err: unknown) {
              const e = err as Error;
              writeLog(`Backup failed: ${e.message ?? 'unknown error'}\n`);
              sendSseEvent(res, 'log', { stream: 'meta', text: `Backup failed: ${e.message ?? 'unknown error'}\n` });
            }
          }
        }
        const args = ['run', 'python', step.script, '--query', queryName];
        if (storage.useS3()) args.push('--user-id', userId);
        sendSseEvent(res, 'log', { stream: 'meta', text: `\n$ pixi ${args.join(' ')}\n` });
        writeLog(`\n$ pixi ${args.join(' ')}\n`);
        const spawnEnv = storage.useS3() ? { ...process.env, USER_ID: userId } : process.env;
        const { child, promise } = runPixiPython(res, args, {
          env: spawnEnv,
          onOutput: (_stream, chunk) => writeLog(chunk.toString('utf-8')),
        });
        currentChild = child;
        await promise;
        currentChild = null;
      }
      sendSseEvent(res, 'complete', { success: true });
      writeLog(`\n[${new Date().toISOString()}] Pipeline complete.\n`);
      pipelineFinished = true;
      await endLog();
      if (!res.writableEnded && !res.destroyed) res.end();
    })().catch(async (error: NodeJS.ErrnoException) => {
      const message = error?.code === 'ENOENT'
        ? "Unable to run 'pixi'. Install Pixi and ensure it's on your PATH."
        : (error as Error).message ?? 'Pipeline failed.';
      sendSseEvent(res, 'complete', { success: false, error: message });
      writeLog(`\n[${new Date().toISOString()}] Pipeline failed: ${message}\n`);
      pipelineFinished = true;
      await endLog();
      if (!res.writableEnded && !res.destroyed) res.end();
    }).finally(async () => {
      activePipelines.delete(queryName);
      await endLog();
    });
    return;
  }

  if (urlObj.pathname === '/api/generate-pdf' && req.method === 'GET') {
    const queryName = urlObj.searchParams.get('query');
    if (!queryName) {
      return void sendJson(res, 400, { error: 'Missing query parameter.' });
    }
    try {
      await queries.getQueryInfo(storage, userId, queryName);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      return void sendJson(res, e.statusCode ?? 500, { error: e.message ?? 'Invalid query.' });
    }
    let chromium: { launch: () => Promise<unknown> };
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      return void sendJson(res, 500, {
        error: "Playwright is not installed. Run `npm i -D playwright` then `npx playwright install chromium` from the repo root.",
      });
    }
    const browser = await (chromium as { launch: () => Promise<Browser> }).launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const targetUrl = `${urlObj.origin}/pdf.html?query=${encodeURIComponent(queryName)}`;
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.emulateMedia({ media: 'print' });
      await page.waitForSelector('#invoice .invoice-header', { timeout: 60_000 });
      const footerTemplate = `
        <div style="width:100%; font-size:10px; color:#5d584f; text-align:center; padding:0 14mm;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `;
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate,
        margin: { top: '18mm', right: '14mm', bottom: '24mm', left: '14mm' },
      });
      const filename = `${safeDownloadName(queryName)}.pdf`;
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdfBuffer);
    } catch (err: unknown) {
      sendJson(res, 500, { error: (err as Error).message ?? 'PDF generation failed.' });
    } finally {
      await browser.close();
    }
    return;
  }

  if (urlObj.pathname === '/api/time-entries' && req.method === 'GET') {
    const queryName = urlObj.searchParams.get('query');
    if (!queryName) {
      return void sendJson(res, 400, { error: 'Missing query parameter.' });
    }
    const query = await queries.getQueryInfo(storage, userId, queryName);
    const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
    const timeEntriesKey = await queries.getTimeEntriesReadKey(storage, userId, baseDirInfo.prefix);
    if (!timeEntriesKey) {
      return void sendJson(res, 404, { error: `No time entries found for query '${queryName}'.` });
    }
    const data = (await storage.readJson(userId, timeEntriesKey)) as { entries?: Array<{ documents?: Array<{ source_email_id?: string }> }> };
    const referencedIds = new Set<string>();
    if (data?.entries) {
      for (const entry of data.entries) {
        for (const doc of entry.documents ?? []) {
          const id = String(doc.source_email_id ?? '').trim();
          if (id) referencedIds.add(id);
        }
      }
    }
    let senderByEmailId: Record<string, string> = {};
    if (referencedIds.size) {
      const parsedEmailsKey = baseDirInfo.prefix + PARSED_EMAILS_FILENAME;
      if (await storage.fileExists(userId, parsedEmailsKey)) {
        try {
          const messages = (await storage.readJson(userId, parsedEmailsKey)) as MessageLike[];
          senderByEmailId = buildSenderByEmailId(messages, referencedIds);
        } catch {
          // ignore
        }
      }
    }
    return void sendJson(res, 200, {
      ...data,
      __loaded_from: path.basename(timeEntriesKey),
      __sender_by_email_id: senderByEmailId,
    });
  }

  if (urlObj.pathname === '/api/time-entries' && req.method === 'POST') {
    const queryName = urlObj.searchParams.get('query');
    if (!queryName) {
      return void sendJson(res, 400, { error: 'Missing query parameter.' });
    }
    const query = await queries.getQueryInfo(storage, userId, queryName);
    const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
    if (!storage.useS3() && baseDirInfo.path) {
      await fs.mkdir(baseDirInfo.path, { recursive: true });
    }
    const body = await collectBody(req, 5_000_000);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return void sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }
    const canonicalKey = baseDirInfo.prefix + TIME_ENTRIES_FILENAME;
    const backupSourceKey = await queries.getTimeEntriesReadKey(storage, userId, baseDirInfo.prefix);
    const didBackup = await queries.rotateBackups(storage, userId, baseDirInfo, backupSourceKey);
    await storage.writeJson(userId, canonicalKey, payload);
    return void sendJson(res, 200, { saved_as: TIME_ENTRIES_FILENAME, did_backup: didBackup });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}
