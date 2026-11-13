// Database tests: Free plan limits (groups, monthly expenses) and switching plans.
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { as, createDb, signUp } from './harness.mjs';

let db;
const P = {};

before(async () => {
  db = await createDb({ planLimits: true });
  for (const uid of ['vanessa', 'malik', 'jordan', 'proto']) {
    P[uid] = await signUp(db, uid, uid[0].toUpperCase() + uid.slice(1));
  }
});
after(async () => db?.close());

const rejects = async (promise, pattern) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, pattern);
    return true;
  });
};

const createGroup = (uid, name) =>
  as(db, uid, `select public.create_group($1, 'home', 'USD') as id`, [name]).then((r) => r[0].id);

async function join(uid, groupId, owner) {
  const [{ code }] = await as(db, owner, `select * from public.get_invite_link($1)`, [groupId]);
  await as(db, uid, `select public.accept_invite($1)`, [code]);
}

function addExpense(uid, groupId, payer, clientId = randomUUID(), amount = 1000) {
  return as(
    db,
    uid,
    `select public.save_expense($1, $2, 'Lunch', $3, 'USD', $4, $5::jsonb, 'exact') as id`,
    [groupId, clientId, amount, payer, JSON.stringify([{ profile_id: payer, amount_minor: amount }])],
  ).then((r) => r[0].id);
}

const plan = (uid) => as(db, uid, `select public.get_my_plan() as p`).then((r) => r[0].p);

describe('Free plan: groups', () => {
  it('allows 3 active groups you created, then refuses the 4th', async () => {
    for (const n of ['A', 'B', 'C']) await createGroup('vanessa', n);
    await rejects(createGroup('vanessa', 'D'), /plan_limit/);
    const p = await plan('vanessa');
    assert.equal(p.plan, 'free');
    assert.equal(p.groups_used, 3);
    assert.equal(p.group_limit, 3);
  });

  it('never limits joining other people’s groups', async () => {
    for (const n of ['M1', 'M2', 'M3']) {
      const g = await createGroup('malik', n);
      await join('vanessa', g, 'malik');
    }
    assert.equal((await plan('vanessa')).groups_used, 3, 'joined groups do not count');
  });

  it('archiving frees a slot; restoring needs one', async () => {
    const [{ id }] = (
      await db.query(`select id from public.groups where created_by = $1 and name = 'A'`, [P.vanessa])
    ).rows;
    await as(db, 'vanessa', `select public.set_group_archived($1, true)`, [id]);
    const d = await createGroup('vanessa', 'D');
    await rejects(as(db, 'vanessa', `select public.set_group_archived($1, false)`, [id]), /plan_limit/);
    await as(db, 'vanessa', `select public.set_group_archived($1, true)`, [d]);
    await as(db, 'vanessa', `select public.set_group_archived($1, false)`, [id]);
  });
});

