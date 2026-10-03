# SOUL: Visual QA (Phase 17)

Spec section 71: render the screens, inspect them, and do not approve a screen merely because it compiles. Done on 2026-10-03 with the `mobile-taste` pre-flight checks (14.A to 14.C), on the Android emulator (development build, 1080 × 2400) and the PWA in Chrome on the same emulator (phone width). Screenshots: `docs/visual-qa/` (downscaled). The round gear on the right edge of the Android shots is Expo's development-build menu; it is not part of SOUL and is absent from release builds.

Test data: four neutral accounts (`Test User 01` to `04`, one anonymous) with abstract generated photos (no people), so cards, scrims and blur were judged on real images.

## Checked

| Area | Android | Web (PWA) | Verdict |
|---|---|---|---|
| Logo | welcome: the supplied mark, white on the brand black, untouched | same | pass |
| Fonts and typography | Instrument Serif titles, Alegreya Sans body, consistent scale; 1.3× font scale holds on Discover, the tab bar and chat | same fonts after load, no swap flash seen | pass |
| Spacing and grid | one 16 px gutter, sections on the shared rhythm | same | pass after fix 1 |
| Discovery | card photo, scrim, name and hook legible; pass / like; anonymous card blurred and named "Anonymous" | empty state | pass |
| Profile | photos, hook, About me, pinned Pass / Like | | pass after fix 1 |
| Filters | steppers, chip selection with tick, pinned action | | pass |
| Match reveal | black moment, accent heart, serif headline | same | pass after fix 2 |
| Chat and composer | grouped bubbles, day label, delivery line, read receipts | same | pass after fixes 6 and 7 |
| Keyboard | composer flush above the keyboard, newest message in view | page resizes; newest message in view | pass after fix 7 |
| Paywall | plans with prices on the row, honest terms, selected state, "Continue · ₹199" | | pass |
| Instant and compass | intro, candidate card ("within 1 km", no distance), compass with "~450 m", arrow, End Meet, ended state | | pass after fixes 4 and 5 |
| Settings | rows, Notifications, Admin (role only), Delete account | | pass |
| Dark mode | Instant, chat, settings, paywall, purchases | | pass |
| Accent use | wine only on like, match, hearts and the likes pill | | pass |
| Copy | no em dashes except the owner-mandated legal label "DRAFT — REQUIRES FINAL HUMAN/LEGAL REVIEW"; no emoji; no hex colours outside `src/theme` | | pass |

## Found and fixed

1. **Text links were indented by their own padding.** "Report or block", "Unmatch", "Use a different email" and "No action needed" sat 16 to 24 px inside the text above them. `SoulButton` gained `inline` (no side padding, full touch height) and those links use it.
2. **The match reveal waited on a spinner.** The reveal fetched a match the like had just returned. It now draws at once from the liked card while the full match loads behind it (`seedRevealedMatch`).
3. **Switches were teal on the web** (react-native-web's default thumb). Fixed in Phase 14 with `SoulSwitch`; confirmed here.
4. **"Turn off" on Instant** sat inside the right edge (same cause as 1). Now `inline`.
5. **The Instant duration choice could fall below the fold.** With the "Your meet has ended" note showing, 15 / 30 / 60 min was pushed under the pinned button with nothing to show more content existed. The duration now sits in the pinned footer with the button it applies to.
6. **Web composer showed a second, square border** (the browser's focus outline inside the rounded composer). The outline is removed and the composer's own border darkens while it has focus, so keyboard users still see focus (both platforms).
7. **Web chat hid the newest message when the keyboard opened** (Chrome on Android shrinks the page and the list kept its top position). The list now returns to the end when it gets shorter while the reader was at the bottom (both platforms).

## Not verifiable here (and why)

- **Motion feel:** swipe physics, the reveal's entrance and the compass spring were judged in their phases by interaction; screenshots cannot judge timing. Feel on a slow real phone belongs to Phase 19.
- **A real iPhone in Safari / installed PWA:** not available on this machine; the PWA was checked at phone width in Chrome on Android. iOS-only behaviour (Dynamic Type, the iOS keyboard, standalone safe areas) stays on the release checklist.
- **Splash to first screen without a white flash:** the development client shows its own loading; check on a release build (Phase 20).
- **Deep links opened from outside a running development client** to `com.soul.srm://instant` and `com.soul.srm://paywall` sometimes stayed on the current screen. In-app navigation and notification taps use the router directly and were not affected; recheck on a release build.
