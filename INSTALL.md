# Install / Setup

## Syncing to a new location

This repo has both **tracked code** and **untracked local data** you may want to bring along.

1) Sync code
- Clone: `git clone <repo-url>`
- Update: `git pull`

2) Copy local data (recommended if you want existing bills, backups, and logos)
- `clients/` (generated bill data; gitignored)
- `local_bill_editor/uploads/` (uploaded logos; gitignored)
- `scripts/.env` (if you use the Gmail/LLM scripts; gitignored)

Example (from old repo → new repo):
- `rsync -av /path/to/old/hourlybill_v3/clients/ /path/to/new/hourlybill_v3/clients/`
- `rsync -av /path/to/old/hourlybill_v3/local_bill_editor/uploads/ /path/to/new/hourlybill_v3/local_bill_editor/uploads/`
- `cp /path/to/old/hourlybill_v3/scripts/.env /path/to/new/hourlybill_v3/scripts/.env`

## Local bill editor (HTML + Node + Playwright PDF)

### Prereqs
- Node.js 18+ (Playwright requires modern Node)

### Install Playwright (once per machine / repo)

From the repo root:
- `npm init -y`
- `npm i -D playwright`
- `npx playwright install chromium`

On Linux you may need:
- `npx playwright install --with-deps chromium`

### Run

From the repo root:
- `node local_bill_editor/server.js`
- Optional port override: `PORT=3000 node local_bill_editor/server.js`

Then open:
- `http://localhost:5173/` (time entries editor)
- `http://localhost:5173/query.html` (query builder)
- `http://localhost:5173/pdf.html` (PDF generator)

PDF generation downloads a file named `<query-name>.pdf` using Playwright’s `page.pdf()` with a real footer (page numbers).
If Playwright/Chromium is not installed, the editor still runs but PDF generation will fail with an install hint.

### Running the pipeline from the UI

On `http://localhost:5173/query.html`, use `Run pipeline` to execute:
- `pixi run python scripts/0_download_test_data.py --query <query>`
- `pixi run python scripts/1_decode_raw_email_worker.py --query <query>`
- `pixi run python scripts/2_generate_time_entries.py --query <query>`

This requires Pixi installed and (for Gmail/LLM steps) a configured `.env`.
Pipeline output is also written to `clients/<clientNoSpaces>/<queryNoSpaces>/pipeline.log`.

## Python scripts (Pixi)

This repo uses `pixi.toml` to manage Python + dependencies.

### Prereqs
- Install Pixi: https://pixi.sh/

### Run scripts

You can run Python scripts inside the Pixi environment without manually creating a venv:
- `pixi run python scripts/<script>.py --help`

Common patterns:
- `pixi run python scripts/download_test_data.py ...`
- `pixi run python scripts/1_decode_raw_email_worker.py ...`
- `pixi run python scripts/2_generate_time_entries.py ...`

If you prefer an interactive shell:
- `pixi shell`
Then run: `python scripts/<script>.py ...`
