/**
 * Thin entrypoint: all HTTP and /api behavior lives in the compiled TypeScript server.
 * Run `npm run build:backend` first, or use `npm run start:backend` from the repo root.
 */
const path = require('path');
const fs = require('fs');

const entry = path.join(__dirname, '..', 'backend', 'dist', 'server.js');
if (!fs.existsSync(entry)) {
  console.error(
    'Missing backend/dist/server.js. From the repo root run: npm run build:backend\n' +
      'Or use: npm run start:backend'
  );
  process.exit(1);
}

require(entry);
