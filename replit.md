# HourlyBill v3

A system for generating time entries and invoices from raw data (emails), with a web-based UI for reviewing, editing, and generating PDF bills.

## Architecture

- **Frontend/Backend**: Node.js HTTP server (`local_bill_editor/server.js` → `backend/dist/server.js`) serving static HTML/CSS/JS from `local_bill_editor/`
- **Backend**: TypeScript source in `backend/src/`, compiled to `backend/dist/`
- **Python scripts**: Data processing pipeline in `scripts/` managed via Pixi (`pixi.toml`)
- **Infrastructure**: AWS CDK in `infrastructure/` for cloud deployment (App Runner, DynamoDB, S3)

## Running Locally

- Workflow: `npm run start:js` (starts the compiled Node.js server on port 5000)
- Build backend: `npm run build:backend` (compiles TypeScript)

## Key Files

- `backend/src/server.ts` — Main HTTP server (serves static files + API routes)
- `backend/src/config.ts` — Port (5000), paths, pipeline steps configuration
- `local_bill_editor/` — Static HTML/CSS/JS frontend assets
- `scripts/` — Python data pipeline scripts (Gmail download, email decode, time entry generation)
- `query.json` / `inputs.json` — Pipeline configuration

## Pages

- `/` — Time entries editor
- `/query.html` — Pipeline runner / query builder
- `/pdf.html` — PDF generation preview
- `/login.html` — Login page (when auth is configured)

## Notes

- The server binds to `0.0.0.0:5000`
- Local data (bills, uploads) is gitignored; see `INSTALL.md` for sync instructions
- PDF generation requires Playwright/Chromium: `npx playwright install chromium`
- Python pipeline requires Pixi: https://pixi.sh/
