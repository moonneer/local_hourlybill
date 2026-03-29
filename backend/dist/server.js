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
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const storage_1 = require("./storage");
const api_1 = require("./routes/api");
const session_1 = require("./session");
const auth = __importStar(require("./services/auth"));
const utils_1 = require("./utils");
const config_1 = require("./config");
async function serveStatic(req, res, pathname) {
    const filePath = path_1.default.normalize(path_1.default.join(config_1.STATIC_DIR, pathname === '/' ? 'index.html' : pathname));
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
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    }
}
function main() {
    const storage = (0, storage_1.createStorage)();
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
        // When auth is configured, redirect unauthenticated users from / and /index.html to login
        if ((urlObj.pathname === '/' || urlObj.pathname === '/index.html') && auth.authAvailable()) {
            await (0, session_1.resolveSession)(req);
            const reqWithUser = req;
            if (!reqWithUser.userId) {
                const redirectTo = `/login.html${urlObj.search ? `?redirect=${encodeURIComponent(urlObj.pathname + urlObj.search)}` : ''}`;
                res.writeHead(302, { Location: redirectTo });
                res.end();
                return;
            }
        }
        await serveStatic(req, res, urlObj.pathname);
    });
    server.listen(config_1.PORT, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`Time entries editor running at http://localhost:${config_1.PORT}`);
    });
}
main();
//# sourceMappingURL=server.js.map