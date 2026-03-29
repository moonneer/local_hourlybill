"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionCookieName = exports.resolveSession = void 0;
const auth_1 = require("./services/auth");
const COOKIE_NAME = 'session';
function parseCookie(header) {
    const out = {};
    if (!header)
        return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1)
            continue;
        const key = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (key)
            out[key] = value;
    }
    return out;
}
function getSessionTokenFromRequest(req) {
    const cookie = parseCookie(req.headers.cookie);
    const fromCookie = cookie[COOKIE_NAME];
    if (fromCookie)
        return fromCookie;
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    return undefined;
}
/** Resolves session from cookie or Authorization and sets req.userId if valid. */
async function resolveSession(req) {
    const token = getSessionTokenFromRequest(req);
    if (!token)
        return;
    const session = await (0, auth_1.getSession)(token);
    if (session)
        req.userId = session.userId;
}
exports.resolveSession = resolveSession;
function getSessionCookieName() {
    return COOKIE_NAME;
}
exports.getSessionCookieName = getSessionCookieName;
//# sourceMappingURL=session.js.map