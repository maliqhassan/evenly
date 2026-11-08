// firebase-role — gives a Firebase user the `role: "authenticated"` custom
// claim that Supabase third-party auth requires. Works on the free Firebase
// Spark plan (no blocking functions / Identity Platform needed).
//
// Flow: the app sends its Firebase ID token → we verify it against Google's
// public keys (issuer + audience pinned to our project, Google provider only)
// → we set the claim on THAT verified uid via the Identity Toolkit admin API
// → the app force-refreshes its token, which now carries the claim.
//
// The caller can only ever affect their own account: the uid comes from the
// verified token, never from the request body.
//
// Secrets (supabase secrets set ...):
//   FIREBASE_SERVICE_ACCOUNT   the service-account JSON from Firebase
//                              (Project settings → Service accounts)

import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'npm:jose@5.9.6';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is not set');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('Invalid service account JSON');
  return sa;
}

let cachedAccess: { token: string; expiresAt: number } | null = null;

/** OAuth access token for the service account (JWT bearer grant), cached ~55 min. */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/identitytoolkit' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`oauth token exchange failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccess = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let idToken: unknown;
  try {
    ({ idToken } = await req.json());
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof idToken !== 'string' || idToken.length > 4096) return json(400, { error: 'bad_request' });

  let sa: ServiceAccount;
  try {
    sa = loadServiceAccount();
  } catch (e) {
    console.error(e);
    return json(500, { error: 'not_configured' });
  }

  // 1. Verify the Firebase ID token (signature, expiry, issuer, audience).
  let uid: string;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${sa.project_id}`,
      audience: sa.project_id,
      algorithms: ['RS256'],
    });
    const provider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
    if (!payload.sub || provider !== 'google.com') return json(403, { error: 'forbidden' });
    if (payload.role === 'authenticated') return json(200, { status: 'already_set' });
    uid = payload.sub;
  } catch {
    return json(401, { error: 'invalid_token' });
  }

  // 2. Set the custom claim on the verified uid.
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ role: 'authenticated' }) }),
    });
    if (!res.ok) {
      console.error('accounts:update failed', res.status, await res.text());
      return json(502, { error: 'update_failed' });
    }
  } catch (e) {
    console.error(e);
    return json(502, { error: 'update_failed' });
  }

  return json(200, { status: 'set' });
});
