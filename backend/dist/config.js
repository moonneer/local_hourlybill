"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIME_TYPES = exports.PIPELINE_STEPS = exports.PIPELINE_LOG_FILENAME = exports.PARSED_EMAILS_FILENAME = exports.TIME_ENTRIES_FILENAME = exports.BACKUP_COUNT = exports.PORT = exports.STATIC_DIR = exports.ROOT_DIR = void 0;
const path_1 = __importDefault(require("path"));
/** Repo root (where query.json, clients/, scripts/ live). */
exports.ROOT_DIR = path_1.default.resolve(__dirname, '../..');
/** Static assets (HTML, JS, CSS). */
exports.STATIC_DIR = path_1.default.join(exports.ROOT_DIR, 'local_bill_editor');
exports.PORT = Number(process.env.PORT || 5000);
exports.BACKUP_COUNT = 5;
exports.TIME_ENTRIES_FILENAME = 'time_entries.json';
exports.PARSED_EMAILS_FILENAME = 'parsed_emails.json';
exports.PIPELINE_LOG_FILENAME = 'pipeline.log';
exports.PIPELINE_STEPS = [
    { name: 'Download Gmail messages', script: 'scripts/0_download_test_data.py' },
    { name: 'Decode raw emails', script: 'scripts/1_decode_raw_email_worker.py' },
    { name: 'Generate time entries', script: 'scripts/2_generate_time_entries.py' },
];
exports.MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
};
//# sourceMappingURL=config.js.map