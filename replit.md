# HourlyBill v3

A professional legal billing tool for generating time entries and invoices from email data, with a modern React web UI.

## Architecture

### Frontend (React + Vite)
- Location: `frontend/`
- Dev server: port 5000 (proxies `/api/*` to backend on 5001)
- Production: `npm run build` → `frontend/dist/` (served by backend)
- Stack: React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, wouter

### Backend (Node.js/TypeScript)
- Location: `backend/src/` (compiled → `backend/dist/`)
- Dev port: 5001 | Production port: 5000
- Serves: REST API at `/api/*`, static files from `frontend/dist/` in production
- Storage: Local filesystem (dev) or AWS S3 (prod, via env vars)

### Python Data Pipeline
- Location: `scripts/`
- Managed via Pixi (`pixi.toml`)
- Steps: Gmail download → email decode → LLM time entry generation

### Infrastructure
- `infrastructure/` — AWS CDK (App Runner, DynamoDB, S3)

## Running Locally

**Workflow command** (runs both):
```
bash -c "PORT=5001 NODE_ENV=development node backend/dist/server.js & npm --prefix frontend run dev"
```

**To rebuild the backend after TypeScript changes:**
```
npm run build:backend
```

## Key API Endpoints
- `GET /api/queries` — list query names
- `GET /api/time-entries?query=X` — fetch time entries
- `POST /api/time-entries?query=X` — save time entries
- `GET /api/query-json` — full query.json config
- `POST /api/query-entry` — save a query entry
- `GET /api/inputs` / `POST /api/inputs` — firm info / default inputs
- `GET /api/run-pipeline?query=X` — SSE pipeline stream
- `GET /api/generate-pdf?query=X` — download PDF (Playwright)
- `POST /api/logo-upload` — upload firm logo

## Pages
- `/` — Time Entries editor (main billing page)
- `/query` — Query Builder (Gmail search config + pipeline runner)
- `/pdf` — PDF Generator (invoice preview + download)

## Frontend Structure
```
frontend/src/
  App.tsx               — app shell (sidebar + routing)
  index.css             — Tailwind + dark theme CSS vars
  components/
    app-sidebar.tsx     — navigation sidebar
    ui/                 — shadcn/ui components
  pages/
    time-entries.tsx    — billing editor
    query-builder.tsx   — query form + pipeline runner
    pdf-generator.tsx   — invoice preview + PDF download
    not-found.tsx       — 404 page
  lib/
    queryClient.ts      — TanStack Query client + apiRequest
    utils.ts            — cn(), formatCurrency(), etc.
  hooks/
    use-toast.ts        — toast hook
```

## Auth
- Supports AWS DynamoDB auth (USERS_TABLE + SESSIONS_TABLE env vars)
- Falls back to "local mode" when env vars not set (single user, no login)

## PDF Generation
- Requires Playwright/Chromium: `npx playwright install chromium`
- Playwright renders the `/pdf` page and returns a PDF download

## Deployment
- Target: autoscale
- Build: `npm run build:backend && npm --prefix frontend install && npm --prefix frontend run build`
- Run: `node backend/dist/server.js` (serves `frontend/dist/` on port 5000)
