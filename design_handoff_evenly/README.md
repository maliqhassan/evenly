# Handoff: Evenly — Expense Sharing App (MVP, all screens)

## Overview
Evenly is a mobile expense-sharing app (Android + iOS). Users sign in with **Apple or Google only**, create groups, add shared expenses, split them (equal / exact / percent / shares / adjust), see who owes whom, and record settlements. This bundle contains the complete MVP screen flow (24 screens).

## About the Design Files
`design/Evenly App Flow.dc.html` is a **design reference built in HTML**. Open it in a browser (keep `support.js` next to it). It shows the intended look, copy, and flow. **It is not production code.** Rebuild these screens as a **React Native (Expo) app** using the stack below. Do not port the HTML or its inline styles directly.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, radii, icons and copy. Match them closely, using reusable RN components and a central theme.

---

## Tech stack (from product plan — use exactly)
| Concern | Choice |
|---|---|
| App | React Native + **Expo** (latest SDK), **TypeScript** strict |
| Navigation | **Expo Router** (file-based) |
| Backend | **Supabase** (Postgres, Auth, Storage, Edge Functions, RLS) |
| Auth | Supabase Auth with **Sign in with Apple** (`expo-apple-authentication`) + **Google** (`@react-native-google-signin/google-signin` → `signInWithIdToken`). No email/password. |
| State | **Zustand** (UI/session) + **TanStack Query** (server data) |
| Validation | **Zod** |
| Fonts | **DM Sans** via `@expo-google-fonts/dm-sans` (300, 400, 500, 600, 300 italic) |
| Icons | **Lucide** via `lucide-react-native` (+ `react-native-svg`) |
| Notifications | Expo Notifications |
| Monitoring | Sentry, PostHog |

## Suggested folder structure
```
app/
  _layout.tsx                 # fonts, providers (QueryClient, theme), auth gate
  (auth)/
    welcome.tsx               # 02
    sign-in.tsx               # 03
    complete-profile.tsx      # 04
    sign-in-error.tsx         # 05
    preferences.tsx           # 06
  (tabs)/
    _layout.tsx               # floating tab bar w/ centre Add button
    index.tsx                 # 07 Dashboard
    groups/index.tsx          # 11
    activity.tsx              # 09
    friends.tsx               # 10
  notifications.tsx           # 08
  groups/new.tsx              # 12 (modal)
  groups/[id]/index.tsx       # 14
  groups/[id]/invite.tsx      # 13
  groups/[id]/balances.tsx    # 18
  expense/new.tsx             # 15 (modal)
  expense/split.tsx           # 16 / 16b
  expense/[id].tsx            # 17
  settle/index.tsx            # 19
  settle/record.tsx           # 20 (modal)
  settle/success.tsx          # 21
  reports.tsx                 # 22
  profile.tsx                 # 23
src/
  theme/ (colors.ts, typography.ts, spacing.ts)
  components/ (Screen, Button, IconButton, Card, Avatar, AvatarStack, ListRow, Field, Chip, Segmented, Pill, AmountText, TabBar, SocialButton, ProgressBar)
  domain/money/ (minor-unit math, split algorithms, balances, debt simplification) + __tests__
  lib/supabase.ts, lib/auth.ts
  stores/ queries/ schemas/
supabase/migrations/
```

---

## Design Tokens

### Colours (Coolors: https://coolors.co/1b211d-2f3b33-1e7a4c-ddefe3-f4f5f3-c2362f)
| Token | Hex | Use |
|---|---|---|
| ink | `#1B211D` | Primary text, Apple button, home indicator |
| forest | `#2F3B33` | Primary buttons, FAB, selected chips, logo |
| forestCard | `#3B4A3F` | Dashboard balance shell, group header, dark cards |
| positive | `#1E7A4C` | "Owed to you", success, links |
| positiveSoft | `#E3F1E7` | Success/info backgrounds, icon chips |
| mint | `#DDEFE3` | Accent on dark (icon tiles, buttons on forest) |
| negative | `#C2362F` | "You owe", errors, destructive |
| negativeSoft | `#FBECEA` | Outstanding/error cards |
| warning | `#B7791F` on `#FFF3DC` | Pending/awaiting states |
| bg | `#F4F5F3` | Screen background (most screens) |
| surface | `#FFFFFF` | Cards, inputs, some full-white screens |
| surfaceMuted | `#F0F2EF` / `#E8EBE7` | Icon tiles, segmented track, dividers |
| border | `#E1E4E0` / `#DDE1DC` | Input & button borders |
| textMuted | `#5E665F` | Secondary text |
| textSubtle | `#6B736D` / `#8A918B` | Captions, timestamps, inactive icons |
| onDarkMuted | `#AFC2B4` | Secondary text on forest |
| Mint balance gradient | radial `#F4FBF6 → #D5ECDD → #C3E2CD` | Dashboard balance card |
| Avatar fills | `#D9C7B8 #C8D5C0 #E6CFC9 #C9D3E0 #E3DCC4 #D7C9E0 #CFDCD6` | Initial avatars (deterministic by user id) |

