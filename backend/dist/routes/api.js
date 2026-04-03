"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleApi = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const config_1 = require("../config");
const utils_1 = require("../utils");
const queries = __importStar(require("../services/queries"));
const inputs = __importStar(require("../services/inputs"));
const auth = __importStar(require("../services/auth"));
const session_1 = require("../session");
const activePipelines = new Map();
function runPixiPython(res, args, options = {}) {
    const { onOutput, env } = options;
    const child = (0, child_process_1.spawn)('pixi', args, {
        cwd: config_1.ROOT_DIR,
        env: env ?? process.env,
    });
    const promise = new Promise((resolve, reject) => {
        child.stdout?.on('data', (chunk) => {
            (0, utils_1.sendSseEvent)(res, 'log', { stream: 'stdout', text: chunk.toString('utf-8') });
            onOutput?.('stdout', chunk);
        });
        child.stderr?.on('data', (chunk) => {
            (0, utils_1.sendSseEvent)(res, 'log', { stream: 'stderr', text: chunk.toString('utf-8') });
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
async function collectBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString('utf-8');
            if (body.length > maxBytes)
                req.destroy();
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
function cookieSecuritySuffix() {
    return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}
function setSessionCookie(res, token, maxAgeSec) {
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${cookieSecuritySuffix()}`);
}
function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${(0, session_1.getSessionCookieName)()}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecuritySuffix()}`);
}
function parseSessionTokenFromReq(req) {
    const cookie = (req.headers.cookie ?? '')
        .split(';')
        .find((c) => c.trim().startsWith(`${(0, session_1.getSessionCookieName)()}=`));
    return cookie ? cookie.split('=')[1]?.trim() : undefined;
}
/** Session-derived user id only in production; optional x-user-id header in non-production for tests. */
function resolveAppUserId(req) {
    if (req.userId)
        return req.userId;
    if (process.env.NODE_ENV !== 'production') {
        const h = req.headers['x-user-id'];
        if (typeof h === 'string' && h.trim())
            return h.trim();
    }
    return undefined;
}
async function requireSignedInUser(req, res) {
    if (!auth.authAvailable()) {
        (0, utils_1.sendJson)(res, 503, { error: 'Authentication is not configured on this server.' });
        return null;
    }
    const uid = resolveAppUserId(req);
    if (!uid) {
        (0, utils_1.sendJson)(res, 401, { error: 'Sign in required.' });
        return null;
    }
    return uid;
}
async function handleApi(req, res, urlObj, storage) {
    if (urlObj.pathname === '/api/signup' && req.method === 'POST') {
        const body = await collectBody(req, 10000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        try {
            const user = await auth.createUser(String(payload.email ?? ''), String(payload.password ?? ''), String(payload.firstName ?? ''), String(payload.lastName ?? ''));
            const { sessionToken, expiresAt } = await auth.createSession(user.userId);
            setSessionCookie(res, sessionToken, 7 * 24 * 60 * 60);
            return void (0, utils_1.sendJson)(res, 201, { user: auth.sanitizeUser(user), sessionToken, expiresAt });
        }
        catch (err) {
            const e = err;
            return void (0, utils_1.sendJson)(res, e.statusCode ?? 500, { error: e.message ?? 'Signup failed.' });
        }
    }
    if (urlObj.pathname === '/api/login' && req.method === 'POST') {
        const body = await collectBody(req, 10000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        const email = String(payload.email ?? '').trim().toLowerCase();
        const password = String(payload.password ?? '');
        if (!email || !password) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Email and password are required.' });
        }
        const user = await auth.getUserByEmail(email);
        if (!user || !(await auth.verifyPassword(password, user.passwordHash))) {
            return void (0, utils_1.sendJson)(res, 401, { error: 'Invalid email or password.' });
        }
        const { sessionToken, expiresAt } = await auth.createSession(user.userId);
        setSessionCookie(res, sessionToken, 7 * 24 * 60 * 60);
        return void (0, utils_1.sendJson)(res, 200, { user: auth.sanitizeUser(user), sessionToken, expiresAt });
    }
    if (urlObj.pathname === '/api/logout' && req.method === 'POST') {
        const token = parseSessionTokenFromReq(req);
        if (token)
            await auth.deleteSession(token);
        clearSessionCookie(res);
        return void (0, utils_1.sendJson)(res, 200, { ok: true });
    }
    if (urlObj.pathname === '/api/me' && req.method === 'GET') {
        if (!auth.authAvailable()) {
            return void (0, utils_1.sendJson)(res, 200, { user: null });
        }
        const uid = resolveAppUserId(req);
        if (!uid) {
            return void (0, utils_1.sendJson)(res, 200, { user: null });
        }
        const user = await auth.getUserById(uid);
        if (!user) {
            const token = parseSessionTokenFromReq(req);
            if (token)
                await auth.deleteSession(token);
            clearSessionCookie(res);
            return void (0, utils_1.sendJson)(res, 200, { user: null });
        }
        return void (0, utils_1.sendJson)(res, 200, { user: auth.sanitizeUser(user) });
    }
    if (urlObj.pathname === '/api/profile' && req.method === 'GET') {
        if (!auth.authAvailable()) {
            return void (0, utils_1.sendJson)(res, 200, { profile: null });
        }
        const uid = resolveAppUserId(req);
        if (!uid) {
            return void (0, utils_1.sendJson)(res, 200, { profile: null });
        }
        const user = await auth.getUserById(uid);
        if (!user) {
            const token = parseSessionTokenFromReq(req);
            if (token)
                await auth.deleteSession(token);
            clearSessionCookie(res);
            return void (0, utils_1.sendJson)(res, 200, { profile: null });
        }
        return void (0, utils_1.sendJson)(res, 200, { profile: auth.sanitizeUser(user) });
    }
    if (urlObj.pathname === '/api/profile' && req.method === 'PUT') {
        const uid = resolveAppUserId(req);
        if (!auth.authAvailable() || !uid) {
            return void (0, utils_1.sendJson)(res, 401, { error: 'Sign in required.' });
        }
        const body = await collectBody(req, 50000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        const updated = await auth.updateUserProfile(uid, {
            displayName: payload.displayName,
            avatarUrl: payload.avatarUrl,
        });
        if (!updated)
            return void (0, utils_1.sendJson)(res, 404, { error: 'User not found.' });
        return void (0, utils_1.sendJson)(res, 200, { profile: auth.sanitizeUser(updated) });
    }
    const userId = await requireSignedInUser(req, res);
    if (userId === null)
        return;
    if (urlObj.pathname === '/api/queries' && req.method === 'GET') {
        const list = await queries.getQueryList(storage, userId);
        return void (0, utils_1.sendJson)(res, 200, { queries: list });
    }
    if (urlObj.pathname === '/api/time-entries-exists' && req.method === 'GET') {
        const queryName = urlObj.searchParams.get('query');
        if (!queryName) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Missing query parameter.' });
        }
        try {
            const query = await queries.getQueryInfo(storage, userId, queryName);
            const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
            const exists = await storage.fileExists(userId, baseDirInfo.prefix + config_1.TIME_ENTRIES_FILENAME);
            return void (0, utils_1.sendJson)(res, 200, { exists });
        }
        catch (err) {
            const e = err;
            return void (0, utils_1.sendJson)(res, e.statusCode ?? 500, { error: e.message ?? 'Invalid query.' });
        }
    }
    if (urlObj.pathname === '/api/system-senders' && req.method === 'GET') {
        try {
            const data = await storage.readJson(userId, 'system_senders.json');
            return void (0, utils_1.sendJson)(res, 200, data);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 200, { blocked_senders: [], tooltip: 'Unable to access document to estimate time' });
        }
    }
    if (urlObj.pathname === '/api/query-json' && req.method === 'GET') {
        const data = await storage.readJson(userId, 'query.json');
        return void (0, utils_1.sendJson)(res, 200, data);
    }
    if (urlObj.pathname === '/api/query-entry' && req.method === 'POST') {
        const body = await collectBody(req, 2000000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        const queryName = String(payload.query_name ?? '').trim();
        if (!queryName || queryName === 'template') {
            return void (0, utils_1.sendJson)(res, 400, { error: 'query_name is required and cannot be template.' });
        }
        const entry = payload.entry;
        const errors = (0, utils_1.validateQueryEntry)(entry);
        if (errors.length)
            return void (0, utils_1.sendJson)(res, 400, { error: errors.join(' ') });
        const allQueries = (await storage.readJson(userId, 'query.json'));
        if (payload.is_new && allQueries[queryName]) {
            return void (0, utils_1.sendJson)(res, 409, { error: `Query '${queryName}' already exists.` });
        }
        const entryObj = entry;
        if (!entryObj.requested_timestamp && payload.is_new) {
            entryObj.requested_timestamp = new Date().toISOString();
        }
        allQueries[queryName] = entryObj;
        await storage.writeJson(userId, 'query.json', allQueries);
        return void (0, utils_1.sendJson)(res, 200, { saved: queryName });
    }
    if (urlObj.pathname === '/api/inputs' && req.method === 'GET') {
        const data = await inputs.readInputs(storage, userId);
        return void (0, utils_1.sendJson)(res, 200, data);
    }
    if (urlObj.pathname === '/api/inputs' && req.method === 'POST') {
        const body = await collectBody(req, 100000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        try {
            const data = await inputs.updateInputs(storage, userId, payload);
            return void (0, utils_1.sendJson)(res, 200, data);
        }
        catch (err) {
            const e = err;
            return void (0, utils_1.sendJson)(res, e.statusCode ?? 500, { error: e.message ?? 'Failed to update inputs.' });
        }
    }
    if (urlObj.pathname === '/api/logo-upload' && req.method === 'POST') {
        const body = await collectBody(req, 10000000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        const dataUrl = String(payload.data_url ?? '');
        const filename = String(payload.filename ?? '').trim();
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'data_url must be a base64 image data URL.' });
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
        }
        else {
            const uploadsDir = path_1.default.join(config_1.STATIC_DIR, 'uploads');
            await promises_1.default.mkdir(uploadsDir, { recursive: true });
            await promises_1.default.writeFile(path_1.default.join(uploadsDir, outputName), buffer);
        }
        return void (0, utils_1.sendJson)(res, 200, { path: `uploads/${outputName}` });
    }
    if (urlObj.pathname === '/api/run-pipeline' && req.method === 'GET') {
        const queryName = String(urlObj.searchParams.get('query') ?? '').trim();
        req.socket?.setTimeout(0);
        res.socket?.setTimeout(0);
        (0, utils_1.sendSseHeaders)(res);
        if (!queryName) {
            (0, utils_1.sendSseEvent)(res, 'complete', { success: false, error: 'Missing query parameter.' });
            res.end();
            return;
        }
        let query;
        try {
            query = await queries.getQueryInfo(storage, userId, queryName);
        }
        catch (err) {
            const e = err;
            (0, utils_1.sendSseEvent)(res, 'complete', { success: false, error: e.message ?? `Query '${queryName}' not found.` });
            res.end();
            return;
        }
        if (activePipelines.has(queryName)) {
            (0, utils_1.sendSseEvent)(res, 'complete', { success: false, error: `Pipeline already running for '${queryName}'.` });
            res.end();
            return;
        }
        const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
        let logStream = null;
        const logLines = [];
        let pipelineFinished = false;
        let clientDisconnected = false;
        const writeLog = (text) => {
            logLines.push(text);
            if (logStream && !logStream.destroyed && !logStream.writableEnded) {
                try {
                    logStream.write(text);
                }
                catch {
                    // ignore
                }
            }
        };
        const endLog = async () => {
            if (storage.useS3() && logLines.length) {
                try {
                    await storage.writeText(userId, baseDirInfo.prefix + config_1.PIPELINE_LOG_FILENAME, logLines.join(''));
                }
                catch {
                    // ignore
                }
            }
            if (logStream) {
                const s = logStream;
                logStream = null;
                try {
                    s.end();
                }
                catch {
                    // ignore
                }
            }
        };
        if (!storage.useS3() && baseDirInfo.path) {
            try {
                await promises_1.default.mkdir(baseDirInfo.path, { recursive: true });
                const logPath = path_1.default.join(baseDirInfo.path, config_1.PIPELINE_LOG_FILENAME);
                logStream = fs_1.default.createWriteStream(logPath, { flags: 'w' });
                logStream.on('error', () => { logStream = null; });
            }
            catch {
                logStream = null;
            }
        }
        writeLog(`[${new Date().toISOString()}] Pipeline start: ${queryName}\n`);
        let currentChild = null;
        const abort = () => {
            if (currentChild && !currentChild.killed) {
                try {
                    currentChild.kill('SIGTERM');
                }
                catch {
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
        (0, utils_1.sendSseEvent)(res, 'start', { query: queryName, steps: config_1.PIPELINE_STEPS.map((s) => s.name) });
        writeLog(`Steps: ${config_1.PIPELINE_STEPS.map((step) => step.script).join(' -> ')}\n`);
        (async () => {
            const total = config_1.PIPELINE_STEPS.length;
            for (let idx = 0; idx < total; idx++) {
                if (clientDisconnected)
                    throw new Error('Pipeline aborted (client disconnected).');
                const step = config_1.PIPELINE_STEPS[idx];
                (0, utils_1.sendSseEvent)(res, 'step_start', { step: idx + 1, total, name: step.name, script: step.script });
                writeLog(`\n[${new Date().toISOString()}] Step ${idx + 1}/${total}: ${step.name}\n`);
                if (step.script === 'scripts/2_generate_time_entries.py') {
                    const canonicalKey = baseDirInfo.prefix + config_1.TIME_ENTRIES_FILENAME;
                    if (await storage.fileExists(userId, canonicalKey)) {
                        writeLog(`Backing up existing ${config_1.TIME_ENTRIES_FILENAME}...\n`);
                        (0, utils_1.sendSseEvent)(res, 'log', { stream: 'meta', text: `Backing up existing ${config_1.TIME_ENTRIES_FILENAME}...\n` });
                        try {
                            await queries.rotateBackups(storage, userId, baseDirInfo, canonicalKey);
                            writeLog(`Backed up to time_entries.bak1.json (rotating last ${config_1.BACKUP_COUNT}).\n`);
                            (0, utils_1.sendSseEvent)(res, 'log', { stream: 'meta', text: `Backed up to time_entries.bak1.json (rotating last ${config_1.BACKUP_COUNT}).\n` });
                        }
                        catch (err) {
                            const e = err;
                            writeLog(`Backup failed: ${e.message ?? 'unknown error'}\n`);
                            (0, utils_1.sendSseEvent)(res, 'log', { stream: 'meta', text: `Backup failed: ${e.message ?? 'unknown error'}\n` });
                        }
                    }
                }
                const args = ['run', 'python', step.script, '--query', queryName];
                if (storage.useS3())
                    args.push('--user-id', userId);
                (0, utils_1.sendSseEvent)(res, 'log', { stream: 'meta', text: `\n$ pixi ${args.join(' ')}\n` });
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
            (0, utils_1.sendSseEvent)(res, 'complete', { success: true });
            writeLog(`\n[${new Date().toISOString()}] Pipeline complete.\n`);
            pipelineFinished = true;
            await endLog();
            if (!res.writableEnded && !res.destroyed)
                res.end();
        })().catch(async (error) => {
            const message = error?.code === 'ENOENT'
                ? "Unable to run 'pixi'. Install Pixi and ensure it's on your PATH."
                : error.message ?? 'Pipeline failed.';
            (0, utils_1.sendSseEvent)(res, 'complete', { success: false, error: message });
            writeLog(`\n[${new Date().toISOString()}] Pipeline failed: ${message}\n`);
            pipelineFinished = true;
            await endLog();
            if (!res.writableEnded && !res.destroyed)
                res.end();
        }).finally(async () => {
            activePipelines.delete(queryName);
            await endLog();
        });
        return;
    }
    if (urlObj.pathname === '/api/generate-pdf' && req.method === 'GET') {
        const queryName = urlObj.searchParams.get('query');
        if (!queryName) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Missing query parameter.' });
        }
        try {
            await queries.getQueryInfo(storage, userId, queryName);
        }
        catch (err) {
            const e = err;
            return void (0, utils_1.sendJson)(res, e.statusCode ?? 500, { error: e.message ?? 'Invalid query.' });
        }
        let chromium;
        try {
            ({ chromium } = await Promise.resolve().then(() => __importStar(require('playwright'))));
        }
        catch {
            return void (0, utils_1.sendJson)(res, 500, {
                error: "Playwright is not installed. Run `npm i -D playwright` then `npx playwright install chromium` from the repo root.",
            });
        }
        const browser = await chromium.launch();
        try {
            const context = await browser.newContext();
            const page = await context.newPage();
            const targetUrl = `${urlObj.origin}/pdf.html?query=${encodeURIComponent(queryName)}`;
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
            await page.emulateMedia({ media: 'print' });
            await page.waitForSelector('#invoice .invoice-header', { timeout: 60000 });
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
            const filename = `${(0, utils_1.safeDownloadName)(queryName)}.pdf`;
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': pdfBuffer.length,
                'Cache-Control': 'no-store',
            });
            res.end(pdfBuffer);
        }
        catch (err) {
            (0, utils_1.sendJson)(res, 500, { error: err.message ?? 'PDF generation failed.' });
        }
        finally {
            await browser.close();
        }
        return;
    }
    if (urlObj.pathname === '/api/time-entries' && req.method === 'GET') {
        const queryName = urlObj.searchParams.get('query');
        if (!queryName) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Missing query parameter.' });
        }
        const query = await queries.getQueryInfo(storage, userId, queryName);
        const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
        const timeEntriesKey = await queries.getTimeEntriesReadKey(storage, userId, baseDirInfo.prefix);
        if (!timeEntriesKey) {
            return void (0, utils_1.sendJson)(res, 404, { error: `No time entries found for query '${queryName}'.` });
        }
        const data = (await storage.readJson(userId, timeEntriesKey));
        const referencedIds = new Set();
        if (data?.entries) {
            for (const entry of data.entries) {
                for (const doc of entry.documents ?? []) {
                    const id = String(doc.source_email_id ?? '').trim();
                    if (id)
                        referencedIds.add(id);
                }
            }
        }
        let senderByEmailId = {};
        if (referencedIds.size) {
            const parsedEmailsKey = baseDirInfo.prefix + config_1.PARSED_EMAILS_FILENAME;
            if (await storage.fileExists(userId, parsedEmailsKey)) {
                try {
                    const messages = (await storage.readJson(userId, parsedEmailsKey));
                    senderByEmailId = (0, utils_1.buildSenderByEmailId)(messages, referencedIds);
                }
                catch {
                    // ignore
                }
            }
        }
        return void (0, utils_1.sendJson)(res, 200, {
            ...data,
            __loaded_from: path_1.default.basename(timeEntriesKey),
            __sender_by_email_id: senderByEmailId,
        });
    }
    if (urlObj.pathname === '/api/time-entries' && req.method === 'POST') {
        const queryName = urlObj.searchParams.get('query');
        if (!queryName) {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Missing query parameter.' });
        }
        const query = await queries.getQueryInfo(storage, userId, queryName);
        const baseDirInfo = queries.getBaseDirInfo(storage, userId, queryName, String(query.client_name));
        if (!storage.useS3() && baseDirInfo.path) {
            await promises_1.default.mkdir(baseDirInfo.path, { recursive: true });
        }
        const body = await collectBody(req, 5000000);
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            return void (0, utils_1.sendJson)(res, 400, { error: 'Invalid JSON payload.' });
        }
        const canonicalKey = baseDirInfo.prefix + config_1.TIME_ENTRIES_FILENAME;
        const backupSourceKey = await queries.getTimeEntriesReadKey(storage, userId, baseDirInfo.prefix);
        const didBackup = await queries.rotateBackups(storage, userId, baseDirInfo, backupSourceKey);
        await storage.writeJson(userId, canonicalKey, payload);
        return void (0, utils_1.sendJson)(res, 200, { saved_as: config_1.TIME_ENTRIES_FILENAME, did_backup: didBackup });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
}
exports.handleApi = handleApi;
//# sourceMappingURL=api.js.map