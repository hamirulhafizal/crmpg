-- Allow the new active profile-unverified follow-up kind to be recorded.
-- Existing installs already have `followup_campaign_sends_kind_check` from migration 009.

ALTER TABLE public.followup_campaign_sends
  DROP CONSTRAINT IF EXISTS followup_campaign_sends_kind_check;

ALTER TABLE public.followup_campaign_sends
  ADD CONSTRAINT followup_campaign_sends_kind_check
  CHECK (kind IN ('inactive', 'free', 'active_profile_unverified'));
