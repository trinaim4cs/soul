-- Expanded draft policies (eight documents, DECISIONS C-23): a new accepted-terms version.
-- Accounts that accepted the previous version are asked to accept again (get_my_status shows
-- the terms step as open until accept_terms is called with this version).
update public.app_config
set value = '{"version": "2026-09-27-draft-2"}'
where key = 'current_terms_version';
