/**
 * Supabase config – same auth as the webapp (app/login).
 * Copy from your .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
const SUPABASE_CONFIG = {
  SUPABASE_URL: 'https://vbihbetdiddyzdyhdxli.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiaWhiZXRkaWRkeXpkeWhkeGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDI3MjEsImV4cCI6MjA4MDAxODcyMX0.4j0X75aDHYFkhSgDvVKCCV9RX3wZSsrMfqjbb10QRZ8',
  /** Webapp origin for OpenAI process-row API (e.g. https://crmpg.vercel.app or http://localhost:3000) */
  WEBAPP_ORIGIN: 'https://crmpg.vercel.app',
};