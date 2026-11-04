/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The read-only demo account offered on the login page. Public: see auth/demo-account.ts. */
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}
