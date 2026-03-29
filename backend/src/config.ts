import path from 'path';

/** Repo root (where query.json, clients/, scripts/ live). */
export const ROOT_DIR = path.resolve(__dirname, '../..');
/** Static assets (HTML, JS, CSS). */
export const STATIC_DIR = path.join(ROOT_DIR, 'local_bill_editor');

export const PORT = Number(process.env.PORT || 5000);
export const BACKUP_COUNT = 5;
export const TIME_ENTRIES_FILENAME = 'time_entries.json';
export const PARSED_EMAILS_FILENAME = 'parsed_emails.json';
export const PIPELINE_LOG_FILENAME = 'pipeline.log';

export const PIPELINE_STEPS = [
  { name: 'Download Gmail messages', script: 'scripts/0_download_test_data.py' },
  { name: 'Decode raw emails', script: 'scripts/1_decode_raw_email_worker.py' },
  { name: 'Generate time entries', script: 'scripts/2_generate_time_entries.py' },
] as const;

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
};
