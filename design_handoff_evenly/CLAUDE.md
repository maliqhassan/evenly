# Evenly — project rules for Claude Code

Read `design_handoff/README.md` before any UI work. The visual source of truth is `design_handoff/design/Evenly App Flow.dc.html` (screen numbers 01–23 are referenced in tasks).

## Stack (do not substitute)
Expo (latest SDK) · React Native · TypeScript strict · Expo Router · Supabase (Auth, Postgres, Storage, Edge Functions) · Zustand · TanStack Query · Zod · `@expo-google-fonts/dm-sans` · `lucide-react-native` · Expo Notifications · Sentry.

## Auth
- Sign in with **Apple** and **Google** only (Supabase `signInWithIdToken`). No email/password, no reset-password flow.
- First sign-in → Complete profile → Preferences. Failure/cancel → sign-in-error screen.

## UI rules
- All colours, type, spacing, radii come from `src/theme/*`. No hard-coded hex values in screens.
- Font: DM Sans only. All money uses `AmountText` (tabular numbers, green = owed to you, red = you owe).
- Icons: Lucide only, stroke 2.
- Build screens from shared components in `src/components/` (Button, Card, ListRow, Avatar, Field, Chip, Segmented, TabBar…). Create a component before duplicating markup twice.
- Hit targets ≥ 44pt. Support light theme now; keep tokens ready for dark.
- Match copy exactly as in the design unless told otherwise.

## Money & data rules
- Store amounts as integer minor units + ISO 4217 currency. Never use floats for money.
- Split logic lives in `src/domain/money/` with unit tests (equal, exact, percent, shares, adjust, rounding, multi-currency). Allocations must sum exactly to the total.
- Never combine different currencies in a single total.
- Balances are computed from expenses + settlements on the server; RLS on every group-owned table. Settlements are idempotent.
- Edits and deletions write to `audit_logs`.

## Workflow
- Work one phase at a time; finish with typecheck, lint, and tests passing.
- Keep commits small, with descriptive messages.
- Ask before adding new dependencies.
