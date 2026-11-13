// fx-refresh — loads today's exchange rates into public.fx_rates.
//
// Called daily by pg_cron (through private.call_edge) with the same shared
// secret header as push-dispatch. Runs with the service role.
//
// Source: https://open.er-api.com/v6/latest/USD (free, no key, ~165 currencies
// including PKR). Their terms ask for attribution: the app shows
// "Rates by Exchange Rate API" next to converted amounts.
//
// Required secrets: PUSH_DISPATCH_SECRET (shared). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SOURCE = 'https://open.er-api.com/v6/latest/USD';

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

  let payload: { result?: string; rates?: Record<string, unknown> };
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) return json(502, { error: 'source_unavailable', status: res.status });
    payload = await res.json();
  } catch {
    return json(502, { error: 'source_unavailable' });
  }
  if (payload.result !== 'success' || !payload.rates || typeof payload.rates !== 'object') {
    return json(502, { error: 'bad_response' });
  }

  // Keep only sane rates for 3-letter codes; USD is the base.
  const fetchedAt = new Date().toISOString();
  const rows = Object.entries(payload.rates)
    .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0)
    .map(([quote, rate]) => ({ quote, rate: rate as number, fetched_at: fetchedAt }));
  // A broken response must never wipe good rates.
  if (rows.length < 50 || !rows.some((r) => r.quote === 'USD')) return json(502, { error: 'too_few_rates' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from('fx_rates').upsert(rows, { onConflict: 'quote' });
  if (error) return json(500, { error: 'save_failed' });

  return json(200, { updated: rows.length });
});
