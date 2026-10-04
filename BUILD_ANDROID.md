# SOUL: Android Build

SOUL for Android ships as a directly installed APK from the SOUL website (no Play Store in V1, DECISIONS D-035). This file covers the three builds, environment, signing, permissions, icon and splash, versioning, updates and push. The release order is in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

| Build | Command | Backend | Signed with | Use |
|---|---|---|---|---|
| Development | `npm run android:build` | local Supabase | debug key | daily work with Metro and the dev menu |
| Test APK | `npm run android:test-apk` | local Supabase | debug key | release-optimised build for checks and measurements on this machine; never published |
| Production APK | `npm run android:release` | hosted project | production key | the file people install |

## Machine rules (this workstation)

- **C: hosts the Windows page file.** All caches live on D: (`D:/soul-dev/...`): npm cache, Gradle (`GRADLE_USER_HOME`), Android emulator SDK and AVD, and Docker's disk.
- **15 GB RAM.** Build with the emulator and Docker **stopped** (the release script refuses otherwise; `FORCE=1` overrides). Builds are memory-capped and stop their Gradle and Kotlin daemons afterwards. `wsl --shutdown` frees Docker's VM memory before a long build.
- JDK 17 (`C:/Program Files/Eclipse Adoptium/jdk-17.0.20.1+1`); the system JDK 25 is not used.
- A build takes 10 to 25 minutes here. Launch it detached and watch the log: `(nohup bash -c "npm run android:test-apk > D:/soul-dev/test-apk.log 2>&1" &)`.

## Environment

| File (git-ignored) | Template (committed) | Read by | Holds |
|---|---|---|---|
| `.env` | `.env.example` | development build, test APK | local Supabase URL and publishable key |
| `.env.production` | `.env.production.example` | production APK, website export | hosted Supabase URL and publishable key |
| `supabase/functions/.env` | `supabase/functions/.env.example` | local Edge Functions | local server secrets (mock payments) |
| `supabase/functions/.env.production` | `supabase/functions/.env.production.example` | `supabase secrets set --env-file` | hosted server secrets: Razorpay, Web Push, FCM |

```bash
npm run env:init -- production    # creates missing files from the templates; generates Web Push keys
npm run env:check -- production   # checks every value without printing any of them
```

- **Only three values reach the app:** `APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Anything in the app files is public (it is inside the APK and the website). `env:check` refuses a secret key there and any other `EXPO_PUBLIC_*` name.
- `app.config.ts` refuses `APP_ENV=production` with a local or non-HTTPS Supabase URL, so a production APK can never point at this machine.
- `EXPO_PUBLIC_*` values are inlined into the bundle and Metro caches transformed files; the release script clears that cache first.

**Package name:** `com.soul.srm`, locked (C-04) for Android, the future iOS bundle id and the deep-link scheme (`com.soul.srm://`). All three builds share it, so on one phone they replace each other. The development build and the test APK share the debug key and update each other; the production APK has a different key, so moving between it and a debug-signed build needs an uninstall. Never rename the package after the public beta without the owner's explicit approval.

## Development build

```bash
npm run android:build   # prebuild if needed + x86_64 debug APK, installs if a device is connected
npm run db:start        # local Supabase (Docker, disk on D:)
npm run emulator        # AVD soul_pixel_api36 from D:
npm start               # Metro for the dev client
```

The dev build contains Expo's developer menu and needs Metro. After a release build, `npm run android:build` regenerates `./android` by itself (the release script leaves a marker).

## Test APK

```bash
npm run db:stop && wsl --shutdown   # memory for the build
npm run android:test-apk            # dist-android/soul-<version>-test.apk
npm run db:start && npm run emulator
adb install -r dist-android/soul-<version>-test.apk
```

A release build in every way that matters for checks (no developer menu, minified Hermes bytecode, no Metro), but it uses `.env` (the local Supabase at `10.0.2.2`) and the debug key. Because the local stack is plain HTTP, it alone allows cleartext traffic (`plugins/with-local-backend.js`, switched on by `SOUL_LOCAL_BACKEND=1`, refused with `APP_ENV=production`). `ABIS=arm64-v8a,x86_64` builds for a phone too, though a phone cannot reach the local stack. It is never published.