### Typography — DM Sans, tabular numbers for all amounts (`fontVariant: ['tabular-nums']`)
| Style | Size / weight / tracking |
|---|---|
| Display amount | 52–56 / 600 / −0.04em |
| Hero amount | 36–40 / 600 / −0.03em |
| H1 screen title | 30 / 600 / −0.03em |
| Hero headline | 34 / 600 (+ 300 italic word, e.g. "*Confidence*") |
| Nav title | 17 / 600 |
| Section title | 16 / 600 |
| Body / row title | 14–15 / 500–600 |
| Secondary | 13 / 400 |
| Caption | 12 / 400 |
| Overline | 11–12 / 400, uppercase, +0.06em |
| Pill text | 10–11 / 600, uppercase |

### Spacing, radius, elevation
- Screen horizontal padding **20** (auth screens **24**); vertical gaps 14–22.
- Radii: phone/screens n/a · cards **18–22** · dark hero card **30** (inner 22) · inputs **14** · buttons **28** (pill, height 56) · small buttons 17–20 · icon tiles 10–14 · avatars full.
- Icon buttons: 44×44 circles (`#FFFFFF` on bg, `#F4F5F3` on white).
- Tab bar: floating pill, inset 24 left/right, 26 from bottom, height 64, radius 32, white 92% + blur, shadow `0 12 32 -10 rgba(30,45,35,.3)`. Centre Add button 48 circle `#2F3B33`.
- Hit targets ≥ 44pt.

### Icons (Lucide names)
house, users, receipt, user, plus, bell, bell-ring, arrow-left, arrow-right, x, chevron-right, chevron-down, search, sliders-horizontal, user-plus, circle-plus, banknote, scan-line, check, check-check, circle-check, circle-alert, triangle-alert, info, pencil, pencil-line, trash-2, copy, share, qr-code, settings, shopping-cart, calendar, calendar-days, paperclip, utensils, zap, clock, plane, sandwich, heart, key, equal, dollar-sign, percent, chart-pie, download, crown, log-out, moon, circle-help, shield, shield-check, mail-x, camera, globe, hash, link, wifi-off, user-round-check. Default stroke 2; size 18–24.

---

## Screens (numbers match labels in the HTML)

**A. Onboarding & Auth**
- **01 Splash**: full `#2F3B33`, centred logo tile (76, radius 22, `#F4F5F3`, ring cutout) + "Evenly" 34/600; footer "Shared money, made simple."
- **02 Welcome**: logo + wordmark; hero photo card (radius 32, 306h) with frosted "$42.50 · Successfully settled" chip; 3-dot pager; "Settle with / *Confidence*"; body copy; **Get Started** primary; "Already use Evenly? Sign in".
- **03 Sign in**: logo, "Sign in to *Evenly*", reassurance rows (Secured by Apple or Google / Hide My Email). Bottom: **Continue with Apple** (ink bg, white logo; must follow Apple HIG) and **Continue with Google** (white, border; follow Google branding). Terms/Privacy line. *No passwords anywhere.*
- **04 Complete profile** (first sign-in only): provider email chip, photo imported from provider (editable), Display name (prefilled), Phone (optional), info note about Apple private relay email. **Continue**.
- **05 Sign-in didn't complete**: red alert icon, explanation, checklist, **Try again**, Continue with Apple, Contact support.
- **06 Preferences**: Default currency, Region, Number format, Date format rows (white grouped card). **Continue** → Dashboard.

