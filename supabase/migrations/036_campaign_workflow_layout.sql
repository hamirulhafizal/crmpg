-- Persist visual workflow node positions (and optional per-node display labels).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS workflow_layout JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.workflow_layout IS
  'Visual editor state: { "nodes": { "<nodeId>": { "x": number, "y": number } } }';
