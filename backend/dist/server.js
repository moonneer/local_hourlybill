"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const storage_1 = require("./storage");
const api_1 = require("./routes/api");
const session_1 = require("./session");
const utils_1 = require("./utils");
const config_1 = require("./config");
const isDev = process.env.NODE_ENV === 'development';
/** Check if the static dist directory exists (only relevant in production). */
function staticDirExists() {
    try {
        return fs_1.default.statSync(config_1.STATIC_DIR).isDirectory();
    }
    catch {
        return false;
    }
}
async function serveStatic(req, res, pathname) {
    const safePathname = pathname === '/' ? 'index.html' : pathname;
    const filePath = path_1.default.normalize(path_1.default.join(config_1.STATIC_DIR, safePathname));
    if (!filePath.startsWith(config_1.STATIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }
    try {
        const data = await promises_1.default.readFile(filePath);
        const ext = path_1.default.extname(filePath);
        res.writeHead(200, {
            'Content-Type': config_1.MIME_TYPES[ext] ?? 'application/octet-stream',
        });
        res.end(data);
    }
    catch {
        // SPA fallback: serve index.html for client-side routing
        try {
            const indexPath = path_1.default.join(config_1.STATIC_DIR, 'index.html');
            const data = await promises_1.default.readFile(indexPath);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        }
        catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        }
    }
}
function main() {
    const storage = (0, storage_1.createStorage)();
    const serveFiles = !isDev && staticDirExists();
    const server = http_1.default.createServer(async (req, res) => {
        const host = req.headers.host ?? 'localhost';
        const urlObj = new URL(req.url ?? '/', `http://${host}`);
        if (urlObj.pathname.startsWith('/api/')) {
            try {
                await (0, session_1.resolveSession)(req);
                await (0, api_1.handleApi)(req, res, urlObj, storage);
            }
            catch (err) {
                const e = err;
                const statusCode = e.statusCode ?? 500;
                (0, utils_1.sendJson)(res, statusCode, { error: e.message ?? 'Server error.' });
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
    server.listen(config_1.PORT, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`HourlyBill API server running at http://localhost:${config_1.PORT}`);
    });
}
main();
//# sourceMappingURL=server.js.map