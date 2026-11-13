-- Daily exchange rates, for showing approximate totals across currencies.
--
-- Rates are display-only: balances and expenses are always stored and settled
-- in their own currency and never combined in the database. The app converts
-- for an "about X in total" line and labels it as approximate.
--
-- `rate` is how many units of `quote` equal 1 USD, so a→b = rate[b] / rate[a].
-- The `fx-refresh` Edge Function fills it daily from open.er-api.com.

create table public.fx_rates (
  quote       text primary key check (quote ~ '^[A-Z]{3}$'),
  rate        numeric(24, 10) not null check (rate > 0),
  fetched_at  timestamptz not null default now()
);

alter table public.fx_rates enable row level security;
grant select on public.fx_rates to authenticated;
-- Rates are public information; only the service role (the Edge Function) writes them.
create policy fx_rates_select_all on public.fx_rates for select to authenticated using (true);

-- Call one of our Edge Functions from the database, with the shared secret
-- stored in Vault for push-dispatch (same project, same URL base).
create or replace function private.call_edge(p_function text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  exception when others then
    return;
  end;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := replace(v_url, '/push-dispatch', '/' || p_function),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;

-- Refresh daily at 00:10 UTC, where pg_cron exists (Supabase).
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('fx-refresh', '10 0 * * *', 'select private.call_edge(''fx-refresh'')');
  end if;
end $$;