## Release build (production APK)

```bash
npm version patch --no-git-tag-version   # or minor / major: see Versioning
npm run env:check -- production
npm run android:release
```

The script:
1. checks `.env.production` (`env:check -- production --app`) and that the emulator and Docker are stopped;
2. regenerates `./android` for production (name "SOUL", blocked permissions, no cleartext);
3. clears the Metro cache and builds `app:assembleRelease` for `arm64-v8a`, `armeabi-v7a` and `x86_64`;
4. **stops if the production signing key is not configured** (it never falls back to the debug key);
5. writes `dist-android/soul-<version>.apk`, its `.sha256`, `latest.json` and `release.sql`, prints the signer's certificate fingerprint, and copies the APK and `latest.json` into `public/downloads/` for the website.

**Size (Phase 19):** R8 code shrinking, resource shrinking and compressed native libraries (`expo-build-properties` in `app.config.ts`) cut the x86_64 test APK from 49 MB to 23 MB; the production APK for the two phone ABIs is projected at about 28 MB (PERFORMANCE.md).

Publishing is the owner's step (RELEASE_CHECKLIST.md): deploy the website, check `/download`, then run `release.sql` so installed apps offer the update.

## Versioning

- `package.json` `version` is the single source (semantic versioning). Bump it with `npm version patch|minor|major --no-git-tag-version`.
- `app.config.ts` derives Android's `versionCode` from it: `MAJOR × 1 000 000 + MINOR × 1 000 + PATCH` (`0.1.0` is `1000`, `1.4.2` is `1004002`). It only grows when the version does, which Android requires for an update. Each part stays between 0 and 999.
- Settings shows the installed version ("SOUL 0.1.0").

## Updates without Play (D-039)

`app_config.android_release` holds `{ latest_version, latest_version_code, min_version_code, apk_url, sha256 }` (migration `…1004000100_android_release.sql`; zero means no release yet). After sign-in the app compares it with its own `versionCode`:

| Installed build | The app shows |
|---|---|
| below `min_version_code` | a full-screen "Update SOUL" with a download button (nothing else works until updated) |
| below `latest_version_code` | a "SOUL x.y.z is ready" card at the top of Chats (once per version) and an "Update SOUL" row in Settings |
| otherwise | nothing |

The download opens the site's `/download` page, which shows the SHA-256. Raise `min_version_code` only when old builds must stop, for example after a breaking server change.

## Permissions

Reviewed for release (Phase 20). What the production APK requests, and why:

