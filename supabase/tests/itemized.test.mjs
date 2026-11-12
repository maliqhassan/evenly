// Database tests: itemized expenses (items stored next to an exact split).
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
  const [{ create_group: id }] = await as(db, 'vanessa', `select public.create_group('Itemized', 'home', 'USD')`);
  gid = id;
  const [{ code }] = await as(db, 'vanessa', `select * from public.get_invite_link($1)`, [gid]);
  for (const m of ['malik', 'jordan']) await as(db, m, `select public.accept_invite($1)`, [code]);
});
after(async () => db?.close());

const rejects = async (promise, pattern) => {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, pattern);
    return true;
  });
};

const splits = (...pairs) => JSON.stringify(pairs.map(([pid, amt]) => ({ profile_id: pid, amount_minor: amt })));

/** A 90.00 expense: Vanessa 50.00, Malik 40.00 (Jordan owes nothing). Paid by Malik, created by Vanessa. */
async function expense(over = {}) {
  const [{ save_expense: id }] = await as(
    db,
    over.actor ?? 'vanessa',
    `select public.save_expense($1, $2, 'Dinner', $3, 'USD', $4, $5::jsonb, 'exact', 'dining', current_date, null, null, null)`,
    [
      gid,
      randomUUID(),
      over.amount ?? 9000,
      over.paidBy ?? P.malik,
      over.splits ?? splits([P.vanessa, 5000], [P.malik, 4000]),
    ],
  );
  return id;
}

const items = (...rows) =>
  JSON.stringify(rows.map(([name, amount, ...ids]) => ({ name, amount_minor: amount, member_ids: ids })));
const setItems = (actor, id, json, extra = 0) =>
  as(db, actor, `select public.set_expense_items($1, $2::jsonb, $3)`, [id, json, extra]);
const stored = (id) =>
  db.query(`select * from public.expense_itemizations where expense_id = $1`, [id]).then((r) => r.rows[0]);

// Pizza 60.00 shared by Vanessa and Malik (30 each), Salad 20.00 for Vanessa, Tax/tip 10.00 split by item cost:
// Vanessa 50.00 -> 5000/9000*... : the numbers below just need to add up for the server to accept them.
const dinner = () => items(['Pizza', 6000, P.vanessa, P.malik], ['Salad', 2000, P.vanessa]);

describe('itemized expenses', () => {
  it('stores the items for an expense whose totals add up', async () => {
    const id = await expense();
    await setItems('vanessa', id, dinner(), 1000);
    const row = await stored(id);
    assert.equal(row.items.length, 2);
    assert.equal(Number(row.extra_minor), 1000);
    assert.equal(row.group_id, gid);
  });

  it('replacing the items overwrites them; null removes them', async () => {
    const id = await expense();
    await setItems('vanessa', id, dinner(), 1000);
    await setItems('vanessa', id, items(['Everything', 9000, P.vanessa, P.malik]), 0);
    assert.equal((await stored(id)).items.length, 1);
    await setItems('vanessa', id, null);
    assert.equal(await stored(id), undefined);
  });

  it('members can read them; outsiders cannot', async () => {
    const id = await expense();
    await setItems('vanessa', id, dinner(), 1000);
    const read = (uid) => as(db, uid, `select expense_id from public.expense_itemizations where expense_id = $1`, [id]);
    assert.equal((await read('jordan')).length, 1);
    assert.equal((await read('outsider')).length, 0);
  });

  it('rejects items that do not add up to the expense total', async () => {
    const id = await expense();
    await rejects(setItems('vanessa', id, dinner(), 500), /split_mismatch/); // 80.00 + 5.00 ≠ 90.00
    await rejects(setItems('vanessa', id, items(['Pizza', 6000, P.vanessa, P.malik]), 0), /split_mismatch/);
  });

  it('rejects invalid items', async () => {
    const id = await expense();
    await rejects(setItems('vanessa', id, '[]'), /invalid_input/);
    await rejects(setItems('vanessa', id, items(['Free', 0, P.vanessa]), 9000), /invalid_input/);
    await rejects(setItems('vanessa', id, items(['Nobody', 9000]), 0), /invalid_input/);
    await rejects(setItems('vanessa', id, items(['Twice', 9000, P.vanessa, P.vanessa]), 0), /invalid_input/);
    await rejects(setItems('vanessa', id, items(['x'.repeat(81), 9000, P.vanessa, P.malik]), 0), /invalid_input/);
    await rejects(setItems('vanessa', id, dinner(), -1), /invalid_input/);
  });

  it('rejects people outside the group', async () => {
    const id = await expense();
    await rejects(setItems('vanessa', id, items(['Pizza', 9000, P.vanessa, P.outsider]), 0), /invalid_participant/);
  });

  it('rejects items that leave out someone who owes money', async () => {
    const id = await expense();
    await rejects(setItems('vanessa', id, items(['Pizza', 9000, P.vanessa]), 0), /invalid_input/); // Malik owes 40.00
  });

  it('lets the creator, the payer or an admin set them; other members and outsiders cannot', async () => {
    const id = await expense(); // created by Vanessa, paid by Malik
    await setItems('malik', id, dinner(), 1000); // the payer
    const other = await expense({
      actor: 'jordan',
      paidBy: P.jordan,
      splits: splits([P.jordan, 4500], [P.vanessa, 4500]),
    });
    await rejects(setItems('malik', other, items(['All', 9000, P.jordan, P.vanessa])), /forbidden|permission/);
    await setItems('vanessa', other, items(['All', 9000, P.jordan, P.vanessa])); // group owner is an admin
    await rejects(setItems('outsider', id, dinner(), 1000), /not_member/);
  });

  it('cannot be written directly', async () => {
    const id = await expense();
    await rejects(
      as(
        db,
        'vanessa',
        `insert into public.expense_itemizations (expense_id, group_id, items) values ($1, $2, '[{}]')`,
        [id, gid],
      ),
      /permission denied/,
    );
  });

  it('unknown expenses are not found', async () => {
    await rejects(setItems('vanessa', randomUUID(), dinner(), 1000), /not_found/);
  });
});
