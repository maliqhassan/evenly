@AGENTS.md

# Evenly — project rules

Visual source of truth: `design_handoff_evenly/design/Evenly App Flow.dc.html` (screens 01–23). Read `design_handoff_evenly/README.md` before UI work. Architecture and deviations: `docs/ARCHITECTURE.md`.

## Decisions that override the original handoff

- **Auth is Firebase Authentication with Google only** (per the SRS), not Supabase Auth with Apple and Google. Supabase verifies the Firebase ID token through its third-party auth integration. Never use `auth.uid()` in SQL: Firebase UIDs aren't UUIDs. Use `public.current_profile_id()` / `public.firebase_uid()`.
- Routes live in `src/app` (Expo SDK 58 convention), not `app/`.

## Stack (do not substitute)

Expo SDK 58 · React Native · TypeScript strict · Expo Router · Firebase Auth (Google) · Supabase (Postgres, RLS, RPCs, Storage, Realtime, Edge Functions) · Zustand · TanStack Query · React Hook Form + Zod · Expo SQLite · Expo Notifications · Sentry · PostHog · DM Sans · lucide-react-native.

## UI rules

- Colours, type, spacing and radii come from `src/theme/*`. No hex/rgba in screens (the Google "G" brand mark is the only exception).
- DM Sans only. All money renders through `AmountText` (tabular numbers; green = owed to you, red = you owe).
- Lucide icons via `components/Icon` (stroke 2). Build from `src/components`.
- Hit targets ≥ 44pt; every icon-only control has an `accessibilityLabel`.
- Match copy from the design unless a documented deviation applies.

## Money & data rules

- Integer minor units + ISO 4217 everywhere. Never floats. Use `src/domain/money` (tested).
- Splits must sum exactly to the total; leftover cents go by largest remainder, ties in stable member order.
- Never combine currencies in one total.
- Every write goes through a SECURITY DEFINER RPC in `supabase/migrations` that re-validates everything. Clients have no INSERT/UPDATE/DELETE on financial tables. Creates are idempotent on `(created_by, client_id)`.
- Edits use optimistic concurrency (`expected_version`) and write `audit_logs`.

## Workflow

- Before finishing: `npm run check` (typecheck, eslint, jest, PGlite DB tests).
- Ask before adding new dependencies. Install Expo packages with `npx expo install`.
- Small, descriptive commits.
