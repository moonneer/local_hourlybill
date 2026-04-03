/**
 * API origin for fetch/EventSource. Default is empty → relative URLs (same origin).
 *
 * On AWS App Runner, the CDK stack serves the Vite build and `/api/*` from the same
 * `ServiceUrl`, so relative paths hit the Node backend that talks to S3, DynamoDB,
 * and Secrets Manager. Do not point the browser at those AWS APIs directly.
 *
 * Set `VITE_API_BASE_URL` only if the SPA is hosted separately from the API (requires
 * matching CORS and cookie rules on the server).
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const base = raw?.replace(/\/$/, "") ?? "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
