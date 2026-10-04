-- Phase 20: Android updates without Play (DECISIONS D-039, D-058).
--
-- The APK is installed from the SOUL site, so nothing tells an installed app that a newer one
-- exists. The app reads this value after sign-in and compares it with its own build number:
--   * below `min_version_code`: a full-screen "Update SOUL" (an old build the server no longer
--     supports, for example after a breaking change);
--   * below `latest_version_code`: a one-time "A new version is ready" prompt;
--   * otherwise nothing.
-- `apk_url` is the site's /download page (it shows the SHA-256); the release step prints the
-- statement that updates this row (BUILD_ANDROID.md "Release build"). Version codes come from
-- package.json: 1.4.2 is 1004002. Zero means no release yet, so nobody is prompted.

insert into public.app_config (key, value, client_visible, description) values
  ('android_release',
   '{"latest_version": null, "latest_version_code": 0, "min_version_code": 0, "apk_url": null, "sha256": null}',
   true,
   'The current Android APK and the oldest build still supported (D-039). Updated at each release.')
on conflict (key) do nothing;
