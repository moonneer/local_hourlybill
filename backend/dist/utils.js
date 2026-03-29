"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyInputsPayload = exports.safeDownloadName = exports.validateQueryEntry = exports.buildSenderByEmailId = exports.readFromHeader = exports.extractEmailAddress = exports.normalizeSegment = exports.sendSseEvent = exports.sendSseHeaders = exports.sendJson = void 0;
function sendJson(res, statusCode, data) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
exports.sendJson = sendJson;
function sendSseHeaders(res) {
    if (res.writableEnded || res.destroyed)
        return;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
    });
    try {
        res.write('\n');
    }
    catch {
        // ignore
    }
}
exports.sendSseHeaders = sendSseHeaders;
function sendSseEvent(res, event, data) {
    if (res.writableEnded || res.destroyed)
        return;
    try {
        res.write(`event: ${event}\n`);
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        for (const line of String(payload).split(/\r?\n/)) {
            res.write(`data: ${line}\n`);
        }
        res.write('\n');
    }
    catch {
        // ignore
    }
}
exports.sendSseEvent = sendSseEvent;
function normalizeSegment(value) {
    return String(value ?? '').replace(/\s+/g, '');
}
exports.normalizeSegment = normalizeSegment;
function extractEmailAddress(value) {
    const raw = String(value ?? '').trim();
    if (!raw)
        return '';
    const match = raw.match(/<([^>]+)>/);
    const candidate = (match ? match[1] : raw).trim();
    const maybeEmail = candidate.split(/\s+/)[0];
    return maybeEmail.replace(/^"+|"+$/g, '').toLowerCase();
}
exports.extractEmailAddress = extractEmailAddress;
function readFromHeader(message) {
    if (!message || typeof message !== 'object')
        return '';
    if (message.metadata?.from)
        return message.metadata.from;
    const fromValue = message.headers?.from;
    if (fromValue)
        return Array.isArray(fromValue) ? fromValue[0] ?? '' : fromValue;
    const headers = message.payload?.headers;
    if (Array.isArray(headers)) {
        const match = headers.find((h) => String(h?.name ?? '').toLowerCase() === 'from');
        if (match?.value)
            return match.value;
    }
    return '';
}
exports.readFromHeader = readFromHeader;
function buildSenderByEmailId(messages, referencedIds) {
    const result = {};
    if (!Array.isArray(messages) || referencedIds.size === 0)
        return result;
    const remaining = new Set(referencedIds);
    for (const message of messages) {
        const id = String(message?.id ?? '').trim();
        if (!id || !remaining.has(id))
            continue;
        const email = extractEmailAddress(readFromHeader(message));
        if (email)
            result[id] = email;
        remaining.delete(id);
        if (remaining.size === 0)
            break;
    }
    return result;
}
exports.buildSenderByEmailId = buildSenderByEmailId;
function validateQueryEntry(entry) {
    const errors = [];
    const e = entry;
    if (!e || typeof e !== 'object') {
        return ['Entry must be an object.'];
    }
    if (!String(e.client_name ?? '').trim())
        errors.push('client_name is required.');
    const emails = e.emails;
    if (!Array.isArray(emails) || emails.filter((v) => String(v).trim()).length < 1) {
        errors.push('At least one email is required.');
    }
    const keywords = e.keywords;
    if (!Array.isArray(keywords) || keywords.filter((v) => String(v).trim()).length < 1) {
        errors.push('At least one keyword is required.');
    }
    if ('exclude_keywords' in e && e.exclude_keywords != null && !Array.isArray(e.exclude_keywords)) {
        errors.push('exclude_keywords must be a list of strings.');
    }
    if (!String(e.start ?? '').trim() || !String(e.end ?? '').trim()) {
        errors.push('start and end dates are required.');
    }
    if (!e.matters || typeof e.matters !== 'object' || Array.isArray(e.matters)) {
        errors.push('matters must be an object.');
    }
    else if (Object.keys(e.matters).filter((k) => String(k).trim()).length < 1) {
        errors.push('At least one matter is required.');
    }
    const rate = Number(e.billing_rate);
    if (!Number.isFinite(rate) || rate <= 0) {
        errors.push('billing_rate must be a positive number.');
    }
    return errors;
}
exports.validateQueryEntry = validateQueryEntry;
function safeDownloadName(value) {
    const raw = String(value ?? '').trim();
    if (!raw)
        return 'bill';
    const sanitized = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    return sanitized || 'bill';
}
exports.safeDownloadName = safeDownloadName;
function normalizePhoneDigits(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.length === 11 && digits.startsWith('1'))
        return digits.slice(1);
    if (digits.length > 10)
        return digits.slice(-10);
    return digits;
}
const INPUT_FIELDS = [
    'user_address_line1',
    'user_address_line2',
    'user_city',
    'user_state',
    'user_postal_code',
    'user_country',
    'law_firm_phone',
    'law_firm_website',
    'law_firm_logo_path',
];
function applyInputsPayload(inputs, payload) {
    const userValue = payload.user ?? payload.user_name;
    if (typeof userValue === 'string')
        inputs.user = userValue.trim();
    for (const field of INPUT_FIELDS) {
        if (field in payload) {
            inputs[field] =
                field === 'law_firm_phone'
                    ? normalizePhoneDigits(payload[field])
                    : typeof payload[field] === 'string'
                        ? payload[field].trim()
                        : payload[field];
        }
    }
    return inputs;
}
exports.applyInputsPayload = applyInputsPayload;
//# sourceMappingURL=utils.js.map