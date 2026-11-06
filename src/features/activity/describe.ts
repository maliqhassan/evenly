import type { ActivityItem } from '@/api';
import { expenseImpact } from '@/domain/ledger';
import type { CurrencyCode } from '@/domain/money';
import { categoryIcon, PAYMENT_METHOD_LABELS } from '@/features/expenses/categories';
import { firstNameOf } from '@/features/people';

export interface ActivityView {
  icon: string;
  tone: 'neutral' | 'positive';
  title: string;
  subtitle: string;
  amount: {
    minor: number;
    currency: CurrencyCode;
    sign: 'always' | 'never';
    tone: 'positive' | 'negative' | 'muted' | 'neutral';
  } | null;
  note: string;
  /** Short uppercase tag used on the dashboard ("YOU LENT $135"). */
  tag: { kind: 'lent' | 'owe' | 'paid' | 'received' | 'none'; minor: number } | null;
  total: { minor: number; currency: CurrencyCode } | null;
  href:
    { pathname: '/expense/[id]'; params: { id: string } } | { pathname: '/groups/[id]'; params: { id: string } } | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0);

/** Turn an immutable activity snapshot into a row from the viewer's perspective. */
export function describeActivity(a: ActivityItem, me: string): ActivityView {
  const d = a.data;
  const group = a.groupName ?? str(d.group_name);
  const currency = (str(d.currency) || 'USD') as CurrencyCode;
  const who = (id: unknown, name: unknown) => (id === me ? 'You' : firstNameOf(str(name)));

  if (a.entityType === 'expense') {
    const amount = n(d.amount_minor);
    const splits = Object.entries((d.splits ?? {}) as Record<string, number>).map(([profileId, v]) => ({
      profileId,
      amount: n(v),
    }));
    const paidBy = str(d.paid_by);
    const payer = who(paidBy, d.paid_by_name);
    const base = {
      icon: categoryIcon(str(d.category_id)),
      tone: 'neutral' as const,
      subtitle: `${payer} paid · ${group}`,
      total: { minor: amount, currency },
      href:
        a.type === 'expense_deleted' || !a.entityId
          ? null
          : { pathname: '/expense/[id]' as const, params: { id: a.entityId } },
    };
    if (a.type === 'expense_deleted') {
      return {
        ...base,
        title: `Deleted “${str(d.description)}”`,
        subtitle: `${who(a.actorId, d.actor_name)} · ${group}`,
        amount: { minor: amount, currency, sign: 'never', tone: 'muted' },
        note: 'deleted',
        tag: null,
      };
    }
    const impact = expenseImpact({ amount, paidBy, splits }, me);
    const edited = a.type === 'expense_updated';
    if (impact.kind === 'lent') {
      return {
        ...base,
        title: str(d.description),
        amount: { minor: impact.amount, currency, sign: 'always', tone: 'positive' },
        note: edited ? 'edited · you lent' : 'you lent',
        tag: { kind: 'lent', minor: impact.amount },
      };
    }
    if (impact.kind === 'owe') {
      return {
        ...base,
        title: str(d.description),
        amount: { minor: -impact.amount, currency, sign: 'always', tone: 'negative' },
        note: edited ? 'edited · your share' : 'your share',
        tag: { kind: 'owe', minor: impact.amount },
      };
    }
    return {
      ...base,
      title: str(d.description),
      amount: { minor: amount, currency, sign: 'never', tone: 'muted' },
      note: 'not involved',
      tag: { kind: 'none', minor: 0 },
    };
  }

  if (a.entityType === 'settlement') {
    const amount = n(d.amount_minor);
    const from = str(d.from);
    const to = str(d.to);
    const method = PAYMENT_METHOD_LABELS[str(d.method) as keyof typeof PAYMENT_METHOD_LABELS]?.toLowerCase() ?? '';
    const status =
      a.type === 'settlement_rejected'
        ? 'declined'
        : a.type === 'settlement_confirmed'
          ? 'confirmed'
          : str(d.status) === 'pending'
            ? 'pending'
            : method;
    const title =
      to === me
        ? `${who(from, d.from_name)} paid you`
        : from === me
          ? `You paid ${firstNameOf(str(d.to_name))}`
          : `${firstNameOf(str(d.from_name))} paid ${firstNameOf(str(d.to_name))}`;
    const tone =
      a.type === 'settlement_rejected' || a.type === 'settlement_deleted'
        ? 'muted'
        : to === me
          ? 'positive'
          : from === me
            ? 'neutral'
            : 'muted';
    return {
      icon: a.type === 'settlement_rejected' ? 'circle-alert' : 'circle-check',
      tone: 'positive',
      title: a.type === 'settlement_deleted' ? `Removed payment · ${title}` : title,
      subtitle: `Settlement · ${group}`,
      amount: { minor: amount, currency, sign: 'never', tone },
      note: status,
      tag: { kind: to === me ? 'received' : from === me ? 'paid' : 'none', minor: amount },
      total: { minor: amount, currency },
      href: a.groupId ? { pathname: '/groups/[id]', params: { id: a.groupId } } : null,
    };
  }

  // Membership & group events
  const actor = who(a.actorId, d.actor_name ?? d.member_name);
  let title = `${actor} updated ${group}`;
  let subtitle = group;
  let icon = 'users';
  switch (a.type) {
    case 'member_joined':
      title = `${who(a.entityId, d.member_name)} joined ${group}`;
      subtitle = d.invited_by_name
        ? `Invited by ${a.data.invited_by === me ? 'you' : firstNameOf(str(d.invited_by_name))}`
        : 'Joined with a link';
      icon = 'user-plus';
      break;
    case 'member_left':
      title = `${who(a.entityId, d.member_name)} left ${group}`;
      icon = 'log-out';
      break;
    case 'member_removed':
      title = `${firstNameOf(str(d.member_name))} was removed from ${group}`;
      subtitle = `By ${actor}`;
      icon = 'log-out';
      break;
    case 'group_created':
      title = `${actor} created ${group}`;
      icon = 'circle-plus';
      break;
    case 'group_archived':
      title = `${actor} archived ${group}`;
      icon = 'archive';
      break;
    case 'group_restored':
      title = `${actor} restored ${group}`;
      icon = 'archive';
      break;
  }
  return {
    icon,
    tone: 'neutral',
    title,
    subtitle,
    amount: null,
    note: '',
    tag: null,
    total: null,
    href: a.groupId ? { pathname: '/groups/[id]', params: { id: a.groupId } } : null,
  };
}