| Permission | Why | Asked |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | the server; knowing when the phone is offline | never (install-time) |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Instant Meet only, while it is on and SOUL is open; never in the background | when turning Instant on |
| `CAMERA` | taking a profile photo | when choosing "Take photo" |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (Android 12 and older only) | the photo picker on older phones | only if the picker needs it |
| `POST_NOTIFICATIONS` | push (Android 13+) | after the first match, or from Settings |
| `VIBRATE` | haptics on like, match and the compass | never |
| `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `c2dm.RECEIVE`, launcher badge permissions | Firebase Cloud Messaging and notification badges (from the libraries) | never |

Blocked (`android.blockedPermissions` in `app.config.ts`): `RECORD_AUDIO` (no audio or video, ever), `USE_BIOMETRIC` and `USE_FINGERPRINT` (secure storage without a fingerprint prompt), and in production `SYSTEM_ALERT_WINDOW` and `CHANGE_WIFI_MULTICAST_STATE` (development-client tools). No background location, no foreground service.

## App icon and splash

- **Launcher icon:** a temporary monochrome placeholder (white ring on black, `scripts/make-placeholder-icons.py`) for the launcher, the adaptive icon, the notification icon and the PWA. **The compact mark is a release blocker (C-21):** the wide wordmark is never squeezed into an icon. When the owner supplies the mark, replace the files in `assets/images/` referenced by `app.config.ts` and rebuild.
- **Splash:** `expo-splash-screen` with the supplied SOUL logo (`assets/brand/derived`), black on white in light mode and white on black in dark mode, 160 dp wide. The app keeps it up until it knows the account's state, then fades it out in 200 ms, so there is no blank frame between the splash and the first screen.

## Signing (C-20)

Two separate identities:

| Build | Key | Where it lives |
|---|---|---|
| Development and test APK | the Android debug keystore from the Expo template | `android/app/debug.keystore` (generated, git-ignored) |
| Production (release) | the SOUL production keystore, one identity forever | outside the repo, e.g. `D:/soul-dev/signing/` plus offline backups |

`plugins/with-release-signing.js` makes release builds read the production key from a local properties file (`SOUL_RELEASE_SIGNING`, default `D:/soul-dev/signing/soul-release.properties`) or from `SOUL_RELEASE_STORE_FILE`, `SOUL_RELEASE_STORE_PASSWORD`, `SOUL_RELEASE_KEY_ALIAS` and `SOUL_RELEASE_KEY_PASSWORD`. **A release build without them fails**; it never falls back to the debug key (Expo's template would, which would make every later update impossible). The test APK passes the debug key explicitly through those variables. Keystores, properties files, `signing/`, `credentials.json`, `.p12` and `.pem` files are git-ignored.

### Creating the production key (not done: the owner runs it once)

On a trusted machine, with JDK 17's `keytool`:

```bash
mkdir -p D:/soul-dev/signing
"C:/Program Files/Eclipse Adoptium/jdk-17.0.20.1+1/bin/keytool" -genkeypair -v -storetype PKCS12 -keystore D:/soul-dev/signing/soul-release.jks -alias soul-release -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=SOUL, O=[Operator legal name], C=IN"
```

It asks for one password (PKCS12 uses the same password for the store and the key). Then create `D:/soul-dev/signing/soul-release.properties`:

```
STORE_FILE=D:/soul-dev/signing/soul-release.jks
STORE_PASSWORD=<the password>
KEY_ALIAS=soul-release
KEY_PASSWORD=<the password>
```

`npm run env:check -- production` then reports "production signing configured".

### What to preserve, forever

1. `soul-release.jks`, the keystore file.
2. Its password.
3. The alias, `soul-release`.
4. The certificate SHA-256 fingerprint (public; record it under "Release history" after creation): `keytool -list -v -keystore D:/soul-dev/signing/soul-release.jks`.

### Backup and recovery

- Keep at least **two offline copies** of the keystore in different places (for example an encrypted USB drive and an encrypted cloud or password-manager attachment), and keep the password in a password manager, never next to the file.
- After creating it, test a restore: copy a backup to a temporary folder, point `SOUL_RELEASE_STORE_FILE` at it, build a release APK, and check the fingerprint matches (`apksigner verify --print-certs`).
- **If the key is lost:** installed apps can never be updated again. The only way forward is a new package name and asking every user to reinstall, which breaks the C-04 lock. This is why backups matter.
- **If the key leaks:** someone could sign fake updates. Rotate with APK Signature Scheme v3 key rotation (`apksigner rotate` to create a signing lineage from the old key to a new one, then sign releases with the lineage), publish the new fingerprint on `/download`, and tell users. This needs the old key, so backups matter here too.

## Push notifications (FCM, C-16)

FCM works for APKs installed outside Google Play; it needs Google Play services on the phone (most Android phones in India have them), not a Play Store listing. Push is optional: SOUL works fully without it.

1. A Firebase project (free) with an **Android app** for package `com.soul.srm`.
2. `google-services.json` at the repo root (git-ignored; present on this machine). `app.config.ts` picks it up automatically.
3. A **service account key** (Project settings → Service accounts → Generate new private key). Never commit it and never paste it in chat: put the JSON on one line as `FCM_SERVICE_ACCOUNT` in `supabase/functions/.env.production`, check with `npm run env:check -- production`, and send with `supabase secrets set --env-file`.

## Release history

| Version | Date | versionCode | APK SHA-256 | Signer SHA-256 |
|---|---|---|---|---|
| (none yet) | | | | |

**Rebuild after font changes:** fonts are embedded at build time, so a change in `assets/fonts` (the body font or the SoulIcons subset) needs a rebuild (`CLEAN=1 npm run android:build`).
