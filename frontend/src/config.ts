/**
 * Centralized Application Configuration
 * All API endpoints and environment settings are configured here.
 * Set VITE_API_BASE_URL in your .env or on your hosting provider (e.g. Vercel).
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:8000'

export const APP_CONFIG = {
  apiBaseUrl: API_BASE_URL,
  isProduction: import.meta.env.PROD,
  isDevelopment: import.meta.env.DEV,
} as const

