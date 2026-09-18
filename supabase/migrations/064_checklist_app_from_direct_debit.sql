-- Infer "Download Mobile Apps PG" as complete when Direct Debit is active.

UPDATE public.customer_checklist_steps
SET
  auto_complete_source = 'direct_debit',
  description = 'Download the official Public Gold mobile app. Inferred complete when Direct Debit is active.',
  updated_at = NOW()
WHERE program_slug = 'kaya_emas_2026'
  AND step_key = 'download_pg_app';
