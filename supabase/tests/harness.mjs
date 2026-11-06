// Test harness: runs the real Supabase migrations inside PGlite (Postgres
// compiled to WASM) with minimal stand-ins for the Supabase-managed schemas
// (auth, storage, vault, net). Lets us test RLS and RPCs without Docker.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

export const FIREBASE_PROJECT = 'evenly-test';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;

  create schema extensions;
  create extension pgcrypto with schema extensions;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;

  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);

  create schema net;
  create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$
    insert into net.calls (url, headers, body) values (url, headers, body) returning id
  $$;
`;

export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8')
      // Extensions are provisioned by the stubs above.
      .replace(/^create extension if not exists \w+ with schema extensions;$/gm, '');
    try {
      await db.exec(sql);
    } catch (e) {
      e.message = `[${f}] ${e.message}`;
      throw e;
    }
  }
  await db.exec(`insert into private.app_settings (key, value) values ('firebase_project_id', '${FIREBASE_PROJECT}')`);
  return db;
}

export function claimsFor(uid, overrides = {}) {
  return {
    sub: uid,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT}`,
    aud: FIREBASE_PROJECT,
    email: `${uid}@example.com`,
    name: `User ${uid}`,
    role: 'authenticated',
    ...overrides,
  };
}

/**
 * Run a query as an authenticated Firebase user (RLS enforced).
 * `uid = null` runs as the anon role.
 */
export async function as(db, uid, sql, params = [], claimOverrides = {}) {
  const claims = uid === null ? {} : claimsFor(uid, claimOverrides);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
  await db.exec(`set role ${uid === null ? 'anon' : 'authenticated'}`);
  try {
    const res = await db.query(sql, params);
    return res.rows;
  } finally {
    await db.exec('reset role');
  }
}

/** Sign a user in (ensure_profile) and finish onboarding. Returns the profile id. */
export async function signUp(db, uid, name = `User ${uid}`) {
  const [row] = await as(db, uid, `select * from public.ensure_profile($1, null)`, [name]);
  await as(db, uid, `select public.complete_onboarding($1)`, [name]);
  return row.profile_id;
}