**B. Home & tabs**
- **07 Dashboard**: avatar + "Hi, {firstName}!" + bell (red unread dot). Dark card (`#3B4A3F`, r30, p10) containing mint card: currency, "NET BALANCE", +$1,430.50 green, split row OWED TO YOU / YOU OWE. Actions row: Add Expense · Settle Up · Scan Bill. Caption for other-currency balances (never combine currencies). Recent Activity (2 rows) + My Groups (2-col cards). Floating tab bar (Home active).
- **08 Notifications**: All / Unread segmented; invitation card with Accept/Decline; list (icon tile, text, time, unread dot).
- **09 Activity**: title, search, filter chips (All/Expenses/Settlements/Groups), date-grouped list with signed amounts (green +, red −).
- **10 Friends**: owed/owe summary tiles; friend rows with label + amount coloured by direction, "Settled up" muted.

**C. Groups**
- **11 Groups**: "New" pill button; Active/Archived segmented; cards (icon tile on forest, name, members·currency, avatar stack, your balance).
- **12 Create group** (modal): icon tile, name, type chips (Home/Trip/Couple/Work/Other), group currency, members list + "Add members".
- **13 Invite**: dark link card (link, Copy, Share, QR), search, suggested list with Invite / Pending / Member states.
- **14 Group details**: forest header (back, invite, settings), group identity, mint "You are owed" card with Balances / Settle up; tabs Expenses/Members/Totals; month-grouped expense rows (date block, icon, payer line, your share signed); extended FAB "Add expense".

**D. Expenses & splitting**
- **15 Add expense** (modal): group selector, big amount + currency chip, description, category + date, Paid by row, Split row (summary + your share), attach receipt/note, **Save expense**.
- **16 Split**: 5 mode tiles (Equal, Exact, Percent, Shares, Adjust); participant rows with checkbox, avatar, computed amount, input. Footer validation bar: green "100% allocated / $120.00 of $120.00".
- **16b Split error**: red bar "$8.50 left to assign"; Done disabled (`#C9CEC9`).
- **17 Expense details**: edit/delete, category icon, title, amount, meta; payer + per-person shares; receipt thumbnail; audit history line.

**E. Balances & settlements**
- **18 Balances**: net-balance diverging bars (red left / green right, centred axis); "Who owes whom" (Simplified pill); Remind + Settle up.
- **19 Settle Up**: total-you-owe red card; pending settlement cards (you → person, amount, PENDING pill, Pay).
- **20 Record payment** (modal): from → to avatars, amount, method chips (Cash/Bank transfer/Card/Other), reference/date/group, info note, **Record $X**.
- **21 Payment recorded**: success check, summary card (method, reference, status "Awaiting confirmation", remaining owed), Done / View in activity.

**F. Reports & account**
- **22 Reports**: CSV export (Premium), dark summary card with 6-month bar chart, category bars.
- **23 Profile**: identity + Edit, Evenly Plus upsell card, ACCOUNT (Personal info, Sign-in method, Currency & region, Notifications), APP (Appearance, Help, Privacy), Log out (red).

---

## Interactions & Navigation
- Launch → Splash → (session? Dashboard : Welcome) → Sign in → provider sheet → new user ? Complete profile → Preferences → Dashboard : Dashboard. Cancel/failure → 05.
- Tab bar: Home, Groups, **+ (Add expense modal)**, Activity, Friends. Profile via dashboard avatar. Bell → Notifications.
- Add expense → Split (push) → back with summary → Save → toast + invalidate group/balance queries.
- Group → Balances → Settle up → Record payment → Success.
- Modals: Create group, Add expense, Record payment (iOS sheet presentation).
- Press states: opacity 0.7 / scale 0.98; transitions 200–250ms ease-out.
- Loading: skeleton rows matching list shapes. Empty states: one line + primary action.

## Business rules (critical)
- Money stored as **integer minor units** + ISO currency; never floats. Use a tested `domain/money` module.
- Split allocations must sum exactly to total; deterministic remainder rounding (assign leftover cents in stable member order).
- Never silently combine currencies; show other-currency balances separately.
- Balances recomputed from expenses + settlements (server-authoritative, transactional, RLS on all group data). Settlements idempotent (client-generated UUID).
- Every expense edit writes an audit log entry.

## Assets
- Hero photo (02) and avatars are **placeholders** — supply real images; fall back to initials on avatar fills.
- Apple/Google logos: use official assets per platform guidelines.
- Logo: rounded square `#2F3B33` with `#F4F5F3` ring — recreate as a vector.

## Files
- `design/Evenly App Flow.dc.html` — all screens (open in browser; requires `design/support.js`).
- `CLAUDE.md` — put at repo root; persistent rules for Claude Code.
- `KICKOFF_PROMPT.md` — first messages to paste into Claude Code.
