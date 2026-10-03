-- SOUL Phase 16: structural hardening found by the coverage tests (017_structure).
--
-- PostgreSQL lets everyone (PUBLIC) execute a new function unless it is revoked. Every
-- private helper already revoked it except five trigger functions. Trigger functions are
-- only ever run by their triggers (the privilege is checked when the trigger is created), so
-- nobody needs to call them directly: PUBLIC loses execute on the whole private schema, now
-- and for every function created later. Functions the app's policies rely on keep their
-- explicit grant to `authenticated`.

revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;
