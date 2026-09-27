# SOUL: Design System

The source of truth is the code in `src/theme/` (tokens) and `src/components/` (primitives). This document explains the rules. Direction and dials are in `MOBILE-DESIGN.md`; decisions in `DECISIONS.md` (D-003, D-021, D-022, D-025, D-026).

Preview: in a development build, open `com.soul.srm://design-system` (the route is guarded and does not exist in production).

## Principles

- **Dating-first, not social-first.** The person leads: photography is the largest element on every discovery surface. Chrome is quiet.
- **Spacious.** A 24 dp gutter, 40 dp between sections, and the larger spacing steps by default.
- **Monochrome + one romantic accent.** Black, white and one neutral grey ramp. Wine and rose are used for like, match and heart moments only.
- **One signature per screen**: the swipe card, the floating composer, the compass, the full-bleed first photo or the match reveal. Everything else stays calm.

## Colour (`src/theme/colors.ts`)

Semantic tokens with light and dark values, following the system appearance (D-025). Screens never use hex values; a lint rule blocks hex literals outside `src/theme`.

| Token | Use |
|---|---|
| `background`, `surface`, `surfaceSubtle`, `surfacePressed` | screen, raised surfaces, quiet fills, pressed rows |
| `textPrimary`, `textSecondary`, `textTertiary`, `textDisabled` | text hierarchy (tertiary still ≥ 4.5:1) |
| `inverseSurface`, `inverseText` | primary button, solid badges |
| `divider`, `border`, `borderStrong` | hairlines, input borders, focus and outline |
| `skeleton`, `skeletonHighlight` | loading |
| `scrim`, `photoScrim`, `onPhoto` | overlays, text on photos |
| `accent`, `onAccent` | **like, match and hearts only** (wine in light, rose in dark) |
| `moment`, `onMoment`, `onMomentSecondary`, `accentOnMoment` | fixed black brand moments (welcome, match reveal) in both appearances |
| `paper` | fixed white surface (black logo blocks) |

`src/theme/colors.test.ts` enforces the WCAG AA contrast of every text/background pair in both appearances. Colour is never the only state signal: errors carry an icon and text, and a like carries the heart icon.

## Typography (`src/theme/typography.ts`)

| Role | Family | Size / line | Use |
|---|---|---|---|
| `display` | Instrument Serif | 56/60 | brand hero (welcome, match) |
| `title` | Instrument Serif | 40/44 | page titles |
| `section` | Instrument Serif | 30/34 | major sections |
| `subheading` | Instrument Serif | 23/28 | secondary headings, the hook, premium moments (italic allowed) |
| `body` / `bodyStrong` | Alegreya Sans 400/500 | 18/26 | bios, chat, instructions |
| `button` | Alegreya Sans 700 | 17/22 | button labels |
| `label` | Alegreya Sans 500 | 17/22 | tabs, inputs, filters |
| `supporting` | Alegreya Sans 400 | 16/22 | helper copy, metadata |
| `caption` | Alegreya Sans 400 | 14/19 | small metadata |
| `micro` | Alegreya Sans 500 | 12/15 | badges only |

- Always render text with `SoulText` (`variant`, `tone`, `italic`, `numeric`). Never set font families or sizes in screens.
- Font scaling: body roles are unbounded. Chrome-like and very large roles have a `maxFontSizeMultiplier` (1.15 to 1.4). Verified at 1.3× on the emulator.
- Display roles shrink by 12 % on screens narrower than 360 dp.
- `numeric` turns on tabular figures for timers, distances, balances and prices. Prices always use the body family (Instrument Serif has no `₹`).
- Android: centered serif text must span the full width (`alignSelf: 'stretch'`). Shrink-wrapped centered text can clip its last word (seen and fixed in Phase 2).

## Spacing, shape, size

- `spacing`: 4, 8, 12, 16, 24, 32, 40, 56, 80. `layout.screenGutter` 24, `sectionGap` 40, `stackGap` 16, `maxTextWidth` 560.
- `radii` (shape lock): buttons and badges use `full`; inputs `md` 16; photos `lg` 24; sheets `xl` 32.
- `sizes`: touch target ≥ 48 dp; buttons 56/48/40; input 56; list row 64; avatar 32/44/56/96; photo aspect 4:5.
- `shadows` are `boxShadow` strings, used only for floating elements. `layers` are the z-order.

