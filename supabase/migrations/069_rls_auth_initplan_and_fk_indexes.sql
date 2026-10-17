-- Performance: wrap auth.uid() in (select auth.uid()) so RLS InitPlan runs once per query.
-- Also drop open customers SELECT policy and add missing FK indexes.

-- ---------------------------------------------------------------------------
-- customers: drop public-read + fix InitPlan
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable read access for all users" ON public.customers;
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can insert their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;

CREATE POLICY "Users can view their own customers"
  ON public.customers FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own customers"
  ON public.customers FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own customers"
  ON public.customers FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own customers"
  ON public.customers FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- customer_tags
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_customer_tags" ON public.customer_tags;
DROP POLICY IF EXISTS "users_insert_own_customer_tags" ON public.customer_tags;
DROP POLICY IF EXISTS "users_update_own_customer_tags" ON public.customer_tags;
DROP POLICY IF EXISTS "users_delete_own_customer_tags" ON public.customer_tags;

CREATE POLICY "users_select_own_customer_tags"
  ON public.customer_tags FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_customer_tags"
  ON public.customer_tags FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_customer_tags"
  ON public.customer_tags FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_delete_own_customer_tags"
  ON public.customer_tags FOR DELETE
  USING (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile safe columns" ON public.profiles;

CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile safe columns"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- campaigns + related
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "campaigns_select_own" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_own" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_own" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_own" ON public.campaigns;

CREATE POLICY "campaigns_select_own"
  ON public.campaigns FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "campaigns_insert_own"
  ON public.campaigns FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "campaigns_update_own"
  ON public.campaigns FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "campaigns_delete_own"
  ON public.campaigns FOR DELETE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "campaign_steps_all_own" ON public.campaign_steps;
CREATE POLICY "campaign_steps_all_own"
  ON public.campaign_steps FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "campaign_enrollments_all_own" ON public.campaign_enrollments;
CREATE POLICY "campaign_enrollments_all_own"
  ON public.campaign_enrollments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_enrollments.campaign_id AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_enrollments.campaign_id AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "campaign_logs_all_own" ON public.campaign_message_logs;
CREATE POLICY "campaign_logs_all_own"
  ON public.campaign_message_logs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_message_logs.campaign_id AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_message_logs.campaign_id AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "campaign_platform_defaults_admin_all" ON public.campaign_platform_defaults;
CREATE POLICY "campaign_platform_defaults_admin_all"
  ON public.campaign_platform_defaults FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- pg_sync_jobs / pgmall_*
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_pg_sync_jobs" ON public.pg_sync_jobs;
DROP POLICY IF EXISTS "users_insert_own_pg_sync_jobs" ON public.pg_sync_jobs;
DROP POLICY IF EXISTS "users_update_own_pg_sync_jobs" ON public.pg_sync_jobs;

CREATE POLICY "users_select_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own pgmall credentials metadata" ON public.pgmall_credentials;
DROP POLICY IF EXISTS "Users can insert their own pgmall credentials" ON public.pgmall_credentials;
DROP POLICY IF EXISTS "Users can update their own pgmall credentials" ON public.pgmall_credentials;
DROP POLICY IF EXISTS "Users can delete their own pgmall credentials" ON public.pgmall_credentials;

CREATE POLICY "Users can view their own pgmall credentials metadata"
  ON public.pgmall_credentials FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own pgmall credentials"
  ON public.pgmall_credentials FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own pgmall credentials"
  ON public.pgmall_credentials FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own pgmall credentials"
  ON public.pgmall_credentials FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own pgmall sync jobs" ON public.pgmall_sync_jobs;
DROP POLICY IF EXISTS "Users can insert their own pgmall sync jobs" ON public.pgmall_sync_jobs;
DROP POLICY IF EXISTS "Users can update their own pgmall sync jobs" ON public.pgmall_sync_jobs;

CREATE POLICY "Users can view their own pgmall sync jobs"
  ON public.pgmall_sync_jobs FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own pgmall sync jobs"
  ON public.pgmall_sync_jobs FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own pgmall sync jobs"
  ON public.pgmall_sync_jobs FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- WAHA / scheduled messages / sync runs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own WAHA sessions" ON public.waha_user_sessions;
DROP POLICY IF EXISTS "Users can insert their own WAHA sessions" ON public.waha_user_sessions;
DROP POLICY IF EXISTS "Users can update their own WAHA sessions" ON public.waha_user_sessions;
DROP POLICY IF EXISTS "Users can delete their own WAHA sessions" ON public.waha_user_sessions;

CREATE POLICY "Users can view their own WAHA sessions"
  ON public.waha_user_sessions FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own WAHA sessions"
  ON public.waha_user_sessions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own WAHA sessions"
  ON public.waha_user_sessions FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own WAHA sessions"
  ON public.waha_user_sessions FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own scheduled messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Users can insert own scheduled messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Users can update own scheduled messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS "Users can delete own scheduled messages" ON public.scheduled_messages;

CREATE POLICY "Users can view own scheduled messages"
  ON public.scheduled_messages FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own scheduled messages"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own scheduled messages"
  ON public.scheduled_messages FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own customer sync runs" ON public.customer_sync_runs;
DROP POLICY IF EXISTS "Users can insert their own customer sync runs" ON public.customer_sync_runs;
DROP POLICY IF EXISTS "Users can update their own customer sync runs" ON public.customer_sync_runs;

CREATE POLICY "Users can view their own customer sync runs"
  ON public.customer_sync_runs FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own customer sync runs"
  ON public.customer_sync_runs FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own customer sync runs"
  ON public.customer_sync_runs FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Follow-up / checklist / bookmarks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_follow_up_activities" ON public.customer_follow_up_activities;
DROP POLICY IF EXISTS "users_insert_own_follow_up_activities" ON public.customer_follow_up_activities;
DROP POLICY IF EXISTS "users_delete_own_follow_up_activities" ON public.customer_follow_up_activities;

CREATE POLICY "users_select_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_delete_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR DELETE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_select_own_follow_up_bookmark" ON public.user_follow_up_bookmarks;
DROP POLICY IF EXISTS "users_insert_own_follow_up_bookmark" ON public.user_follow_up_bookmarks;
DROP POLICY IF EXISTS "users_update_own_follow_up_bookmark" ON public.user_follow_up_bookmarks;
DROP POLICY IF EXISTS "users_delete_own_follow_up_bookmark" ON public.user_follow_up_bookmarks;

CREATE POLICY "users_select_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_delete_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR DELETE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_select_own_checklist_progress" ON public.customer_checklist_progress;
DROP POLICY IF EXISTS "users_insert_own_checklist_progress" ON public.customer_checklist_progress;
DROP POLICY IF EXISTS "users_update_own_checklist_progress" ON public.customer_checklist_progress;
DROP POLICY IF EXISTS "users_delete_own_checklist_progress" ON public.customer_checklist_progress;

CREATE POLICY "users_select_own_checklist_progress"
  ON public.customer_checklist_progress FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_checklist_progress"
  ON public.customer_checklist_progress FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_checklist_progress"
  ON public.customer_checklist_progress FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_delete_own_checklist_progress"
  ON public.customer_checklist_progress FOR DELETE
  USING (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- SaaS / Google Ads / iOS push / lucky draw
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own saas mandates" ON public.saas_mandates;
DROP POLICY IF EXISTS "Users can read own saas payments" ON public.saas_payments;
DROP POLICY IF EXISTS "Users can read own saas subscription" ON public.saas_subscriptions;

CREATE POLICY "Users can read own saas mandates"
  ON public.saas_mandates FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can read own saas payments"
  ON public.saas_payments FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can read own saas subscription"
  ON public.saas_subscriptions FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Participants can read own enrollment" ON public.google_ads_participants;
DROP POLICY IF EXISTS "Participants can read own subscription" ON public.google_ads_subscriptions;
DROP POLICY IF EXISTS "Participants can read own payments" ON public.google_ads_payments;
DROP POLICY IF EXISTS "Participants can read own mandates" ON public.google_ads_mandates;

CREATE POLICY "Participants can read own enrollment"
  ON public.google_ads_participants FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Participants can read own subscription"
  ON public.google_ads_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = google_ads_subscriptions.participant_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Participants can read own payments"
  ON public.google_ads_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = google_ads_payments.participant_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Participants can read own mandates"
  ON public.google_ads_mandates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = google_ads_mandates.participant_id AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can select own ios push devices" ON public.ios_push_devices;
DROP POLICY IF EXISTS "Users can insert own ios push devices" ON public.ios_push_devices;
DROP POLICY IF EXISTS "Users can update own ios push devices" ON public.ios_push_devices;
DROP POLICY IF EXISTS "Users can delete own ios push devices" ON public.ios_push_devices;

CREATE POLICY "Users can select own ios push devices"
  ON public.ios_push_devices FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own ios push devices"
  ON public.ios_push_devices FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own ios push devices"
  ON public.ios_push_devices FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own ios push devices"
  ON public.ios_push_devices FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "lucky_draw_dealer_settings_own" ON public.lucky_draw_dealer_settings;
DROP POLICY IF EXISTS "lucky_draw_pages_own" ON public.lucky_draw_pages;
DROP POLICY IF EXISTS "lucky_draw_questions_own" ON public.lucky_draw_questions;
DROP POLICY IF EXISTS "lucky_draw_entries_select_own" ON public.lucky_draw_entries;
DROP POLICY IF EXISTS "lucky_draw_platform_defaults_admin_all" ON public.lucky_draw_platform_defaults;
DROP POLICY IF EXISTS "lucky_draw_platform_default_questions_admin_all" ON public.lucky_draw_platform_default_questions;

CREATE POLICY "lucky_draw_dealer_settings_own"
  ON public.lucky_draw_dealer_settings FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "lucky_draw_pages_own"
  ON public.lucky_draw_pages FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "lucky_draw_questions_own"
  ON public.lucky_draw_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lucky_draw_pages p
      WHERE p.id = lucky_draw_questions.page_id AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lucky_draw_pages p
      WHERE p.id = lucky_draw_questions.page_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "lucky_draw_entries_select_own"
  ON public.lucky_draw_entries FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "lucky_draw_platform_defaults_admin_all"
  ON public.lucky_draw_platform_defaults FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  );

CREATE POLICY "lucky_draw_platform_default_questions_admin_all"
  ON public.lucky_draw_platform_default_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Missing FK indexes (advisor)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_customer_id
  ON public.campaign_enrollments (customer_id);

CREATE INDEX IF NOT EXISTS idx_campaign_message_logs_campaign_step_id
  ON public.campaign_message_logs (campaign_step_id);

CREATE INDEX IF NOT EXISTS idx_campaign_message_logs_customer_id
  ON public.campaign_message_logs (customer_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_platform_default_id
  ON public.campaigns (platform_default_id);

CREATE INDEX IF NOT EXISTS idx_customer_follow_up_activities_created_by
  ON public.customer_follow_up_activities (created_by);

CREATE INDEX IF NOT EXISTS idx_customer_checklist_progress_completed_by
  ON public.customer_checklist_progress (completed_by);

CREATE INDEX IF NOT EXISTS idx_followup_campaign_sends_customer_id
  ON public.followup_campaign_sends (customer_id);

CREATE INDEX IF NOT EXISTS idx_followup_campaign_sends_scheduled_message_id
  ON public.followup_campaign_sends (scheduled_message_id);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_entries_customer_id
  ON public.lucky_draw_entries (customer_id);

CREATE INDEX IF NOT EXISTS idx_saas_mandates_plan_id
  ON public.saas_mandates (plan_id);

CREATE INDEX IF NOT EXISTS idx_saas_payments_plan_id
  ON public.saas_payments (plan_id);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_admin_assigned_by
  ON public.saas_subscriptions (admin_assigned_by);

CREATE INDEX IF NOT EXISTS idx_google_ads_mandates_package_id
  ON public.google_ads_mandates (package_id);

CREATE INDEX IF NOT EXISTS idx_google_ads_payments_package_id
  ON public.google_ads_payments (package_id);

CREATE INDEX IF NOT EXISTS idx_google_ads_subscriptions_package_id
  ON public.google_ads_subscriptions (package_id);

CREATE INDEX IF NOT EXISTS idx_google_ads_subscriptions_pending_renewal_package_id
  ON public.google_ads_subscriptions (pending_renewal_package_id);

CREATE INDEX IF NOT EXISTS idx_google_ads_participants_rotation_queue_updated_by
  ON public.google_ads_participants (rotation_queue_updated_by);

CREATE INDEX IF NOT EXISTS idx_admin_media_assets_uploaded_by
  ON public.admin_media_assets (uploaded_by);
