// Database tests: recurring expenses (templates, the daily job, permissions).
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { as, createDb, signUp } from './harness.mjs';

let db;
const P = {};
let gid;

before(async () => {
  db = await createDb();
  for (const uid of ['vanessa', 'malik', 'jordan', 'outsider']) {
    P[uid] = await signUp(db, uid, uid[0].toUpperCase() + uid.slice(1));
  }
  gid = await createGroupWith('vanessa', ['malik', 'jordan'], 'Recurring');
});
after(async () => db?.close());

const rejects = async (promise, pattern) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, pattern);
    return true;
  });
};

async function createGroupWith(owner, members, name) {
  const [{ create_group: id }] = await as(db, owner, `select public.create_group($1, 'home', 'USD')`, [name]);
  const [{ code }] = await as(db, owner, `select * from public.get_invite_link($1)`, [id]);
  for (const m of members) await as(db, m, `select public.accept_invite($1)`, [code]);
  return id;
}

const splits = (...pairs) => JSON.stringify(pairs.map(([pid, amt]) => ({ profile_id: pid, amount_minor: amt })));
const thirds = () => splits([P.vanessa, 30000], [P.malik, 30000], [P.jordan, 30000]);

function create(actor, over = {}) {
  return as(
    db,
    actor,
    `select public.create_recurring_expense($1, $2, $3, $4, 'USD', $5, $6::jsonb, 'exact', 'rent', null, $7, $8::date) as id`,
    [
      over.group ?? gid,
      over.clientId ?? randomUUID(),
      over.description ?? 'Rent',
      over.amount ?? 90000,
      over.paidBy ?? P.vanessa,
      over.splits ?? thirds(),
      over.frequency ?? 'monthly',
      over.start ?? '2026-01-15',
    ],
  ).then((r) => r[0].id);
}

const row = (id) => db.query(`select * from public.recurring_expenses where id = $1`, [id]).then((r) => r.rows[0]);
const runJob = () => db.query(`select private.run_recurring_expenses() as made`).then((r) => r.rows[0].made);
const expensesOf = (desc) =>
  db
    .query(
      `select expense_date::text as d, amount_minor::text as amount from public.expenses
        where description = $1 order by expense_date`,
      [desc],
    )
    .then((r) => r.rows);
const dueOn = (id, date, runCount) =>
  db.query(`update public.recurring_expenses set next_run = $2::date, run_count = $3 where id = $1`, [
    id,
    date,
    runCount,
  ]);
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

