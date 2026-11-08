# Setting up the real backend

You'll configure four things: **Firebase** (identity), **Google Cloud** (OAuth clients), **Supabase** (data) and **EAS** (builds and push). Steps 1–4 take about 30 minutes.

## 1. Firebase: Google sign-in

Everything here works on the free **Spark** plan.

1. Create a project at <https://console.firebase.google.com> (e.g. `evenly-prod`).
2. **Authentication → Sign-in method → Google → Enable.** Leave all other providers off.
3. **Project settings → Your apps → Add app → Web.** Copy `apiKey`, `authDomain`, `projectId`, `appId` into `.env` (`EXPO_PUBLIC_FIREBASE_*`).
4. **Project settings → Service accounts → Generate new private key.** This downloads a JSON key. Keep it outside the repo; it becomes a Supabase secret in section 3. Never commit it, ship it in the app, or paste it anywhere.

### How users get the `role` claim Supabase requires

Supabase only accepts Firebase tokens that carry `role: "authenticated"`. On a user's first sign-in, the app sends its ID token to the **`firebase-role` Edge Function** (`supabase/functions/firebase-role`). The function verifies the token against Google's public keys, then sets the claim on that same user through the Identity Toolkit admin API, using the service-account key. The app then refreshes its token. After that, nothing extra happens on later sign-ins.

**Alternative on Blaze:** if you upgrade to Blaze and enable Identity Platform, you can instead deploy the blocking functions in `firebase/functions` (`npm run deploy`, then register them under Authentication → Settings → Blocking functions). The edge function then becomes a no-op.

## 2. Google Cloud: OAuth clients

Use the Google Cloud project that Firebase created.

1. **APIs & Services → Credentials.** Firebase already created a **Web client** ("auto created by Google Service"). Put its client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. It's used to mint the ID token Firebase verifies.
2. **Create an iOS OAuth client** with bundle ID `app.evenly.mobile` (or your `APP_BUNDLE_ID`). Put its ID in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. `app.config.ts` derives the reversed URL scheme automatically.
3. **Create an Android OAuth client** with package `app.evenly.mobile` and the **SHA-1 of your signing key**. Get it from `npx eas-cli credentials` (Android → Keystore) after the first EAS build. Add the debug SHA-1 too for local builds.
4. On the **OAuth consent screen**, set the app name, support email and privacy policy URL, then publish it.

## 3. Supabase: database, auth integration, storage

1. Create a project at <https://supabase.com/dashboard>. Copy the **Project URL** and the **anon / publishable key** into `.env`.
   The **service-role key** is a server secret. It must never go in `.env`, the app or git.
2. **Authentication → Sign In / Providers → Third-party auth → Add provider → Firebase.** Enter your Firebase project ID.
3. Apply the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
4. Pin the trusted issuer. The RLS helpers only accept tokens from this Firebase project. In the **SQL editor**:
   ```sql
   insert into private.app_settings (key, value) values ('firebase_project_id', '<your-firebase-project-id>')
   on conflict (key) do update set value = excluded.value;
   ```
5. Storage buckets (`receipts`, private; `avatars`, public) and their policies are created by the migrations.
6. **Role-claim function (required for sign-in):** store the Firebase service-account key from section 1 as a secret, then deploy:
   ```bash
   npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/evenly-firebase-adminsdk.json)"
   npx supabase functions deploy firebase-role --no-verify-jwt
   ```
7. **Push delivery (optional, needed for push notifications):**
   ```bash
   # a random shared secret, e.g. `openssl rand -hex 32`
   npx supabase secrets set PUSH_DISPATCH_SECRET=<secret>
   npx supabase functions deploy push-dispatch
   ```
   Then in the SQL editor:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
   select vault.create_secret('<same-secret>', 'push_dispatch_secret');
   ```
   Every new row in `notifications` now triggers a push, which respects each user's notification preferences.

### Local Supabase (optional)

With Docker installed: `npx supabase start`, then set `FIREBASE_PROJECT_ID` in your shell (it's referenced by `supabase/config.toml`) and run `npx supabase db reset`. That applies the migrations and `seed.sql`.
Without Docker, `npm run test:db` still runs every migration and the RLS/RPC tests in PGlite.

## 4. EAS: builds, push credentials

```bash
npx eas-cli@latest login
npx eas-cli@latest init            # writes the project id; put it in EAS_PROJECT_ID
npx eas-cli@latest build --profile development --platform android
```

- **Push notifications:** run `npx eas-cli credentials` to add an APNs key (iOS). For Android, upload an FCM V1 service-account key under _Push Notifications (FCM V1)_.
- **Invite links** (`https://evenly.app/j/<code>`): host `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on your invite domain, or set `EXPO_PUBLIC_INVITE_BASE_URL` to a domain you control. The `evenly://join/<code>` scheme works without any hosting.

## 5. Monitoring (optional)

- **Sentry:** set `EXPO_PUBLIC_SENTRY_DSN`, plus `SENTRY_ORG`, `SENTRY_PROJECT` and the `SENTRY_AUTH_TOKEN` EAS secret for source maps.
- **PostHog:** set `EXPO_PUBLIC_POSTHOG_KEY`. Analytics events carry no amounts, descriptions or names (see `src/lib/monitoring.ts`).

## 6. Switch the app to live mode

Set `EXPO_PUBLIC_DEMO_MODE=false` in `.env` and restart Metro with `npx expo start --dev-client -c`. If a required variable is missing, the app shows a **Configuration needed** screen listing it.

## Release checklist

- [ ] Privacy policy and terms published at `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`
- [ ] OAuth consent screen published; production SHA-1 added to the Android OAuth client
- [ ] `private.app_settings.firebase_project_id` set in production
- [ ] RLS reviewed (`npm run test:db` green); service-role key only in Supabase secrets
- [ ] `npx eas-cli build --profile production` for both platforms, then smoke-test sign-in, an expense, a settlement and an invite link
