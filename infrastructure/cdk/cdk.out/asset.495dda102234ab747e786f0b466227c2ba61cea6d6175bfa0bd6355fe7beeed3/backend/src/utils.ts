import type { ServerResponse } from 'http';

export function sendJson(res: ServerResponse, statusCode: number, data: object): void {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendSseHeaders(res: ServerResponse): void {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  try {
    res.write('\n');
  } catch {
    // ignore
  }
}

export function sendSseEvent(res: ServerResponse, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\n`);
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const line of String(payload).split(/\r?\n/)) {
      res.write(`data: ${line}\n`);
    }
    res.write('\n');
  } catch {
    // ignore
  }
}

export function normalizeSegment(value: string): string {
  return String(value ?? '').replace(/\s+/g, '');
}

export function extractEmailAddress(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const candidate = (match ? match[1] : raw).trim();
  const maybeEmail = candidate.split(/\s+/)[0];
  return maybeEmail.replace(/^"+|"+$/g, '').toLowerCase();
}

export interface MessageLike {
  metadata?: { from?: string };
  headers?: { from?: string | string[] };
  payload?: { headers?: Array<{ name?: string; value?: string }> };
}

export function readFromHeader(message: MessageLike): string {
  if (!message || typeof message !== 'object') return '';
  if (message.metadata?.from) return message.metadata.from;
  const fromValue = message.headers?.from;
  if (fromValue) return Array.isArray(fromValue) ? fromValue[0] ?? '' : fromValue;
  const headers = message.payload?.headers;
  if (Array.isArray(headers)) {
    const match = headers.find(
      (h) => String(h?.name ?? '').toLowerCase() === 'from'
    );
    if (match?.value) return match.value;
  }
  return '';
}

export function buildSenderByEmailId(
  messages: MessageLike[],
  referencedIds: Set<string>
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(messages) || referencedIds.size === 0) return result;
  const remaining = new Set(referencedIds);
  for (const message of messages) {
    const id = String((message as { id?: string })?.id ?? '').trim();
    if (!id || !remaining.has(id)) continue;
    const email = extractEmailAddress(readFromHeader(message));
    if (email) result[id] = email;
    remaining.delete(id);
    if (remaining.size === 0) break;
  }
  return result;
}

export function validateQueryEntry(entry: unknown): string[] {
  const errors: string[] = [];
  const e = entry as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') {
    return ['Entry must be an object.'];
  }
  if (!String(e.client_name ?? '').trim()) errors.push('client_name is required.');
  const emails = e.emails as unknown;
  if (!Array.isArray(emails) || emails.filter((v: unknown) => String(v).trim()).length < 1) {
    errors.push('At least one email is required.');
  }
  const keywords = e.keywords as unknown;
  if (!Array.isArray(keywords) || keywords.filter((v: unknown) => String(v).trim()).length < 1) {
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
  } else if (Object.keys(e.matters).filter((k) => String(k).trim()).length < 1) {
    errors.push('At least one matter is required.');
  }
  const rate = Number(e.billing_rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    errors.push('billing_rate must be a positive number.');
  }
  return errors;
}

export function safeDownloadName(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'bill';
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'bill';
}

function normalizePhoneDigits(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
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
] as const;

export function applyInputsPayload(
  inputs: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const userValue = payload.user ?? payload.user_name;
  if (typeof userValue === 'string') inputs.user = userValue.trim();
  for (const field of INPUT_FIELDS) {
    if (field in payload) {
      (inputs as Record<string, unknown>)[field] =
        field === 'law_firm_phone'
          ? normalizePhoneDigits(payload[field])
          : typeof payload[field] === 'string'
            ? (payload[field] as string).trim()
            : payload[field];
    }
  }
  return inputs;
}
