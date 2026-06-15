-- Allow API (service role) to provision default campaigns for existing users on first visit.
GRANT EXECUTE ON FUNCTION public.provision_platform_default_campaign(UUID) TO service_role;
