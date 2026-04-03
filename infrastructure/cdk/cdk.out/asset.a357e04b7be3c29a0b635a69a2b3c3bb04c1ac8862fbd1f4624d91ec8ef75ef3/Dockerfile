# Hourly Bill v3 — App Runner: Node + Playwright + Pixi/Python pipeline
# Base image includes Chromium deps for Playwright (match package.json major).
# Patch tags (e.g. v1.57.1-noble) are not always published; use the release line that exists on MCR.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.pixi/bin:${PATH}"
RUN curl -LsSf https://pixi.sh/install.sh | sh

WORKDIR /app

# Host pixi.lock is mac-only and excluded by .dockerignore; resolve Linux env in-image.
COPY pixi.toml ./
RUN pixi lock && pixi install

# --- Frontend (Vite → frontend/dist; served by Node in production) ---
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
# Printable invoice + login shell for Playwright PDF and App Runner health check
COPY local_bill_editor/pdf.html local_bill_editor/styles.css \
  local_bill_editor/auth.js local_bill_editor/pdf.js \
  local_bill_editor/login.html local_bill_editor/login.js \
  ./frontend/public/
RUN cd frontend && npm run build

# --- Backend ---
COPY package.json package-lock.json ./
COPY backend ./backend
COPY scripts ./scripts

RUN npm ci
RUN npm run build:backend

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "backend/dist/server.js"]
