# How to start in VS Code + Claude Code

1. Create an empty folder for the app and open it in VS Code.
2. Copy this whole bundle into it as `design_handoff/`.
3. Move `design_handoff/CLAUDE.md` to the project root (`./CLAUDE.md`).
4. Open Claude Code and paste the prompts below **one at a time**. Review each phase before moving on.

---

### Prompt 1 — Foundation
```
Read CLAUDE.md and design_handoff/README.md fully. Then scaffold a new Expo app (TypeScript, Expo Router) in this folder with the folder structure from the README. Install DM Sans (@expo-google-fonts/dm-sans), lucide-react-native, react-native-svg, zustand, @tanstack/react-query, zod, @supabase/supabase-js. Create src/theme (colors, typography, spacing, radii) using the exact Design Tokens from the README. Do not build screens yet. Show me the plan first, then implement.
```

### Prompt 2 — Component library
```
Build the shared components in src/components following the README tokens: Screen, Button (primary/secondary/destructive/disabled), IconButton, SocialButton (Apple/Google), Card, ListRow, Avatar + AvatarStack, Field, Chip, Segmented, Pill, AmountText, ProgressBar, and the floating TabBar with the centre Add button. Add a temporary /dev/components screen to preview them all.
```

### Prompt 3 — Auth flow (screens 01–06)
```
Implement screens 01–06 exactly as in design_handoff/design/Evenly App Flow.dc.html: Splash, Welcome, Sign in (Apple + Google only via Supabase signInWithIdToken), Complete profile, Sign-in error, Preferences. Add an auth gate in app/_layout.tsx. Use placeholders for env keys and list exactly what I must configure in Supabase, Apple Developer and Google Cloud.
```

### Prompt 4 — Database
```
Create Supabase migrations for: profiles, user_preferences, groups, group_members, group_invitations, expenses, expense_splits, settlements, expense_categories, receipts, notifications, audit_logs. Money as bigint minor units + currency char(3). Add RLS so only group members can read or write group data. Generate TypeScript types.
```

### Prompt 5 — Money domain
```
Implement src/domain/money: minor-unit helpers, split algorithms (equal, exact, percent, shares, adjust) with deterministic remainder rounding, balance calculation, and debt simplification. Write thorough unit tests first, then the implementation.
```

### Prompt 6 — Tabs & groups (screens 07–14)
```
Implement Dashboard, Notifications, Activity, Friends, Groups, Create group, Invite, and Group details (screens 07–14) with TanStack Query hooks against Supabase. Match the design pixel-for-pixel. Add loading skeletons and empty states.
```

### Prompt 7 — Expenses (screens 15–17)
```
Implement Add expense, Split (all 5 modes, live validation including the 16b error state), and Expense details with audit history. Use Zod schemas and the money domain. Saving must be transactional on the server.
```

### Prompt 8 — Settle up (screens 18–21)
```
Implement Balances, Settle Up, Record payment, and Payment recorded. Settlements must be idempotent (client UUID). After success, invalidate balance queries.
```

### Prompt 9 — Reports & profile (screens 22–23), notifications
```
Implement Reports and Profile & settings, plus Expo push notifications for invites, new or edited expenses, and settlements.
```

### Prompt 10 — Hardening
```
Audit against the README and CLAUDE.md: compare every screen with the design, check RLS, add missing tests, fix accessibility (labels, 44pt targets, contrast), and set up Sentry.
```