## Icons

**Material Symbols** (Apache-2.0) is the single icon family. Sizes are 18, 22, 28 and 36. Icons are decorative unless given a label. No emoji, no hand-drawn paths.

- SOUL ships a **subset** of the font (`assets/fonts/SoulIcons-Light.ttf` and `SoulIcons-Regular.ttf`, weights 300 and 400) holding only the glyphs in `src/theme/icons.ts`. The full font is about 1 MB per weight; the subset is a few kilobytes, which matters for the PWA's first load.
- `SoulIcon` renders the glyph as text in the `SoulIcons` family (light by default, regular for small sizes that need weight). It is embedded natively and registered on the web like the brand fonts, so icons never pop in.
- **Adding an icon:** add its name and code point (from `expo-symbols/build/android/symbols.json`) to `src/theme/icons.ts`, then run `npm run icons:subset` and rebuild the Android app.
- The tab bar uses the same names through NativeTabs `md` (native) and `SoulIcon` (web).

(Before phase P, `SoulIcon` wrapped `expo-symbols`, which loads the full font at runtime per icon and rendered blank on Android. Replaced for that reason.)

## Primitives (`src/components/`)

| Component | Notes |
|---|---|
| `SoulText` | role-based typography, tone, italic (display family), numeric |
| `SoulButton` | `primary` ink pill, `secondary` outlined, `ghost` text. Sizes lg/md/sm; loading, disabled, icon, block. Destructive actions use wording, not colour. Never the accent |
| `PressableScale` | press feedback for every touchable (see MOTION_SYSTEM) |
| `SoulInput` | label above, helper, error with icon, live counter (hook: 30), multiline (About Me); focus = strong border |
| `SoulScreen` | safe areas (top inset on the container, so nothing scrolls under the status bar), gutter, scroll option, pinned footer |
| `SoulLogo` | the supplied mark as is; black or white by surface; ≤ 180 dp |
| `SoulPhoto`, `SoulAvatar` | `expo-image`, cover crop, blurhash placeholder, recycling key |
| `SoulBadge`, `VerifiedBadge`, `HotPersonBadge` | monochrome only; Hot Person shows the badge, never a count |
| `Skeleton`, `LoadingState` | layout-mirroring placeholders, gentle pulse, static under reduced motion |
| `EmptyState`, `ErrorState`, `OfflineState`, `PermissionState` | composed interstitials with a clear next action |
| `SoulIcon` | Material Symbols |

**Not yet built, on purpose** ("build when first reused"): `SoulSheet` and `SoulModal`. Following the `expo-ui` skill rule, they are evaluated first with `@expo/ui` BottomSheet (Jetpack Compose) against Expo Router `formSheet`, when the first sheet (Discover filters) is built in Phase 7. Feature components (`ProfileHeader`, `ChatComposer`, `InstantCompass` …) are built in their feature phases.

## Web (iPhone PWA)

The same tokens and primitives render on the web (D-035). Web-specific rules:

- **Fonts:** Alegreya Sans and Instrument Serif and the icon font are registered with `FontFace` weight descriptors under the same family names as on Android, so `fontWeight` selects the right file on both platforms. The first render waits for them (short timeout), so there is no font swap.
- **Layout:** a single phone-width column, at most 480 px, centred on larger screens with the background colour around it. Never a desktop layout.
- **Safe areas:** `viewport-fit=cover` plus `env(safe-area-inset-*)` through react-native-safe-area-context. The standalone status bar style is `default`, which stays readable on both light and dark screens.
- **Touch:** targets stay ≥ 48 px, nothing depends on hover, and text inputs use ≥ 16 px text so iOS Safari does not zoom on focus (the `label` and `body` roles already are).
- **Motion:** the same tokens; `prefers-reduced-motion` maps to the reduced-motion setting.

## Copy rules

Sentence case. No em dashes, no exclamation marks in system copy, no filler ("seamless", "unlock"). No human sample names: use `Profile 01`, `User A`. Errors say what happened and what to do next.
