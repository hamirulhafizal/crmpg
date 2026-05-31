-- GAP lead WAHA config is stored in admin_app_settings (key: gap_lead_waha).
-- Managed via Admin → Google Ads → settings icon. Not read from env at runtime.

COMMENT ON TABLE public.admin_app_settings IS
  'Global admin key/value settings. Keys include automation_default_templates, gap_lead_waha (WAHA base URL, API key, session, CC chat id for GAP registration leads).';
