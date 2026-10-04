# SOUL: End-to-end acceptance

The whole app walked through as a real person would, from a fresh install to account deletion, on the **release-optimised test APK** (`npm run android:test-apk`: Hermes, R8, no developer menu) on the Android emulator against the local Supabase stack. The other side of every interaction (likes, replies, date answers, moderation) was played by seeded test accounts through the same public API the app uses. Neutral identities only (`Test User 05`, `Profile 09`). Done 2026-10-04 to 2026-10-05. Decision record: DECISIONS D-060.

Deployment is out of scope (owner instruction): nothing here touched the hosted project.

Screenshots: `docs/e2e/` (downscaled; the fixed state where a step was fixed).

## The journey

| # | Step (spec) | Result |
|---|---|---|
| 1 | Splash, then Welcome: "Only for SRM." (spec 77) | pass |
| 2 | Rules checklist before sign-in, the legal draft label verbatim (D-029) | pass |
| 3 | SRMIST email: a Gmail address is refused with a clear message | pass |
| 4 | Code screen with resend countdown; a **wrong code** | **fixed** (said "SOUL is only for SRMIST students"; now "That code didn't work…") |
| 5 | Correct code, then birthday: mask, "Confirm, I'm 22", 18+ by the server | pass |
| 6 | First photo: system photo picker, 4:5 crop, upload, MAIN | pass |
| 7 | Profile: validation of every required field | **fixed** (errors stayed after the field was fixed; choice errors had a different style) |
| 8 | Discover with the 4 free likes; profile viewer | pass |
| 9 | Drag left to pass, drag right to like (server records both) | pass |
| 10 | Mutual like: "It's a match" reveal | pass |
| 11 | "Message" from the reveal | **fixed** (opened the Chats list instead of the conversation, a Phase 17 regression) |
| 12 | Chat: empty state, send, live reply from the other person | pass |
| 13 | Read receipts after a reply | **fixed** (a reply now counts as "read up to here" when receipts are shared) |
| 14 | "Did you meet?": both say yes, the date is confirmed, the fire-badge progress shows 1 of 3 | pass after **fix** (a missed nudge could leave "Waiting" on screen: now re-checked every 15 s) |
| 15 | Paywall: plans and prices exactly as the owner set them; Monthly bought (mock provider) | pass |
| 16 | Top-up ₹50 / 5 likes, never expire | pass |
| 17 | Filters: validation, age 20 to 30 saved on the server | **fixed** (the "choose at least one" error was off-screen) |
| 18 | Privacy: Anonymous, seen by another student as no name and a blurred photo | pass |
| 19 | Suspension by a moderator, shown live; appeal sent | pass, with **fixes** (the title lost its last word "paused"; the screen could stay restricted after a restore if the nudge was lost: now re-checked every 30 s) |
| 20 | Restore by a moderator, the app returns live | pass |
| 21 | Push prompt "Turn on" | **fixed** (asked for the notification permission although the server cannot deliver Android push yet; now offered only when it can) |
| 22 | Offline notice, reconnect, catch-up | pass (Phase 19) |
| 23 | Instant: on, candidate within 1 km, mutual yes, compass, End Meet, location off | pass (Phase 19, same release build type) |
| 24 | Update prompts (optional card, full-screen gate) | pass (Phase 20) |
| 25 | Report (spam) with block on by default; the match ends and leaves Chats; Blocked list; Unblock | pass (the report is stored for moderators, the other person never sees it) |
| 26 | Sign out, sign in again (returning user goes straight to Discover, no onboarding) | pass |
| 27 | Delete account: what goes and what is kept, typed `DELETE`, then back to Welcome | pass (server: the sign-in, profile, photos, preferences, likes, chats and every per-person row are gone; the two purchase records are kept with the person removed, as the screen says) |
| 28 | Under 18 (a new account, born 2010): the account locks | pass (the date of birth is not stored, the lock is the server's and survives a restart; only Sign out is offered) |

## Also found and fixed

- **Status bar:** the black Welcome screen's light status-bar style stayed on after leaving it (it stays mounted under the stack), so the clock and icons vanished on the white screens after it. Styles now apply only while their screen is in front (`ScreenStatusBar`).
- **Buttons:** a loading button shrank to the spinner's width, so the layout jumped. It now keeps its size.
- **"Sign out" on the photo step** sat inset from the text edge (now `inline`, like the Phase 17 fixes).
- **Tab bar on a cold start (Android):** the first tab was measured before the gesture-bar inset reached the native tab bar and was not measured again, so Discover ran about 24 dp under the tab bar and its Pass and Like buttons were half hidden until the first tab switch (`react-native-screens` 4.26). The tabs now mount once more 250 ms after start, which measures them with the inset. Nothing a notification opens lives inside the tabs, so the remount never discards a page. Checked on three cold starts of the rebuilt APK: Pass and Like sit fully above the tab bar each time.
- **"Delete account" icon** was a bare minus sign, which reads as "collapse". It is now the bin glyph (`delete`, added to the icon subset).
- **`db:verify` left accounts behind** (moderator and appeal test users): every account it makes is now removed at the end.
- **Realtime nudges are best-effort.** The local Realtime server regularly stops streaming database broadcasts for minutes ("rebalancing for a closer region", a local-only setup quirk) and drops anything sent meanwhile. The hosted service does not do this routinely, but the app must not depend on one nudge, so every state that waits on someone else also re-checks slowly: a waiting date (15 s), a restricted account (30 s), an open chat (30 s), plus the existing Instant and payment polls.

## Second pass (2026-10-05)

A further sweep after the journey: the website and PWA as shipped, dependency health, and a review of every change made during the journey.

**The PWA**, production build against the local stack (`npm run web:preview`, phone size, dark): sign-in with the code, Discover with photos, a deep link straight to Chats (and a reload on it), a conversation, sending a message, a live reply arriving, the read receipt, Notifications settings when the browser has notifications blocked. All pass.

Found and fixed:
- **The local preview of the production website talked to the hosted project** (SECURITY_AUDIT F-12). PWA.md said to test `web:export` output with `expo serve`, but that build reads `.env.production`; one sign-in code request for a test address reached the hosted project before this was caught. `npm run web:preview` now builds from `.env` only, refuses to serve a bundle naming the hosted project, and serves deep links like the host does (`expo serve` returned "Not Found" for `/chats`).
- **"Message" on the reveal could do nothing offline.** When the conversation id still had to be fetched, the request waited for the connection to return, with no sign of progress. It now fails at once offline (the reveal then opens Chats), and the button shows it is working and ignores a second tap.
- **The age steppers in Filters had no button role on the web**, so screen readers and keyboards met unnamed controls (Android groups them as one adjustable control, which was already right).
- **SDK 57 patch releases** (`expo`, `expo-router`, `expo-constants`, `@expo/ui`) installed; `expo-doctor` passes all checks. The remaining `npm audit` advisories are recorded in SECURITY_AUDIT F-13.

## Checked by automated tests rather than by hand

Everything in `npm run test:all` (TESTING.md): 205 unit tests, 695 pgTAP assertions, 110 HTTP checks against the real local stack, and the 11-check cross-account attack run.

## Not covered (and why)

- **Android push delivery:** needs the owner's FCM service account (C-16).
- **Real payments:** needs Razorpay keys (C-25); the mock provider exercises the same webhook and grant path.
- **A real iPhone:** the PWA was checked in Chrome on Android and an iPhone-size viewport.
- **The production APK on a real phone:** needs the owner's signing key (C-20).
