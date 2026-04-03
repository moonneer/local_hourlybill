/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute origin for API calls when UI and API are not same-origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
