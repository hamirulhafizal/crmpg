-- =============================================================================
-- Reset campaign run data for local / staging tests (cron re-enrolls + sends).
-- Keeps: public.campaigns, public.campaign_steps (definition unchanged).
-- Removes: enrollments, WhatsApp send logs, campaign_automation follow-up rows.
--
-- Run in Supabase SQL Editor as postgres or service_role (bypasses RLS).
--
-- You must set exactly ONE of the two UUIDs below (the other stays NULL):
--   (A) One campaign: set v_campaign_id to public.campaigns.id
--   (B) Whole user:   set v_user_id to auth.users.id and set v_campaign_id := NULL
-- =============================================================================

DO $$
DECLARE
  -- >>> Replace this with YOUR campaign id from the dashboard URL or public.campaigns <<<
  v_campaign_id uuid := '99681156-db8e-46be-bc50-4b180a3bca8c'::uuid;
  -- Whole-user reset: set v_campaign_id := NULL above, then set your user id here:
  v_user_id uuid := NULL::uuid;

  n_followups integer;
  n_logs integer;
  n_enroll integer;
BEGIN
  IF v_campaign_id IS NOT NULL AND v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Set only one of v_campaign_id or v_user_id (the other must be NULL).';
  END IF;
  IF v_campaign_id IS NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Edit this script: set v_campaign_id to your campaign UUID (and leave v_user_id NULL), OR set v_user_id to your user UUID and set v_campaign_id to NULL.';
  END IF;

  IF v_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = v_campaign_id) THEN
      RAISE EXCEPTION 'Campaign not found: %', v_campaign_id;
    END IF;

    DELETE FROM public.customer_follow_up_activities a
    USING public.campaigns c
    WHERE c.id = v_campaign_id
      AND a.user_id = c.user_id
      AND a.topic = 'campaign_automation'
      AND a.channel = 'whatsapp_automation'
      AND (a.metadata ->> 'campaign_id')::uuid = c.id;
    GET DIAGNOSTICS n_followups = ROW_COUNT;

    DELETE FROM public.campaign_message_logs l
    WHERE l.campaign_id = v_campaign_id;
    GET DIAGNOSTICS n_logs = ROW_COUNT;

    DELETE FROM public.campaign_enrollments e
    WHERE e.campaign_id = v_campaign_id;
    GET DIAGNOSTICS n_enroll = ROW_COUNT;

    RAISE NOTICE 'Campaign % reset: follow_up_activities=%, message_logs=%, enrollments=%',
      v_campaign_id, n_followups, n_logs, n_enroll;
    RETURN;
  END IF;

  -- All campaigns for v_user_id
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.user_id = v_user_id) THEN
    RAISE NOTICE 'No campaigns for user %; still deleting stray logs/followups if any.', v_user_id;
  END IF;

  DELETE FROM public.customer_follow_up_activities a
  WHERE a.user_id = v_user_id
    AND a.topic = 'campaign_automation'
    AND a.channel = 'whatsapp_automation'
    AND (a.metadata ->> 'campaign_id')::uuid IN (
      SELECT c.id FROM public.campaigns c WHERE c.user_id = v_user_id
    );
  GET DIAGNOSTICS n_followups = ROW_COUNT;

  DELETE FROM public.campaign_message_logs l
  WHERE l.user_id = v_user_id;
  GET DIAGNOSTICS n_logs = ROW_COUNT;

  DELETE FROM public.campaign_enrollments e
  WHERE e.user_id = v_user_id;
  GET DIAGNOSTICS n_enroll = ROW_COUNT;

  RAISE NOTICE 'User % campaign data reset: follow_up_activities=%, message_logs=%, enrollments=%',
    v_user_id, n_followups, n_logs, n_enroll;
END;
$$;
