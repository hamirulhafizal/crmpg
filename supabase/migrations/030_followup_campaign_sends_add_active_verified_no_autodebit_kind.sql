-- Allow tracking sends for active+verified customers who have no auto-debit subscription.

ALTER TABLE public.followup_campaign_sends
  DROP CONSTRAINT IF EXISTS followup_campaign_sends_kind_check;

ALTER TABLE public.followup_campaign_sends
  ADD CONSTRAINT followup_campaign_sends_kind_check
  CHECK (
    kind IN (
      'inactive',
      'free',
      'active_profile_unverified',
      'active_verified_no_autodebit'
    )
  );
