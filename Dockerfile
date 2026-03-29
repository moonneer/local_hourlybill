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

COPY package.json package-lock.json ./
COPY backend ./backend
COPY local_bill_editor ./local_bill_editor
COPY scripts ./scripts

RUN npm ci
RUN npm run build:backend

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "backend/dist/server.js"]
