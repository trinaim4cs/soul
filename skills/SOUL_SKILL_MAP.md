# SOUL Skill Map

Curated Claude Code skill set for building SOUL (Expo / React Native, Android-first).
Installed 2026-09-27. Raw exports of every source repo stay in `D:\SOUL\skills\<owner>__<repo>\` as reference copies; the pinned commits are in `manifest.json`.

## Totals

| Group | Count | Where | State |
|---|---|---|---|
| Standalone skills | 38 | `~/.claude/skills/<name>/` | Active (model-invocable) |
| ui-ux-pro-max plugin, SOUL-relevant part | 1 (`ui-ux-pro-max`) | plugin `ui-ux-pro-max@ui-ux-pro-max-skill` | Enabled |
| Audit plugin | 12 | plugin `soul-audit@soul-local` | **Installed, disabled** |
| **SOUL-relevant total** | **51** | | |
| Bundled extras in the ui-ux-pro-max plugin (can't install it partially) | 6 | same plugin | Enabled, not SOUL-relevant |

Tags:
- **ALWAYS AVAILABLE**: the core build loop. Claude should reach for these by default on SOUL work.
- **USE WHEN NEEDED**: installed and model-invocable, but only relevant to specific tasks.
- **AUDIT ONLY**: in the `soul-audit` plugin, which stays disabled until a security, release or audit phase.

## Installed skills

### Priority 1: Mobile / Expo (source: expo/skills @ efa52f0a9d)

| Skill | Tag | Use in SOUL |
|---|---|---|
| expo-overview | ALWAYS AVAILABLE | Entry point that routes every Expo/EAS task to the right skill. Holds the shared setup rules. |
| expo-router | ALWAYS AVAILABLE | File-based routes, stacks, tabs, modals, form sheets, deep links |
| expo-ui | ALWAYS AVAILABLE | `@expo/ui` native components (Jetpack Compose on Android): sheets, pickers, switches, menus |
| expo-native-ui | ALWAYS AVAILABLE | Native-feeling screens, semantic colors, platform controls |
| expo-design-system | ALWAYS AVAILABLE | Theme tokens and the component library inside the app |
| expo-animation | ALWAYS AVAILABLE | Motion decisions implemented with Reanimated, Gesture Handler and haptics |
| expo-data-fetching | ALWAYS AVAILABLE | API calls, React Query, offline support, loading/empty/error states |
| expo-project-structure | USE WHEN NEEDED | Scaffolding a new Expo app only. Never restructures an existing one. |
| expo-dev-client | USE WHEN NEEDED | Dev builds, needed once native modules (location, camera, sensors) go beyond Expo Go |
| expo-module | USE WHEN NEEDED | Custom native modules/views (Kotlin) when no library covers a sensor or permission need |
| expo-examples | USE WHEN NEEDED | Canonical `with-*` integrations (Supabase, maps, Reanimated, SQLite…) |
| expo-upgrade | USE WHEN NEEDED | SDK upgrades and dependency fixes |
| eas-app-stores | USE WHEN NEEDED | Builds, signing and Play Store submission |
| eas-update | USE WHEN NEEDED | Over-the-air updates, channels, runtime versions |
| eas-workflows | USE WHEN NEEDED | EAS CI/CD workflow YAML |

### Priority 2: Mobile visual quality (source: draftbit/mobile-taste-skill @ eb58d98)

| Skill | Tag | Use in SOUL |
|---|---|---|
| mobile-taste | ALWAYS AVAILABLE | Building screens that don't look AI-generated (App Read, Nav Read) |
| mobile-nav-plan | USE WHEN NEEDED | Tab/route/modal/sheet plan and Android back-button plan before building |
| mobile-design-system | USE WHEN NEEDED | Token proposal. The SOUL spec's brand tokens override its suggestions. |
| mobile-design-review | USE WHEN NEEDED | Report-only design audit (Design Score, AI Slop Score) |
| mobile-redesign-screen | USE WHEN NEEDED | Redesigning one screen. Only on explicit request. |
| mobile-redesign-app | USE WHEN NEEDED | Whole-app redesign. Only on explicit request; never a rebrand of SOUL. |

The suite has no separate motion skill; motion is covered inside `mobile-taste`. The `_shared/` folder (references and blocks) sits next to the six skills in `~/.claude/skills/_shared/`. It is not a skill.

### Priority 3: Design (source: mae616/design-skills @ 79e3398bee)

| Skill | Tag | Use in SOUL |
|---|---|---|
| ui-designer | ALWAYS AVAILABLE | Screen information architecture, interaction and visual tone turned into implementable specs |
| frontend-implementation | ALWAYS AVAILABLE | Turning designs into robust components |
| creative-coder | ALWAYS AVAILABLE | Motion and micro-UX turned into implementable constraints (pairs with Reanimated) |
| accessibility-engineer | ALWAYS AVAILABLE | Accessible props and semantics on every UI |
| usability-psychologist | USE WHEN NEEDED | Cognitive load, error prevention, drop-off analysis |

(Upstream sets `user-invocable: false`, so these don't show in the `/` menu, but Claude still invokes them.)

### Priority 4: UX review (source: szilu/ux-designer-skill @ 3f058996e2)

| Skill | Tag | Use in SOUL |
|---|---|---|
| ux-designer | USE WHEN NEEDED | Reviewing onboarding, verification, privacy, permissions, safety, forms, error states and accessibility |

**Brand guard:** a local section appended to its `SKILL.md` forbids brand, logo, palette, typography, voice or signature-motion changes. Conflicts with the brand are reported as findings with brand-preserving fixes.

### Priority 5: Android (source: rinkuniks/android-claude-skill @ acb8f9d724)

| Skill | Tag | Use in SOUL |
|---|---|---|
| android-development | USE WHEN NEEDED | Kotlin/Compose native code (Expo modules, config plugins) and Android audits covering ANR risk, leaks and security |

It was chosen over dpconde/claude-android-skill because it is a strict superset: the same content plus `audit-checklist.md` and an audit/refactor workflow. The dpconde copy stays at `D:\SOUL\skills\dpconde__claude-android-skill\` as reference only.

### Priority 6: Visual QA (run after screens render)

| Skill | Source | Tag | Use in SOUL |
|---|---|---|---|
| pixel-perfect | Huc91/pixel-perfect-skill @ 2c67788274 | USE WHEN NEEDED | Android emulator screenshot (`adb`) vs reference image: spacing, alignment, type, sizing, hierarchy |
| grade | brianharms/skill-grade @ 3ef630faa9 | USE WHEN NEEDED | Honest PASS/FAIL screenshot grading into AUDIT.html. Needs a browser screenshot tool, so it covers Expo web builds. For Android, use pixel-perfect. |

### Priority 8: Anthropic (anthropics/skills @ 33375500bc)

None were newly installed. The relevant ones are **already present** in `~/.claude/skills` (left untouched): `frontend-design`, `webapp-testing`, `skill-creator`, `claude-api` (only if SOUL calls Claude), `mcp-builder` (only if SOUL builds an MCP server).

### Priority 9: Everything Claude Code (affaan-m/everything-claude-code @ e482e57941): 8 of 292

| Skill | Tag | Use in SOUL |
|---|---|---|
| react-native-patterns | ALWAYS AVAILABLE | State separation, TanStack Query + Zod, lists, secure storage |
| error-handling | USE WHEN NEEDED | Typed errors, error boundaries, retries, user-facing failure copy |
| postgres-patterns | USE WHEN NEEDED | Schema, indexes, **RLS** (based on Supabase best practices) |
| database-migrations | USE WHEN NEEDED | Safe schema and data migrations, rollbacks |
| security-checklist | USE WHEN NEEDED | Auth, input, secrets and sensitive-feature checklist (upstream name `security-review`, renamed, see below) |
| api-design | USE WHEN NEEDED | REST/edge-function endpoint design |
| git-workflow | USE WHEN NEEDED | Branching, commits, merge vs rebase, conflicts |
| verification-loop | USE WHEN NEEDED | Build, types, lint and tests gate before calling work done |

### UI-UX-Pro-Max (official plugin install)

- Canonical repo: **nextlevelbuilder/ui-ux-pro-max-skill @ 823b0a14d3** (v2.13.0). `nicohodt/claude-code-ui-ux-skill` is a rebranded fork and was not used.
- Installed with the README's Claude Code method: `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` + `claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill`.
- `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py` resolves inside the plugin cache and was executed successfully (style and `--stack react-native` queries).

| Skill | Tag |
|---|---|
| ui-ux-pro-max:ui-ux-pro-max | USE WHEN NEEDED (design-intelligence search; React Native stack guidelines) |
| ui-ux-pro-max:design, :design-system, :brand, :banner-design, :slides, :ui-styling | Bundled, not SOUL-relevant (logos, banners, decks, shadcn/Tailwind web) |

### Priority 7: Audit / production (`soul-audit@soul-local`, disabled)

| Skill | Source | Tag |
|---|---|---|
| production-readiness (orchestrator) | Nordic-AI/production-readiness-skills @ 0105f3d677 | AUDIT ONLY |
| security-audit | Nordic-AI | AUDIT ONLY |
| data-protection-audit | Nordic-AI | AUDIT ONLY |
| compliance-check | Nordic-AI | AUDIT ONLY |
| reliability-audit | Nordic-AI | AUDIT ONLY |
| release-readiness | Nordic-AI | AUDIT ONLY |
| supply-chain-audit | Nordic-AI | AUDIT ONLY |
| accessibility-audit | Nordic-AI | AUDIT ONLY |
| observability-audit | Nordic-AI | AUDIT ONLY |
| scalability-review | Nordic-AI | AUDIT ONLY |
| test-coverage | Nordic-AI | AUDIT ONLY |
| audit-deps | soreavis/claude-audit-skills @ f20ae6ae9b | AUDIT ONLY |

Why a local plugin: the Nordic orchestrator delegates to its specialists through the Skill tool. Marking them `disable-model-invocation` would break that. A disabled plugin keeps all 12 out of context until needed, and works fully when enabled. Nordic ships no plugin manifest, so the files are repackaged unmodified under `~/.claude/soul-plugins/soul-audit/` (marketplace `soul-local`), with its `docs/CONVENTIONS.md` and `schemas/` so the `../../docs/CONVENTIONS.md` links resolve.

Audit phase on/off:
```bash
claude plugin enable soul-audit@soul-local
```
```bash
claude plugin disable soul-audit@soul-local
```
Start a new Claude Code session after toggling (plugins load at session start). Then run `/soul-audit:production-readiness` or a single specialist.

## Reference-only repositories (not installed as skills)

Consult these when implementing. Prefer the installed version in `node_modules` and the matching docs version.

| Repo | Docs | Consult for |
|---|---|---|
| software-mansion/react-native-reanimated | docs.swmansion.com/react-native-reanimated | **Key.** Shared values, worklets, layout animations, `useAnimatedKeyboard`, springs: floating components, chat composer movement, typing animation, keyboard transitions, profile transitions, match animation, Instant Meet compass, live distance UI, microinteractions |
| software-mansion/react-native-gesture-handler | docs.swmansion.com/react-native-gesture-handler | **Key.** Gesture composition (Pan/Fling/Simultaneous), swipe gestures, sheets, drag-to-dismiss, gesture-to-animation hand-off |
| facebook/react-native | reactnative.dev | Core component and API behavior, New Architecture, Android specifics |
| expo/expo | docs.expo.dev | SDK module source (location, camera, sensors, permissions), config plugins |
| microsoft/playwright-mcp | github.com/microsoft/playwright-mcp | Only if Expo web E2E is needed later. Not connected. |

`expo-animation` already writes Reanimated and Gesture Handler code. Check the API against these docs for the SDK version in use. The gesture-handler repo's own `gesture-handler-3-migration` skill and expo/expo's internal skills (`expo-sqlite`, `android-e2e-testing`, `deep-code-review`, `expo-review`, `expo-api-docs`) were intentionally **not** installed, per the reference-only rule. Copies remain in `D:\SOUL\skills\`.

## Connectors

Asana, Atlassian, Intercom, Linear, Notion, Slack: **not connected** (irrelevant to SOUL). Figma: **not connected** until you decide otherwise. pixel-perfect therefore uses local reference images, not Figma URLs.

## Intentionally skipped

| Skipped | Why |
|---|---|
| expo/skills: eas-hosting | Web hosting and API-route deploys, not the mobile app |
| expo/skills: eas-simulator | Paid remote simulators. A local Android SDK/emulator is available. |
| expo/skills: eas-observe, eas-update-insights | Paid post-launch monitoring. Add at launch. |
| expo/skills: expo-app-clip | iOS-only |
| expo/skills: expo-brownfield, expo-dom, expo-web-to-native | No existing native or web app to embed or migrate |
| expo/skills: expo-migrate-module | Swift DSL migration only |
| expo/skills: expo-skill-eval, expo-skill-feedback | Expo repo tooling and telemetry/feedback |
| — (no such skill exists) | There is no dedicated Expo "Android", "permissions", "location", "camera" or "sensors" skill in expo/skills. Covered by expo-dev-client + expo-module + android-development + expo/expo reference. |
| dpconde/claude-android-skill | Subset of the rinkuniks version (kept as reference) |
| nicohodt/claude-code-ui-ux-skill | Fork of the canonical ui-ux-pro-max |
| Nordic-AI: ai-readiness | Only relevant if SOUL ships AI/LLM features. Add if the spec says so. |
| soreavis: audit-security, audit-compliance, audit-a11y | Duplicate the stronger, not web-only Nordic equivalents |
| soreavis: audit-seo, audit-responsive, audit-forms, audit-deploy | Web-site specific (SEO, CSS breakpoints, HTML forms, web deploy) |
| soreavis: audit-deep, audit-tech-stack | Overlap with security-audit and code review |
| soreavis: audit-all, audit-diff | Orchestrator and report differ for the skipped soreavis suite |
| soreavis: audit-hallucination | Only if SOUL uses LLMs |
| anthropics: docx, pptx, xlsx, pdf, algorithmic-art, canvas-design, slack-gif-creator, theme-factory, brand-guidelines, internal-comms, doc-coauthoring, web-artifacts-builder, academy-guide, discernment-nudge, template | Unrelated document/media/meta or blank template (most were already installed before, left as is) |
| ECC: react-testing, tdd-workflow | Web-focused (Vitest/DOM) and reference repo files not shipped with the skill (`../e2e-testing`, `scripts/setup-package-manager.js`) |
| ECC: e2e-testing, react-performance, react-patterns, frontend-a11y, motion-foundations/-patterns/-advanced, make-interfaces-feel-better | Web / Next.js / motion-react specific. RN equivalents already come from Expo, draftbit and mae616. |
| ECC: github-ops | Needs the `gh` CLI, which is not installed |
| ECC: documentation-lookup | Needs a Context7 MCP server, which is not connected |
| ECC: production-audit, canary-watch | Duplicate of the Nordic suite, and web-URL canaries |
| ECC: backend-patterns, coding-standards, android-clean-architecture, remaining ~270 | Express/Next.js backend, generic, KMP/native Android, or unrelated domains |
| ECC plugin `ecc@ecc` v2.2.2 | Found already installed but **not enabled**. Left untouched. |

## Local modifications (vs upstream)

1. `~/.claude/skills/ux-designer/SKILL.md`: appended the "SOUL project scope" brand guard section.
2. `~/.claude/skills/security-checklist/`: ECC `security-review` renamed (folder + `name:`), because Claude Code's built-in `/security-review` shadowed it and it never loaded.
3. `soul-audit` plugin: packaging only (`plugin.json`, `marketplace.json`, licenses folder). Skill files are byte-for-byte upstream.
4. draftbit/mobile-taste-skill: its official plugin install failed to load on this Claude Code version (`conflicting manifests: both plugin.json and marketplace entry specify components`). It was uninstalled and replaced with the README's documented manual install (`skills/*` including `_shared/` into `~/.claude/skills`).

## Verification (2026-09-27)

- **No existing skill overwritten.** All 712 files of the 30 pre-existing `~/.claude/skills` folders were hashed before install and re-checked after. All are identical. Every copy step refused existing names.
- **Frontmatter:** all 57 installed skills (38 standalone + 7 ui-ux-pro-max + 12 audit) have `name` matching the folder, plus a `description`.
- **Paths:** every relative link, `../_shared/…`, `../../docs/CONVENTIONS.md` and `${CLAUDE_PLUGIN_ROOT}/…` reference resolves. The remaining flags were project-output paths the skills create in *your* project (e.g. `docs/privacy-policy.md`, `assets/design-tokens.json`, `assets/icons/wifi.xml`) or a sibling-skill reference that exists (`eas-app-stores/references/native-ios.md`).
- **Scripts:** all `.py` compile, all `.js` pass `node --check`. Executed OK: ui-ux-pro-max `search.py`, pixel-perfect `compare.py` (Pillow + numpy present), android `generate_feature.py`, expo-ui `list-components.js`, eas-workflows `fetch.js` (fetched Expo docs).
- **Loading:** 38 standalone skills appear in the live session skill list. `claude plugin list` shows ui-ux-pro-max enabled and soul-audit disabled (12 skills, 0 hooks/MCP/agents).

## Known runtime prerequisites (not installed; install when you need them)

- `eas-cli` is not installed and EAS services need an Expo account: `npm i -g eas-cli`, then `eas login`. Needed for the eas-* skills.
- pixel-perfect **web** capture needs `pip install playwright && python -m playwright install chromium`. The Android path uses `adb`, which is present (1.0.41).
- `gh` CLI is not installed. It only matters if github-ops or PR automation is wanted later.
- grade needs a screenshot-capable browser tool (Claude in Chrome or the built-in browser pane).

## Open decision

The pre-existing standalone `~/.claude/skills/ui-ux-pro-max` (plus `design`, `design-system`, `brand`, `banner-design`, `slides`, `ui-styling`) is an older manual copy. It calls `${CLAUDE_PLUGIN_ROOT}/…`, which is **undefined outside a plugin**, so its scripts cannot run. The working copy is now the plugin (`ui-ux-pro-max:*`). The old copies were left in place per the no-overwrite rule. Removing them would drop 7 duplicate entries from every session.
