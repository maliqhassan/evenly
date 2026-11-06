# Evenly

Shared money, made simple. Evenly is an Android and iOS expense-sharing app: create groups, add shared expenses, split them five ways, see who owes whom, and record settlements.

**Stack:** Expo SDK 58 · React Native 0.88 · TypeScript (strict) · Expo Router · Firebase Auth (Google only) → Supabase (Postgres, RLS, RPCs, Storage, Realtime, Edge Functions) · TanStack Query · Zustand · React Hook Form + Zod · Expo SQLite (offline cache) · Expo Notifications · Sentry · PostHog.

## Quick start (demo mode, no backend)

```bash
npm install
npx expo start          # .env already sets EXPO_PUBLIC_DEMO_MODE=true
```

Demo mode runs every screen against an in-memory backend seeded with the design's sample data (Flatmates, Lisbon Trip, Office Lunch…). It works in Expo Go. Nothing is saved.

## Real backend

Follow **[docs/SETUP.md](docs/SETUP.md)**. In short: create a Firebase project (Google sign-in plus the blocking functions in `firebase/functions`), create a Supabase project (enable the Firebase third-party provider, run the migrations, set `firebase_project_id`), fill in `.env`, then build a development client:

```bash
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start --dev-client
```

Google Sign-In uses native code, so the real auth flow needs a development build (not Expo Go).

## Scripts

| Command                         | What it does                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm start`                     | Metro dev server                                                                                     |
| `npm run typecheck`             | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`)                                                  |
| `npm run lint` / `npx eslint .` | ESLint (Expo config, React Compiler rules)                                                           |
| `npm test`                      | Jest: money domain, ledger read models, Split screen                                                 |
| `npm run test:db`               | Runs **all Supabase migrations in PGlite** and tests RLS, RPCs, idempotency and balances (no Docker) |
| `npm run check`                 | All of the above                                                                                     |

## Project layout

```
src/
  app/                 Expo Router routes (screens 01–23 from the design)
    (auth)/            02 Welcome · 03 Sign in · 05 Sign-in error
    (onboarding)/      04 Complete profile · 06 Preferences
    (app)/(tabs)/      07 Dashboard · 11 Groups · 09 Activity · 10 Friends (+ floating tab bar)
    (app)/…            08 Notifications · 12 New group · 13 Invite · 14 Group · 18 Balances
                       15 Add expense · 16 Split · 17 Expense · 19 Settle up · 20 Record · 21 Recorded
                       22 Reports · 23 Profile · settings/* · join/[code]
  api/                 Api contract + Supabase and demo implementations, error mapping
  components/          Design-system components (Button, Card, ListRow, AmountText, TabBar…)
  domain/money/        Integer-minor-unit money, 5 split algorithms, balances, debt simplification
  domain/ledger.ts     Read models (dashboard, friends, settle up) derived from server balances
  features/            Screen-level building blocks
  lib/                 auth (Firebase), config, session, offline cache, push, monitoring
  queries/             TanStack Query hooks + invalidation
  stores/              Zustand: session, expense/onboarding drafts
  theme/               Colour, type, spacing tokens (no hex values outside this folder)
supabase/
  migrations/          Schema, RLS, internal helpers, RPCs (the security boundary)
  functions/           push-dispatch Edge Function (Expo push)
  tests/               PGlite harness + DB tests
firebase/functions/    Blocking functions adding the `role` claim Supabase needs
design_handoff_evenly/ Original design handoff (visual source of truth)
docs/                  SETUP.md, ARCHITECTURE.md
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design decisions, the security model and where the build intentionally departs from the design.