describe('Free plan: expenses per month', () => {
  let g;
  before(async () => {
    g = await createGroup('jordan', 'Flat');
    await join('malik', g, 'jordan');
  });

  it('allows 15 expenses a month, then refuses the 16th', async () => {
    const first = randomUUID();
    await addExpense('jordan', g, P.jordan, first);
    for (let i = 1; i < 15; i++) await addExpense('jordan', g, P.jordan);
    await rejects(addExpense('jordan', g, P.jordan), /plan_limit/);
    const p = await plan('jordan');
    assert.equal(p.expenses_used, 15);
    assert.equal(p.expense_limit, 15);
    assert.match(p.resets_on, /^\d{4}-\d{2}-01$/);

    // A replay of an earlier create is not a new expense, so it still succeeds.
    await addExpense('jordan', g, P.jordan, first);
  });

  it('counts per person: others in the group can still add', async () => {
    await addExpense('malik', g, P.malik);
  });

  it('never blocks editing, deleting or settling up', async () => {
    const [{ id, version }] = (
      await db.query(`select id, version from public.expenses where created_by = $1 limit 1`, [P.jordan])
    ).rows;
    await as(
      db,
      'jordan',
      `select public.save_expense($1, $2, 'Dinner', 2000, 'USD', $3, $4::jsonb, 'exact', 'general', current_date, null, $5, $6)`,
      [g, randomUUID(), P.jordan, JSON.stringify([{ profile_id: P.jordan, amount_minor: 2000 }]), id, version],
    );
    await as(db, 'jordan', `select public.record_settlement($1, $2, $3, $4, 500, 'USD')`, [
      g,
      randomUUID(),
      P.malik,
      P.jordan,
    ]);
    await as(db, 'jordan', `select public.delete_expense($1)`, [id]);
    assert.equal((await plan('jordan')).expenses_used, 14, 'deleting frees a slot');
    await addExpense('jordan', g, P.jordan);
  });

  it('only counts this month', async () => {
    await db.query(`update public.expenses set created_at = now() - interval '40 days' where created_by = $1`, [
      P.jordan,
    ]);
    assert.equal((await plan('jordan')).expenses_used, 0);
    await db.query(`update public.expenses set created_at = now() where created_by = $1`, [P.jordan]);
  });

  it('a recurring expense over the limit waits instead of pausing', async () => {
    // Creating a template saves its first expense at once, so make room just for that.
    const setLimit = (n) =>
      db.query(`update private.app_settings set value = $1 where key = 'free_monthly_expense_limit'`, [String(n)]);
    await setLimit(100);
    const [{ id }] = await as(
      db,
      'jordan',
      `select public.create_recurring_expense($1, $2, 'Rent', 1000, 'USD', $3, $4::jsonb, 'exact', 'rent', null, 'monthly', '2026-01-15'::date) as id`,
      [g, randomUUID(), P.jordan, JSON.stringify([{ profile_id: P.jordan, amount_minor: 1000 }])],
    );
    await setLimit(15);
    await db.query(`update public.recurring_expenses set next_run = current_date where id = $1`, [id]);
    assert.equal((await db.query(`select private.run_recurring_expenses() as n`)).rows[0].n, 0);
    const r = (await db.query(`select active, last_error from public.recurring_expenses where id = $1`, [id]))
      .rows[0];
    assert.equal(r.active, true);
    assert.equal(r.last_error, null);
  });
});

describe('Pro', () => {
  it('has no limits', async () => {
    await as(db, 'proto', `select public.set_my_plan('pro')`);
    assert.equal((await plan('proto')).plan, 'pro');
    const groups = [];
    for (let i = 0; i < 5; i++) groups.push(await createGroup('proto', `P${i}`));
    for (let i = 0; i < 20; i++) await addExpense('proto', groups[0], P.proto);
  });

  it('switching back to Free keeps everything but blocks new ones', async () => {
    await as(db, 'proto', `select public.set_my_plan('free')`);
    await rejects(createGroup('proto', 'P5'), /plan_limit/);
    await rejects(addExpense('proto', await firstGroup('proto'), P.proto), /plan_limit/);
    assert.equal((await plan('proto')).groups_used, 5);
  });

  it('cannot be set by writing the profile directly, or with an unknown plan', async () => {
    await rejects(as(db, 'proto', `update public.profiles set plan = 'pro' where id = $1`, [P.proto]), /permission denied/);
    await rejects(as(db, 'proto', `select public.set_my_plan('gold')`), /invalid_input/);
  });

  it('cannot be switched by users once self-service is off', async () => {
    await db.query(`update private.app_settings set value = 'false' where key = 'plan_self_service'`);
    await rejects(as(db, 'proto', `select public.set_my_plan('pro')`), /forbidden/);
    assert.equal((await plan('proto')).self_service, false);
    await db.query(`update private.app_settings set value = 'true' where key = 'plan_self_service'`);
  });
});

async function firstGroup(uid) {
  const r = await db.query(`select id from public.groups where created_by = $1 order by created_at limit 1`, [P[uid]]);
  return r.rows[0].id;
}