describe('recurring expenses', () => {
  it('creates a template whose first run is the next occurrence after today', async () => {
    const id = await create('vanessa', { description: 'Gym', start: '2026-01-15' });
    const r = await row(id);
    assert.equal(r.active, true);
    assert.ok(iso(r.next_run) > new Date().toISOString().slice(0, 10), 'next run is in the future');
    assert.equal(iso(r.next_run).slice(8), '15', 'keeps the day of the month');
  });

  it('is idempotent on the client id', async () => {
    const clientId = randomUUID();
    const a = await create('vanessa', { clientId, description: 'Idem' });
    const b = await create('vanessa', { clientId, description: 'Idem' });
    assert.equal(a, b);
  });

  it('validates like a real expense and leaves nothing behind', async () => {
    const count = async () => (await db.query(`select count(*)::int as n from public.expenses`)).rows[0].n;
    const before = await count();
    await rejects(create('vanessa', { splits: splits([P.vanessa, 1000]) }), /split_mismatch/);
    await rejects(create('vanessa', { amount: 0 }), /invalid_input/);
    await rejects(create('vanessa', { frequency: 'daily' }), /invalid_input/);
    await rejects(create('vanessa', { paidBy: P.outsider }), /invalid_participant/);
    assert.equal(await count(), before, 'the dry run is rolled back');
  });

  it('only members can create one', async () => {
    await rejects(create('outsider'), /not_member/);
  });

  // Make a template that is due today: its anchor was one month ago.
  const dueToday = async (description) => {
    const id = await create('vanessa', { description, start: '2026-01-15' });
    await db.query(
      `update public.recurring_expenses
          set anchor_date = (current_date - interval '1 month')::date, run_count = 1, next_run = current_date
        where id = $1`,
      [id],
    );
    const [{ today, nextMonth }] = (
      await db.query(
        `select current_date::text as today, (current_date + interval '1 month')::date::text as "nextMonth"`,
      )
    ).rows;
    return { id, today, nextMonth };
  };

  it('the daily job creates the due expense on its run date, then schedules the next', async () => {
    const { id, today, nextMonth } = await dueToday('Daily job');
    assert.equal(await runJob(), 1);
    assert.deepEqual(await expensesOf('Daily job'), [{ d: today, amount: '90000' }]);
    const r = await row(id);
    assert.equal(iso(r.next_run), nextMonth);
    assert.equal(r.run_count, 2);
    // It belongs to the creator and notifies the others like any expense.
    const [e] = (await db.query(`select created_by from public.expenses where description = 'Daily job'`)).rows;
    assert.equal(e.created_by, P.vanessa);
    const n = await db.query(
      `select 1 from public.notifications where recipient_id = $1 and type = 'expense_added' and body like '%Daily job%'`,
      [P.malik],
    );
    assert.equal(n.rows.length, 1);
  });

  it('running the job again for the same date never duplicates an expense', async () => {
    const { id, today } = await dueToday('Twice');
    await runJob();
    await dueOn(id, today, 1); // as if the schedule update had been lost
    await runJob();
    assert.equal((await expensesOf('Twice')).length, 1);
  });

  it('catches up on missed days, one expense per missed period', async () => {
    const id = await create('vanessa', { description: 'Catch up', start: '2026-01-15', frequency: 'weekly' });
    const [{ d: weeksAgo }] = (await db.query(`select (current_date - 15)::text as d`)).rows;
    await db.query(`update public.recurring_expenses set anchor_date = $2::date - 7 where id = $1`, [id, weeksAgo]);
    await dueOn(id, weeksAgo, 1);
    assert.equal(await runJob(), 3); // 15, 8 and 1 days ago
    assert.equal((await expensesOf('Catch up')).length, 3);
    assert.ok(iso((await row(id)).next_run) > new Date().toISOString().slice(0, 10));
  });

  it('pauses and records why when a member has left', async () => {
    const gid2 = await createGroupWith('vanessa', ['malik', 'jordan'], 'Leaving');
    const id = await create('vanessa', { group: gid2, description: 'Left behind', start: '2026-01-15' });
    await as(db, 'jordan', `select public.leave_group($1)`, [gid2]);
    await dueOn(id, '2026-03-15', 2);
    assert.equal(await runJob(), 0);
    const r = await row(id);
    assert.equal(r.active, false);
    assert.match(r.last_error, /invalid_participant/);
  });

  it('resuming clears the error and skips runs missed while paused', async () => {
    const id = await create('vanessa', { description: 'Resume', start: '2026-01-15' });
    await db.query(
      `update public.recurring_expenses set active = false, last_error = 'x', next_run = '2026-02-15', run_count = 1 where id = $1`,
      [id],
    );
    await as(db, 'vanessa', `select public.set_recurring_active($1, true)`, [id]);
    const r = await row(id);
    assert.equal(r.active, true);
    assert.equal(r.last_error, null);
    assert.ok(iso(r.next_run) > new Date().toISOString().slice(0, 10));
    await runJob();
    assert.equal((await expensesOf('Resume')).length, 0, 'nothing is back-filled');
  });

  it('only the creator or a group admin can pause, resume or delete', async () => {
    const id = await create('vanessa', { description: 'Perms' });
    await rejects(as(db, 'malik', `select public.set_recurring_active($1, false)`, [id]), /forbidden|permission/);
    await rejects(as(db, 'malik', `select public.delete_recurring_expense($1)`, [id]), /forbidden|permission/);
    await rejects(as(db, 'outsider', `select public.set_recurring_active($1, false)`, [id]), /not_member/);
    await as(db, 'vanessa', `select public.set_recurring_active($1, false)`, [id]);
    assert.equal((await row(id)).active, false);
    await as(db, 'vanessa', `select public.delete_recurring_expense($1)`, [id]);
    assert.equal(await row(id), undefined);
  });

  it('members see their group’s templates; outsiders and direct writes are blocked', async () => {
    const id = await create('vanessa', { description: 'Visible' });
    assert.equal((await as(db, 'malik', `select id from public.recurring_expenses where id = $1`, [id])).length, 1);
    assert.equal((await as(db, 'outsider', `select id from public.recurring_expenses where id = $1`, [id])).length, 0);
    await rejects(
      as(db, 'vanessa', `update public.recurring_expenses set amount_minor = 1 where id = $1`, [id]),
      /permission denied/,
    );
  });

  it('month-end dates do not drift: the 31st stays the 31st', async () => {
    const at = async (anchor, freq, n) =>
      (await db.query(`select private.recurring_date($1::date, $2, $3)::text as d`, [anchor, freq, n])).rows[0].d;
    assert.deepEqual(
      [
        await at('2026-01-31', 'monthly', 1),
        await at('2026-01-31', 'monthly', 2),
        await at('2026-01-31', 'monthly', 3),
      ],
      ['2026-02-28', '2026-03-31', '2026-04-30'],
    );
    assert.deepEqual(
      [await at('2024-02-29', 'yearly', 1), await at('2024-02-29', 'yearly', 4)],
      ['2025-02-28', '2028-02-29'],
    );
    assert.equal(await at('2026-01-05', 'weekly', 2), '2026-01-19');
  });
});
