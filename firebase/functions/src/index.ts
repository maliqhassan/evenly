/**
 * Firebase Auth blocking functions.
 *
 * Supabase only treats a third-party JWT as a signed-in user when it carries
 * `role: "authenticated"`. These functions add that custom claim to every
 * Firebase ID token at sign-up and sign-in, so the token Supabase receives
 * already has it.
 *
 * Requires Firebase Authentication with Identity Platform (blocking functions).
 * Deploy:  cd firebase/functions && npm install && npm run deploy
 * Then register both functions under Authentication → Settings → Blocking functions.
 *
 * For accounts created before these functions existed, run `npm run backfill`.
 */
import { beforeUserCreated, beforeUserSignedIn } from 'firebase-functions/v2/identity';

const claims = { customClaims: { role: 'authenticated' } };

export const evenlyBeforeCreate = beforeUserCreated({ region: 'us-central1' }, (event) => {
  // Google-only: reject any other provider defensively.
  const provider = event.credential?.providerId ?? event.additionalUserInfo?.providerId;
  if (provider && provider !== 'google.com') {
    throw new Error('Only Google sign-in is supported.');
  }
  return claims;
});

export const evenlyBeforeSignIn = beforeUserSignedIn({ region: 'us-central1' }, () => claims);
