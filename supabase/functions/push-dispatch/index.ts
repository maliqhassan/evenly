// push-dispatch — delivers one in-app notification as a push.
//
// Invoked by the `notifications_dispatch_push` trigger (pg_net) with a shared
// secret header. Runs with the service role. It never trusts the request body
// beyond the notification id: content and recipients are read from the database.
//
// Delivery: native FCM device tokens (Android) are sent through Firebase Cloud
// Messaging HTTP v1 with the Firebase service account. Expo push tokens
// ("ExponentPushToken[...]") still go through Expo's push service.
//
// Secrets (supabase secrets set ...):
//   PUSH_DISPATCH_SECRET       same value as vault secret `push_dispatch_secret`
//   FIREBASE_SERVICE_ACCOUNT   service-account JSON (shared with firebase-role)
//   EXPO_ACCESS_TOKEN          optional, enables Expo enhanced push security
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t: string) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');

const TYPE_TO_PREF: Record<string, string> = {
  expense_added: 'notify_expenses',
  expense_updated: 'notify_expenses',
  expense_deleted: 'notify_expenses',
  settlement_pending: 'notify_settlements',
  settlement_recorded: 'notify_settlements',
  settlement_confirmed: 'notify_settlements',
  settlement_rejected: 'notify_settlements',
  group_invite: 'notify_invites',
  member_joined: 'notify_invites',
  reminder: 'notify_reminders',
};

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface Push {
  title: string;
  body: string;
  badge?: number;
  data: Record<string, unknown>;
}

interface SendResult {
  sent: number;
  /** Tokens the push service says are no longer registered. */
  dead: string[];
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let cachedAccess: { token: string; expiresAt: number } | null = null;

/** OAuth access token for FCM (JWT bearer grant with the service account), cached ~55 min. */
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
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

/**
 * Send to native FCM tokens. Data-only messages in the shape expo-notifications
 * reads (title / message / body as JSON / channelId), so the app builds the
 * notification itself and gets the data back when it is tapped.
 */
async function sendFcm(tokens: string[], push: Push): Promise<SendResult> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is not set');
  const sa = JSON.parse(raw) as ServiceAccount;
  const accessToken = await fcmAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // FCM data values must all be strings.
  const data: Record<string, string> = {
    channelId: 'default',
    title: push.title,
    message: push.body,
    body: JSON.stringify(push.data),
    sound: 'default',
  };
  if (push.badge !== undefined) data.badge = String(push.badge);

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, data, android: { priority: 'HIGH' } } }),
      });
      if (res.ok) {
        sent++;
        return;
      }
      const err = (await res.json().catch(() => null)) as {
        error?: { status?: string; details?: { errorCode?: string }[] };
      } | null;
      const code = err?.error?.details?.find((d) => d.errorCode)?.errorCode;
      if (code === 'UNREGISTERED' || err?.error?.status === 'NOT_FOUND') dead.push(token);
      else console.error('fcm send failed', res.status, code ?? err?.error?.status);
    }),
  );
  return { sent, dead };
}

/** Send to Expo push tokens through Expo's push service. */
async function sendExpo(tokens: string[], push: Push): Promise<SendResult> {
  const messages = tokens.map((to) => ({
    to,
    title: push.title,
    body: push.body,
    sound: 'default',
    badge: push.badge,
    data: push.data,
  }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`expo push failed: ${res.status}`);
  const { data: tickets = [] } = await res.json();
  const dead = (tickets as { status: string; details?: { error?: string } }[])
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i] : null))
    .filter((t): t is string => t !== null);
  return { sent: tokens.length - dead.length, dead };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('PUSH_DISPATCH_SECRET') ?? '';
  const provided = req.headers.get('x-dispatch-secret') ?? '';
  if (!expected || !timingSafeEqual(expected, provided)) return json(401, { error: 'unauthorized' });

  let notificationId: string;
  try {
    ({ notification_id: notificationId } = await req.json());
    if (typeof notificationId !== 'string') throw new Error();
  } catch {
    return json(400, { error: 'bad_request' });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: n, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, type, body, data, group_id, pushed_at')
    .eq('id', notificationId)
    .maybeSingle();
  if (error) return json(500, { error: 'lookup_failed' });
  if (!n || n.pushed_at) return json(200, { skipped: 'missing_or_already_pushed' });

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('profile_id', n.recipient_id)
    .maybeSingle();
  const prefKey = TYPE_TO_PREF[n.type];
  if (prefs && (!prefs.notify_push || (prefKey && prefs[prefKey] === false))) {
    return json(200, { skipped: 'disabled_by_user' });
  }

  const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', n.recipient_id);
  if (!tokens?.length) return json(200, { skipped: 'no_tokens' });

  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', n.recipient_id)
    .is('read_at', null);

  const push: Push = {
    title: 'Evenly',
    body: n.body,
    badge: unread ?? undefined,
    data: { ...(n.data ?? {}), notification_id: n.id, type: n.type, group_id: n.group_id },
  };
  const all = tokens.map(({ token }) => token as string);
  const fcmTokens = all.filter((t) => !isExpoToken(t));
  const expoTokens = all.filter(isExpoToken);

  let sent = 0;
  const dead: string[] = [];
  try {
    for (const [list, send] of [
      [fcmTokens, sendFcm],
      [expoTokens, sendExpo],
    ] as const) {
      if (!list.length) continue;
      const r = await send(list, push);
      sent += r.sent;
      dead.push(...r.dead);
    }
  } catch (e) {
    console.error(e);
    return json(502, { error: 'push_failed' });
  }

  // Prune tokens the push services report as no longer registered.
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);

  await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);
  return json(200, { sent, pruned: dead.length });
});
