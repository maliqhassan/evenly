# Evenly: architecture

## Overview

```
 Google ──ID token──► Firebase Auth ──Firebase ID token (role=authenticated)──┐
                       (blocking fns add role claim)                          │
                                                                              ▼
 App (Expo) ── supabase-js { accessToken: () => firebase.getIdToken() } ──► Supabase
   │  TanStack Query (server state, SQLite-persisted)                    ├─ PostgREST reads (RLS)
   │  Zustand (session, drafts)                                          ├─ RPCs: every write (SECURITY DEFINER)
   │  domain/money (exact integer math)                                  ├─ Storage (receipts, avatars)
   └─ Expo Notifications ◄── Expo Push ◄── push-dispatch Edge Fn ◄── pg_net trigger on notifications
```

## Identity

- **Firebase Auth, Google only** (SRS FR-001…). The app signs in natively with `@react-native-google-signin/google-signin`, exchanges the Google ID token with Firebase (`signInWithCredential`), and persists the Firebase session in **SecureStore**. Values are chunked because SecureStore caps them at about 2 KB.
- Supabase **third-party auth** verifies the Firebase token's signature. As defence in depth, `private.is_trusted_token()` also requires `iss`/`aud` to match the configured Firebase project. A token for another project resolves to no user.
- `public.current_profile_id()` maps the verified `sub` (TEXT, not UUID) to a profile. `ensure_profile()` creates it on first sign-in. It's idempotent on the unique `firebase_uid`, so repeat sign-ins never duplicate (FR-006). The email always comes from the verified token, never from client input.

## Authorisation model

- **Every table has RLS.** `anon` has no privileges at all. `authenticated` can `SELECT` (filtered by RLS) and `UPDATE` only whitelisted self-owned columns: profile name/phone/photo/currency, preferences, and `notifications.read_at`.
- **All other writes go through SECURITY DEFINER RPCs** with an empty `search_path`. Each RPC derives the caller from the JWT and re-checks membership, roles and input in one transaction. This is the security boundary; client-side Zod validation is UX only.
- Policies call helper functions as `(select fn())`, so Postgres evaluates them once per statement.
- Function `EXECUTE` is revoked from `PUBLIC`/`anon` and allow-listed for `authenticated`. Note that per-schema default privileges cannot revoke Postgres's global `EXECUTE TO PUBLIC`; a DB test caught this.

## Money

- Amounts are `BIGINT` minor units plus `char(3)` ISO 4217 codes. In the client they are integers checked with `Number.isSafeInteger`; weighted splits use `BigInt` internally.
- **Five split modes** (`src/domain/money/split.ts`): equal, exact, percent (basis points, 2 decimals), shares (×100, 2 decimals) and adjust (± on top of an equal split of the rest). Proportional modes use the **largest-remainder method** with ties broken in stable member order, so allocations always sum exactly. A 2,000-case fuzz test checks the invariant.
- The **server re-validates** that splits are non-negative, unique, made only of active members, and sum exactly to the total (`split_mismatch` otherwise).
- **Balances** are never stored. They are recomputed from the ledger: expenses minus splits, plus settlements, with rejected or deleted rows excluded. `get_my_group_balances()` returns per-member, per-currency nets, and the client simplifies debts deterministically (greedy, at most n−1 transfers).
- **Currencies are never combined.** The dashboard shows the default currency and lists the others separately ("Excludes €84.20 you owe in EUR · Lisbon Trip").

## Integrity

- **Idempotency:** expenses and settlements carry a client UUID, unique per `(created_by, client_id)`. Replays and double taps return the existing row. Concurrent duplicates hit the unique constraint and are resolved inside the RPC.
- **Optimistic concurrency:** edits send `expected_version`; a stale edit fails with `conflict`.
- **Audit:** every expense or settlement create, update, delete, confirm or reject writes `audit_logs` with before/after snapshots, splits included. Expense details shows this history ("Malik changed amount ~~$110.00~~ → $120.00").
- **Activity:** `activity_logs` stores immutable snapshots, so the feed renders each row from the viewer's perspective without joins and is paginated by id cursor.
- **Settlements** record payments made outside Evenly (FR-076). If the payer records one it is `pending` until the receiver confirms or rejects it. If the receiver records it, it is `confirmed`. Pending settlements count toward balances immediately; rejected ones never do.
- **Leaving a group, removing a member or deleting an account** are refused while a balance is outstanding. Account deletion de-identifies the profile ("Deleted user") so other people's history stays intact, and frees the Firebase UID.

## Client architecture

- **Expo Router** with `Stack.Protected` guards driven by the session status (`signedOut` / `onboarding` / `signedIn`). Add expense → Split and Record payment → Recorded are their own modal stacks.
- **`Api` interface** (`src/api/types.ts`) with two implementations: `supabaseApi` and an in-memory `demoApi` that applies the same rules. Demo mode makes every screen explorable without cloud setup and is handy for design review.
- **TanStack Query** owns server state. Mutations invalidate every derived view (`invalidateLedger`). Supabase Realtime events also invalidate caches.
- **Offline (phase 1):** the read cache is persisted per user to Expo SQLite (`expo-sqlite/kv-store`). With a valid session the app opens from cache when offline and shows a sync banner (FR-092). Writes stay online-only. A failed write keeps the draft, and retries are safe because creates are idempotent. A queued outbox is planned for phase 2, per the SRS.
- **Zustand** holds the session and the multi-screen drafts. The expense draft keeps raw inputs per split mode, so switching modes never loses typed values.

## Testing

| Layer        | Tool                   | What                                                                                                                                                                                       |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Money domain | Jest                   | all split modes, rounding, refunds, a 2,000-case invariant fuzz, formatting and parsing, balances, simplification                                                                          |
| Read models  | Jest                   | dashboard and friends aggregation, multi-currency separation                                                                                                                               |
| Screens      | RNTL                   | Split screen: 16b error state (`$8.50 left to assign`), recovery, percent mode                                                                                                             |
| Database     | node:test + **PGlite** | real migrations; token pinning, RLS isolation, no direct writes, split validation, idempotency, optimistic locking, audit, settlement lifecycle, reminders, push trigger, account deletion |
| Build        | `expo export`          | Android production bundle in CI                                                                                                                                                            |

## Where the build departs from the design (intentionally)

| Design                                 | Build                                                                                                                | Why                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Sign in with Apple and Google (03, 05) | Google only; "Secured by Google", "Use another Google account"                                                       | The SRS mandates Google-only Firebase auth. Apple can be added later in `lib/auth`. |
| "Hide My Email" notes (03, 04)         | Privacy note about email visibility                                                                                  | Apple-specific copy no longer applies.                                              |
| Invite link "can request to join" (13) | "can join this group"                                                                                                | Links join directly, with expiry, revocation and reset.                             |
| Scan Bill (07)                         | Attaches a receipt photo to a new expense                                                                            | OCR is phase 3 in the SRS.                                                          |
| CSV export and Evenly Plus (22, 23)    | "Coming soon" sheets                                                                                                 | Premium is out of scope for the MVP.                                                |
| Appearance: Light (23)                 | Light only; dark tokens prepared                                                                                     | Dark theme is not designed yet.                                                     |
| —                                      | Group settings, Join via link, Personal info, Currency & region, Notification prefs, Privacy & terms, Delete account | Required by the SRS but not drawn in the handoff; built from the same components.   |
