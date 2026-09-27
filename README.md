# SOUL

**Only for SRM.** An Android-first dating app for verified SRM students (18+), built with Expo SDK 57, TypeScript, Expo Router and Supabase.

Status and progress: see [PHASE_PLAN.md](PHASE_PLAN.md).

## Requirements

- Node 22.13+ (Node 24 used), npm 11
- JDK 17 for Android builds (the system JDK 25 is not used by the Android toolchain)
- Android SDK with platform 36, and an emulator or device (AVD `soul_pixel_api36`)
- Docker Desktop and the Supabase CLI for the local backend (Phase 3+)

## Setup

```bash
npm install
cp .env.example .env        # local values only; never add secrets
npx expo prebuild --platform android
npm run android             # builds and installs the development build
npm start                   # Metro for the dev client
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

## Documentation

| Doc | Purpose |
|---|---|
| [PHASE_PLAN.md](PHASE_PLAN.md) | phases, exit criteria, progress |
| [DECISIONS.md](DECISIONS.md) | decisions and unresolved configuration |
| [ARCHITECTURE.md](ARCHITECTURE.md) | system and code architecture |
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | threat model, RLS, server authority |
| [MOBILE-DESIGN.md](MOBILE-DESIGN.md) | App Read, Nav Read, design dials, motion principles |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | tokens, typography, primitives |
| [MOTION_SYSTEM.md](MOTION_SYSTEM.md) | motion principles and tokens |
| [DATABASE.md](DATABASE.md) | schema, RLS, tests |
| [SUPABASE.md](SUPABASE.md) | local stack, Edge Functions, secrets |
| [skills/SOUL_SKILL_MAP.md](skills/SOUL_SKILL_MAP.md) | Claude skills used to build SOUL |

Later phases add PRIVACY_MODEL.md, BUILD_ANDROID.md and RELEASE_CHECKLIST.md.
