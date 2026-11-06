// Database tests: authentication pinning, RLS isolation, RPC validation,
// idempotency, balances and account lifecycle.
// Run with: npm run test:db
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { as, createDb, signUp } from './harness.mjs';

let db;
const P = {}; // uid → profile id

before(async () => {
  db = await createDb();
  for (const uid of ['vanessa', 'malik', 'jordan', 'priya', 'outsider']) {
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

const splitsOf = (pairs) => JSON.stringify(pairs.map(([pid, amt]) => ({ profile_id: pid, amount_minor: amt })));

async function createGroupWith(owner, members, name = 'Flatmates', currency = 'USD') {
  const [{ create_group: gid }] = await as(db, owner, `select public.create_group($1, 'home', $2)`, [name, currency]);
  const [{ code }] = await as(db, owner, `select * from public.get_invite_link($1)`, [gid]);
  for (const m of members) await as(db, m, `select public.accept_invite($1)`, [code]);
  return gid;
}

async function addExpense(actor, gid, amount, paidBy, splits, extra = {}) {
  const clientId = extra.clientId ?? randomUUID();
  const [{ save_expense: id }] = await as(
    db,
    actor,
    `select public.save_expense($1, $2, $3, $4, $5, $6, $7::jsonb, 'exact', 'groceries', current_date, null, $8, $9)`,
    [
      gid,
      clientId,
      extra.description ?? 'Groceries',
      amount,
      extra.currency ?? 'USD',
      paidBy,
      splitsOf(splits),
      extra.expenseId ?? null,
      extra.version ?? null,
    ],
  );
  return id;
}

async function balances(uid, gid) {
  const rows = await as(db, uid, `select * from public.get_my_group_balances() where group_id = $1`, [gid]);
  return Object.fromEntries(rows.map((r) => [r.profile_id, Number(r.net_minor)]));
}

describe('authentication & profiles', () => {
  it('ensure_profile is idempotent: repeated sign-in never duplicates', async () => {
    const [a] = await as(db, 'repeat', `select * from public.ensure_profile('Rae', null)`);
    const [b] = await as(db, 'repeat', `select * from public.ensure_profile('Rae', null)`);
    assert.equal(a.profile_id, b.profile_id);
    assert.equal(a.is_new, true);
    assert.equal(b.is_new, false);
    const [{ n }] = await db
      .query(`select count(*)::int n from public.profiles where firebase_uid = 'repeat'`)
      .then((r) => r.rows);
    assert.equal(n, 1);
  });

  it('rejects tokens from another Firebase project', async () => {
    await rejects(
      as(db, 'intruder', `select * from public.ensure_profile('X', null)`, [], { aud: 'other-proj' }),
      /not_authenticated/,
    );
    await rejects(
      as(db, 'intruder', `select * from public.ensure_profile('X', null)`, [], { iss: 'https://evil.example.com' }),
      /not_authenticated/,
    );
  });

  it('a forged token for an existing uid with the wrong audience sees nothing', async () => {
    const rows = await as(db, 'vanessa', `select * from public.profiles`, [], { aud: 'other-proj' });
    assert.equal(rows.length, 0);
  });

  it('takes the email from the verified token, not client input', async () => {
    const [p] = await as(db, 'vanessa', `select email from public.profiles where id = $1`, [P.vanessa]);
    assert.equal(p.email, 'vanessa@example.com');
  });

  it('anon cannot read anything', async () => {
    await rejects(as(db, null, `select * from public.profiles`), /permission denied/);
    await rejects(as(db, null, `select * from public.expenses`), /permission denied/);
    await rejects(as(db, null, `select public.create_group('x', 'home', 'USD')`), /permission denied/);
  });

  it('users can update only their own whitelisted columns', async () => {
    await as(db, 'vanessa', `update public.profiles set full_name = 'Vanessa Clarke' where id = $1`, [P.vanessa]);
    const touched = await as(
      db,
      'vanessa',
      `update public.profiles set full_name = 'Hacked' where id = $1 returning id`,
      [P.malik],
    );
    assert.equal(touched.length, 0);
    await rejects(
      as(db, 'vanessa', `update public.profiles set firebase_uid = 'malik' where id = $1`, [P.vanessa]),
      /permission denied/,
    );
  });

  it('strangers cannot see each other’s profiles', async () => {
    const rows = await as(db, 'outsider', `select id from public.profiles`);
    assert.deepEqual(
      rows.map((r) => r.id),
      [P.outsider],
    );
  });
});

describe('groups & RLS isolation', () => {
  let gid;
  before(async () => {
    gid = await createGroupWith('vanessa', ['malik', 'jordan', 'priya']);
    await addExpense('vanessa', gid, 12000, P.vanessa, [
      [P.vanessa, 3000],
      [P.malik, 3000],
      [P.jordan, 3000],
      [P.priya, 3000],
    ]);
  });

  it('members see the group, its members and expenses', async () => {
    assert.equal((await as(db, 'malik', `select id from public.groups where id = $1`, [gid])).length, 1);
    assert.equal((await as(db, 'malik', `select * from public.group_members where group_id = $1`, [gid])).length, 4);
    assert.equal((await as(db, 'malik', `select * from public.expenses where group_id = $1`, [gid])).length, 1);
  });

  it('outsiders see nothing of the group', async () => {
    for (const t of [
      'groups',
      'group_members',
      'expenses',
      'expense_splits',
      'settlements',
      'activity_logs',
      'audit_logs',
    ]) {
      const col = t === 'groups' ? 'id' : 'group_id';
      const rows = await as(db, 'outsider', `select 1 from public.${t} where ${col} = $1`, [gid]);
      assert.equal(rows.length, 0, `outsider leaked ${t}`);
    }
    assert.equal(
      (await as(db, 'outsider', `select * from public.get_my_group_balances() where group_id = $1`, [gid])).length,
      0,
    );
  });

  it('outsiders cannot write into the group via RPCs', async () => {
    await rejects(addExpense('outsider', gid, 100, P.outsider, [[P.outsider, 100]]), /not_member/);
    await rejects(
      as(db, 'outsider', `select public.record_settlement($1, $2, $3, $4, 100, 'USD')`, [
        gid,
        randomUUID(),
        P.outsider,
        P.vanessa,
      ]),
      /not_member/,
    );
    await rejects(as(db, 'outsider', `select * from public.get_invite_link($1)`, [gid]), /not_member/);
  });

  it('nobody can write financial tables directly', async () => {
    await rejects(
      as(
        db,
        'vanessa',
        `insert into public.expenses (group_id, client_id, description, amount_minor, currency, paid_by, created_by)
                         values ($1, gen_random_uuid(), 'x', 1, 'USD', $2, $2)`,
        [gid, P.vanessa],
      ),
      /permission denied/,
    );
    await rejects(
      as(db, 'vanessa', `update public.expense_splits set amount_minor = 0 where group_id = $1`, [gid]),
      /permission denied/,
    );
    await rejects(as(db, 'vanessa', `delete from public.settlements where group_id = $1`, [gid]), /permission denied/);
    await rejects(
      as(db, 'vanessa', `insert into public.group_members (group_id, profile_id) values ($1, $2)`, [gid, P.outsider]),
      /permission denied/,
    );
  });

  it('only admins can edit or archive the group', async () => {
    await rejects(
      as(db, 'malik', `select public.update_group($1, 'Mine', 'home', 'house', 'USD')`, [gid]),
      /forbidden/,
    );
    await as(db, 'vanessa', `select public.update_group($1, 'Flatmates', 'home', 'house', 'USD', 'Our flat')`, [gid]);
  });

  it('becoming a member exposes co-member profiles (and only then)', async () => {
    const rows = await as(db, 'malik', `select id from public.profiles order by id`);
    assert.deepEqual(new Set(rows.map((r) => r.id)), new Set([P.vanessa, P.malik, P.jordan, P.priya]));
  });

  it('invalid or revoked invite codes are rejected', async () => {
    await rejects(as(db, 'outsider', `select public.accept_invite('notarealcode1')`), /invite_invalid/);
    const [{ code }] = await as(db, 'vanessa', `select * from public.get_invite_link($1)`, [gid]);
    await as(db, 'vanessa', `select * from public.reset_invite_link($1)`, [gid]);
    await rejects(as(db, 'outsider', `select public.accept_invite($1)`, [code]), /invite_invalid/);
  });

  it('accepting twice never duplicates membership', async () => {
    const [{ code }] = await as(db, 'vanessa', `select * from public.get_invite_link($1)`, [gid]);
    await as(db, 'malik', `select public.accept_invite($1)`, [code]);
    const [{ n }] = await db
      .query(`select count(*)::int n from public.group_members where group_id = $1 and profile_id = $2`, [gid, P.malik])
      .then((r) => r.rows);
    assert.equal(n, 1);
  });

  it('direct invitations: invitee accepts, notification is created', async () => {
    const g2 = await createGroupWith('vanessa', [], 'Lisbon Trip', 'EUR');
    const [{ invite_profiles: n }] = await as(db, 'vanessa', `select public.invite_profiles($1, $2::uuid[])`, [
      g2,
      `{${P.outsider}}`,
    ]);
    assert.equal(n, 1);
    const [inv] = await as(db, 'outsider', `select id from public.group_invitations where group_id = $1`, [g2]);
    const notes = await as(db, 'outsider', `select type from public.notifications where group_id = $1`, [g2]);
    assert.deepEqual(
      notes.map((x) => x.type),
      ['group_invite'],
    );
    await as(db, 'outsider', `select public.respond_invitation($1, true)`, [inv.id]);
    assert.equal((await as(db, 'outsider', `select id from public.groups where id = $1`, [g2])).length, 1);
  });
});

describe('expenses', () => {
  let gid;
  before(async () => {
    gid = await createGroupWith('vanessa', ['malik', 'jordan', 'priya'], 'Expenses');
  });

  it('records splits and computes balances', async () => {
    await addExpense('malik', gid, 12000, P.malik, [
      [P.vanessa, 3000],
      [P.malik, 3000],
      [P.jordan, 3600],
      [P.priya, 2400],
    ]);
    assert.deepEqual(await balances('vanessa', gid), {
      [P.vanessa]: -3000,
      [P.malik]: 9000,
      [P.jordan]: -3600,
      [P.priya]: -2400,
    });
  });

  it('rejects splits that do not sum to the total', async () => {
    await rejects(
      addExpense('vanessa', gid, 12000, P.vanessa, [
        [P.vanessa, 3000],
        [P.malik, 3000],
        [P.jordan, 2750],
        [P.priya, 2400],
      ]),
      /split_mismatch/,
    );
  });

  it('rejects zero, negative and malformed amounts', async () => {
    await rejects(addExpense('vanessa', gid, 0, P.vanessa, [[P.vanessa, 0]]), /invalid_input/);
    await rejects(addExpense('vanessa', gid, -100, P.vanessa, [[P.vanessa, -100]]), /invalid_input/);
    await rejects(
      addExpense('vanessa', gid, 100, P.vanessa, [
        [P.vanessa, 150],
        [P.malik, -50],
      ]),
      /invalid_input/,
    );
    await rejects(
      addExpense('vanessa', gid, 100, P.vanessa, [
        [P.vanessa, 50],
        [P.vanessa, 50],
      ]),
      /invalid_input/,
    );
    await rejects(addExpense('vanessa', gid, 100, P.vanessa, [[P.vanessa, 100]], { currency: 'usd' }), /invalid_input/);
  });

  it('rejects participants or payers outside the group', async () => {
    await rejects(addExpense('vanessa', gid, 100, P.vanessa, [[P.outsider, 100]]), /invalid_participant/);
    await rejects(addExpense('vanessa', gid, 100, P.outsider, [[P.vanessa, 100]]), /invalid_participant/);
  });

  it('is idempotent on the client id (double-tap / retry safe)', async () => {
    const clientId = randomUUID();
    const a = await addExpense(
      'vanessa',
      gid,
      500,
      P.vanessa,
      [
        [P.vanessa, 250],
        [P.malik, 250],
      ],
      { clientId },
    );
    const b = await addExpense(
      'vanessa',
      gid,
      500,
      P.vanessa,
      [
        [P.vanessa, 250],
        [P.malik, 250],
      ],
      { clientId },
    );
    assert.equal(a, b);
    const [{ n }] = await db
      .query(`select count(*)::int n from public.expenses where client_id = $1`, [clientId])
      .then((r) => r.rows);
    assert.equal(n, 1);
  });

  it('edits use optimistic concurrency and write audit history', async () => {
    const id = await addExpense(
      'malik',
      gid,
      11000,
      P.malik,
      [
        [P.malik, 5500],
        [P.jordan, 5500],
      ],
      { description: 'Groceries' },
    );
    await addExpense(
      'malik',
      gid,
      12000,
      P.malik,
      [
        [P.malik, 6000],
        [P.jordan, 6000],
      ],
      { expenseId: id, version: 1 },
    );
    await rejects(
      addExpense(
        'malik',
        gid,
        13000,
        P.malik,
        [
          [P.malik, 6500],
          [P.jordan, 6500],
        ],
        { expenseId: id, version: 1 },
      ),
      /conflict/,
    );

    const audit = await as(
      db,
      'jordan',
      `select action, before->>'amount_minor' b, after->>'amount_minor' a from public.audit_logs where entity_id = $1 order by id`,
      [id],
    );
    assert.deepEqual(audit, [
      { action: 'create', b: null, a: '11000' },
      { action: 'update', b: '11000', a: '12000' },
    ]);
    const notes = await as(
      db,
      'jordan',
      `select body from public.notifications where data->>'expense_id' = $1 order by created_at`,
      [id],
    );
    assert.match(notes.at(-1).body, /Malik edited "Groceries" — \$110\.00 → \$120\.00/);
  });

  it('only the creator, payer or an admin may edit/delete', async () => {
    const id = await addExpense('malik', gid, 1000, P.malik, [
      [P.malik, 500],
      [P.jordan, 500],
    ]);
    await rejects(as(db, 'priya', `select public.delete_expense($1)`, [id]), /forbidden/);
    await as(db, 'vanessa', `select public.delete_expense($1)`, [id]); // admin
  });

  it('voided expenses leave balances but keep history', async () => {
    const before = await balances('vanessa', gid);
    const id = await addExpense('jordan', gid, 4000, P.jordan, [
      [P.jordan, 2000],
      [P.priya, 2000],
    ]);
    await as(db, 'jordan', `select public.delete_expense($1)`, [id]);
    assert.deepEqual(await balances('vanessa', gid), before);
    const [row] = await as(db, 'jordan', `select deleted_at from public.expenses where id = $1`, [id]);
    assert.ok(row.deleted_at);
    await rejects(as(db, 'jordan', `select public.delete_expense($1)`, [id]), /not_found/);
  });

  it('balances always net to zero per currency', async () => {
    await addExpense(
      'priya',
      gid,
      8420,
      P.priya,
      [
        [P.priya, 4210],
        [P.vanessa, 4210],
      ],
      { currency: 'EUR' },
    );
    const rows = await as(
      db,
      'vanessa',
      `select currency, sum(net_minor)::bigint s from public.get_my_group_balances() where group_id = $1 group by currency`,
      [gid],
    );
    for (const r of rows) assert.equal(Number(r.s), 0, `currency ${r.currency} does not net to zero`);
    assert.equal(rows.length, 2);
  });
});

describe('settlements', () => {
  let gid;
  before(async () => {
    gid = await createGroupWith('vanessa', ['malik', 'jordan'], 'Settle');
    await addExpense('vanessa', gid, 9000, P.vanessa, [
      [P.vanessa, 3000],
      [P.malik, 3000],
      [P.jordan, 3000],
    ]);
  });

  it('payer-recorded settlements are pending, count immediately, and are idempotent', async () => {
    const clientId = randomUUID();
    const sql = `select public.record_settlement($1, $2, $3, $4, 1000, 'USD', 'bank_transfer', 'TRX-88214')`;
    const [{ record_settlement: a }] = await as(db, 'malik', sql, [gid, clientId, P.malik, P.vanessa]);
    const [{ record_settlement: b }] = await as(db, 'malik', sql, [gid, clientId, P.malik, P.vanessa]);
    assert.equal(a, b);
    const [s] = await as(db, 'vanessa', `select status from public.settlements where id = $1`, [a]);
    assert.equal(s.status, 'pending');
    assert.equal((await balances('vanessa', gid))[P.malik], -2000);
  });

  it('only the receiver can confirm or reject; rejection removes it from balances', async () => {
    const [{ record_settlement: id }] = await as(
      db,
      'jordan',
      `select public.record_settlement($1, $2, $3, $4, 3000, 'USD')`,
      [gid, randomUUID(), P.jordan, P.vanessa],
    );
    await rejects(as(db, 'jordan', `select public.respond_settlement($1, true)`, [id]), /forbidden/);
    await as(db, 'vanessa', `select public.respond_settlement($1, false)`, [id]);
    assert.equal((await balances('vanessa', gid))[P.jordan], -3000);
    await rejects(as(db, 'vanessa', `select public.respond_settlement($1, true)`, [id]), /conflict/);
  });

  it('receiver-recorded settlements are confirmed immediately', async () => {
    const [{ record_settlement: id }] = await as(
      db,
      'vanessa',
      `select public.record_settlement($1, $2, $3, $4, 3000, 'USD', 'cash')`,
      [gid, randomUUID(), P.jordan, P.vanessa],
    );
    const [s] = await as(db, 'jordan', `select status from public.settlements where id = $1`, [id]);
    assert.equal(s.status, 'confirmed');
    assert.equal((await balances('vanessa', gid))[P.jordan], undefined); // settled → zero rows
  });

  it('third parties cannot record settlements between others', async () => {
    await rejects(
      as(db, 'jordan', `select public.record_settlement($1, $2, $3, $4, 100, 'USD')`, [
        gid,
        randomUUID(),
        P.malik,
        P.vanessa,
      ]),
      /forbidden/,
    );
  });

  it('cannot leave or delete account with an outstanding balance', async () => {
    await rejects(as(db, 'malik', `select public.leave_group($1)`, [gid]), /balances_outstanding/);
    await rejects(as(db, 'malik', `select public.delete_my_account()`), /balances_outstanding/);
  });

  it('reminders are rate-limited', async () => {
    await as(db, 'vanessa', `select public.send_reminder($1, $2)`, [gid, P.malik]);
    const [n] = await as(db, 'malik', `select body from public.notifications where type = 'reminder'`);
    assert.match(n.body, /Reminder: you owe Vanessa \$20\.00/);
    await rejects(as(db, 'vanessa', `select public.send_reminder($1, $2)`, [gid, P.malik]), /rate_limited/);
  });
});

describe('notifications, reports, account deletion', () => {
  it('users only see and mark their own notifications', async () => {
    const mine = await as(db, 'malik', `select id from public.notifications where read_at is null`);
    assert.ok(mine.length > 0);
    await as(db, 'malik', `select public.mark_notifications_read(null)`);
    assert.equal((await as(db, 'malik', `select id from public.notifications where read_at is null`)).length, 0);
    const others = await as(db, 'outsider', `select id from public.notifications where recipient_id = $1`, [P.malik]);
    assert.equal(others.length, 0);
  });

  it('each new notification queues a push dispatch when configured', async () => {
    await db.exec(
      `insert into vault.decrypted_secrets values ('push_dispatch_url', 'https://x.test/push'), ('push_dispatch_secret', 's3cret')`,
    );
    const gid = await createGroupWith('jordan', ['priya'], 'Push');
    await addExpense('jordan', gid, 1000, P.jordan, [
      [P.jordan, 500],
      [P.priya, 500],
    ]);
    const calls = await db.query(`select url, headers->>'x-dispatch-secret' s from net.calls`).then((r) => r.rows);
    assert.ok(calls.length >= 1);
    assert.equal(calls.at(-1).url, 'https://x.test/push');
    assert.equal(calls.at(-1).s, 's3cret');
  });

  it('spending report returns months and categories for my share', async () => {
    const [{ get_spending_report: r }] = await as(db, 'malik', `select public.get_spending_report('USD', 6)`);
    assert.equal(r.months.length, 6);
    assert.ok(r.categories.every((c) => c.share_minor > 0));
  });

  it('account deletion de-identifies the profile and frees the Firebase UID', async () => {
    const pid = await signUp(db, 'leaver', 'Leaver');
    await createGroupWith('leaver', [], 'Solo');
    await as(db, 'leaver', `select public.delete_my_account()`);
    const [p] = await db
      .query(`select full_name, email, firebase_uid, deleted_at from public.profiles where id = $1`, [pid])
      .then((r) => r.rows);
    assert.equal(p.full_name, 'Deleted user');
    assert.equal(p.email, null);
    assert.notEqual(p.firebase_uid, 'leaver');
    assert.ok(p.deleted_at);
    // Signing in again with the same Google account starts a fresh profile.
    const [again] = await as(db, 'leaver', `select * from public.ensure_profile('Leaver', null)`);
    assert.equal(again.is_new, true);
    assert.notEqual(again.profile_id, pid);
  });
});
