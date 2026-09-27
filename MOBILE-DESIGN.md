# SOUL: Mobile Design Reads

This is the durable design commitment file (the `mobile-taste` skill). Later sessions read it before any UI decision. Token details live in `DESIGN_SYSTEM.md`, and motion in `MOTION_SYSTEM.md` (both Phase 2).

## App Read

```
APP READ: intimate local dating app for verified SRM students (18+), quiet premium monochrome
language with one romantic accent (wine/rose, like/match/heart only, D-026), leaning Expo Router + StyleSheet tokens + Reanimated/Gesture Handler, native chrome.
platforms: Android first-class · iOS not a V1 target · web none
posture: unified-brand (Android is the reference)
```

- **Kind:** consumer social / dating. The content (the person) is the UI. Chrome stays quiet.
- **Vibe:** intimate, elegant, youthful, premium, spacious, safe, exclusive, deliberate.
- **Audience and context:** students on mid-range and flagship Android phones, one-handed use, often outdoors on campus. Big touch targets and a thumb-zone for primary actions.
- **Quiet constraints:** 18+, privacy-critical (location, identity), safety-critical (Instant Meet), no dark patterns and no fake engagement.
- **Offline:** the network layer exists, so offline banners and cached-content states are required.
- **Dating-first, not social-first (owner feedback 2026-09-27: "too X"):** photos lead every discovery surface, italic Instrument Serif carries the romance, the welcome and match moments are black, copy is intimate and personal, and the chrome stays quiet.
- **Not:** Tinder, a gaming UI, an ERP, a SaaS dashboard, a social feed, anything AI-templated. X is used **only** as a motion-quality reference, never for UI.

## Dials

| Dial | Value | Reason |
|---|---|---|
| DESIGN_EXPRESSION | 7 | branded premium content (photography, Carcade headings, monochrome); native navigation chrome kept |
| MOTION_INTENSITY | 6 | motion is a product requirement (swipe, sheets, composer, compass), but restrained and interruptible, with no decoration |
| VISUAL_DENSITY | 2 | spacious; generous negative space; photos dominant |

**Signature element per screen (one only):** Discover has the swipe card, Chat the floating composer, Instant the compass, the profile its full-bleed first photo, and Match the brief reveal. Everything else stays quiet.

## Nav Read

```
NAV READ
platforms: Android (iOS/web: not V1)
tabs (4): Discover · Instant · Chats · You
src/app/
  _layout                      root: providers, fonts, splash gate, session + eligibility guards
  (auth)/                      shown when signed out
    welcome                    logo + "Only for SRM."
    email                      SRM email
    otp                        code entry
  (onboarding)/                shown when signed in but not yet eligible (step resumes from server state)
    age                        18+ gate
    student                    student verification intro
    id-capture                 camera, fullscreen
    selfie                     liveness, fullscreen
    status                     pending / rejected / retry
    primary-photo              in-app capture
    profile-setup              hook, About Me, gender, preference, zodiac visibility
    location                   primed permission, then eligibility result
  (app)/
    (tabs)/
      discover/index           Discover feed (swipe + vertical profile) → sheet: filters
      instant/index            landing (gate / setup / searching / candidate / waiting-accept)
      chats/index              matches + conversations
      you/index                own profile preview → edit, settings
    chat/[conversationId]      push (tab bar hidden)
    profile/[userId]           push (profile from chat/match)
    instant/session/[sessionId] fullscreen: compass, distance, timer, chat, End Meet
    instant/chat/[sessionId]   push from session
    edit-profile               modal
    settings/index             push → account, profile, discovery, privacy, blocked,
                               notifications, location, verification, subscription,
                               swipe-balance, data-privacy, delete-account
    paywall                    fullscreen modal
    top-up                     modal
    match/[matchId]            transparent modal (match reveal)
sheets: filters, report, block-confirm, date-confirmation, hot-person-info, meeting-point,
        safety-check ("Everything okay?")
entry points: settings ← You tab header · filters ← Discover header · paywall ← swipe
              exhausted / Instant gate / subscription · report/block ← every profile + chat header
deep links (scheme com.soul.srm, C-04): com.soul.srm://chat/:conversationId · com.soul.srm://match/:matchId · com.soul.srm://instant/session/:sessionId
            (no verification route: email + OTP only, D-027)
android back: default pop everywhere; onboarding steps pop to the previous step; the
              Instant session back returns to the Instant tab with the session still live
              (a banner shows); only "End Meet" ends it; edit-profile confirms discard
max taps to any core screen: 2
```

Rules applied: 4 tabs with visible one-word labels. There is no Settings tab and no FAB. Auth and onboarding are route groups guarded by server state. Every modal has an explicit close. Report and block are reachable from every profile and chat surface. No screen opens more than 2 distinct sheets, except chat, which exposes safety actions from one overflow sheet.

## Motion principles (quality reference: X Android, motion only)

1. **Continuity:** gestures hand off to springs carrying the release velocity. Nothing snaps.
2. **Interruptible:** every animation can be grabbed or reversed mid-flight.
3. **Damped, not bouncy:** critically or near-critically damped springs. At most a whisper of overshoot on release.
4. **Fast in, faster out:** entrances slightly longer than exits. Opacity leads translation on exit.
5. **Chrome reacts to movement:** the floating composer and floating controls follow the keyboard and scroll on the UI thread.
6. **Small distances:** tab and profile transitions use short translations (8 to 16 dp) with a fade, never full-screen slides.
7. **Reduced motion:** decorative motion becomes instant, while gestures still track the finger.

Exact tokens are in `MOTION_SYSTEM.md` (Phase 2).
