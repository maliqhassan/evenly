// push-dispatch — delivers one in-app notification as an Expo push.
//
// Invoked by the `notifications_dispatch_push` trigger (pg_net) with a shared
// secret header. Runs with the service role. It never trusts the request body
// beyond the notification id: content and recipients are read from the database.
//
// Required secrets (supabase secrets set ...):
//   PUSH_DISPATCH_SECRET   same value as vault secret `push_dispatch_secret`
//   EXPO_ACCESS_TOKEN      optional, enables Expo enhanced push security
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: 'Evenly',
    body: n.body,
    sound: 'default',
    badge: unread ?? undefined,
    data: { ...(n.data ?? {}), notification_id: n.id, type: n.type, group_id: n.group_id },
  }));

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) return json(502, { error: 'expo_push_failed', status: res.status });
  const { data: tickets = [] } = await res.json();

  // Prune tokens Expo reports as no longer registered.
  const dead = (tickets as { status: string; details?: { error?: string } }[])
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? messages[i].to : null))
    .filter((t): t is string => t !== null);
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);

  await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);
  return json(200, { sent: messages.length - dead.length, pruned: dead.length });
});
