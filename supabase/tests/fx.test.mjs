// Database tests: exchange rates (read-only for users) and the daily refresh trigger.
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { as, createDb, signUp } from './harness.mjs';

let db;
before(async () => {
  db = await createDb();
  await signUp(db, 'vanessa', 'Vanessa');
  await db.query(`insert into public.fx_rates (quote, rate) values ('USD', 1), ('PKR', 276.622899), ('EUR', 0.903491)`);
});
after(async () => db?.close());

const rejects = async (promise, pattern) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, pattern);
    return true;
  });
};

describe('exchange rates', () => {
  it('signed-in users can read the rates', async () => {
    const rows = await as(db, 'vanessa', `select quote, rate::text from public.fx_rates order by quote`);
    assert.deepEqual(
      rows.map((r) => r.quote),
      ['EUR', 'PKR', 'USD'],
    );
    assert.equal(rows.find((r) => r.quote === 'PKR').rate, '276.6228990000');
  });

  it('anonymous users cannot', async () => {
    await rejects(as(db, null, `select * from public.fx_rates`), /permission denied/);
  });

  it('nobody can write rates from the app', async () => {
    await rejects(as(db, 'vanessa', `update public.fx_rates set rate = 1 where quote = 'PKR'`), /permission denied/);
    await rejects(
      as(db, 'vanessa', `insert into public.fx_rates (quote, rate) values ('GBP', 0.75)`),
      /permission denied/,
    );
    await rejects(as(db, 'vanessa', `delete from public.fx_rates`), /permission denied/);
  });

  it('rejects rates that make no sense', async () => {
    await rejects(db.query(`insert into public.fx_rates (quote, rate) values ('XXX', 0)`), /check/);
    await rejects(db.query(`insert into public.fx_rates (quote, rate) values ('usd', 1)`), /check/);
  });

  it('the refresh job calls the fx-refresh function with the shared secret, and does nothing without it', async () => {
    await db.query(`select private.call_edge('fx-refresh')`);
    assert.equal((await db.query(`select count(*)::int as n from net.calls`)).rows[0].n, 0);

    await db.query(
      `insert into vault.decrypted_secrets values ('push_dispatch_url', 'https://x.test/functions/v1/push-dispatch'), ('push_dispatch_secret', 's3cret')`,
    );
    await db.query(`select private.call_edge('fx-refresh')`);
    const [call] = (await db.query(`select url, headers from net.calls`)).rows;
    assert.equal(call.url, 'https://x.test/functions/v1/fx-refresh');
    assert.equal(call.headers['x-dispatch-secret'], 's3cret');
  });
});
