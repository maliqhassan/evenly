import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AmountText,
  Avatar,
  AvatarStack,
  Card,
  EmptyState,
  Icon,
  IconButton,
  IconTile,
  Pressable,
  RadialFill,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonRows,
  Text,
} from '@/components';
import { dashboardSummary, myGroupNets, type CurrencySummary } from '@/domain/ledger';
import { formatMoney, sumConverted, type CurrencyCode } from '@/domain/money';
import { describeActivity } from '@/features/activity/describe';
import { GroupBalanceLabel } from '@/features/groups/GroupBalanceLabel';
import { activeMembers, firstNameOf } from '@/features/people';
import { openPricing, useIsPro } from '@/features/plan';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { chooseImage } from '@/lib/media';
import { useActivity, useBalances, useFxRates, useGroups, useUnreadCount } from '@/queries';
import { useExpenseDraft } from '@/stores/drafts';
import { useSession } from '@/stores/session';
import { colors, radii } from '@/theme';

/** 07 — Dashboard */
export default function Dashboard() {
  const me = useSession((s) => s.me!);
  const myId = me.profile.id;
  const { locale, currency: preferred } = usePreferences();
  const groups = useGroups();
  const balances = useBalances();
  const activity = useActivity({ kind: 'all' });
  const unread = useUnreadCount();

  const summaries = useMemo(
    () => dashboardSummary(balances.data ?? [], myId, preferred),
    [balances.data, myId, preferred],
  );
  const primary = summaries[0]!;
  const others = summaries.slice(1);
  // With balances in several currencies, show what they add up to, approximately, at today's rates.
  const isPro = useIsPro();
  const fx = useFxRates();
  const approxTotal = useMemo(
    () =>
      isPro && others.length > 0 && fx.data
        ? sumConverted(
            summaries.map((s) => ({ amount: s.net, currency: s.currency })),
            preferred,
            fx.data.rates,
          )
        : null,
    [isPro, summaries, others.length, fx.data, preferred],
  );
  const activeGroups = (groups.data ?? []).filter((g) => !g.archivedAt);
  const groupName = (id: string) => groups.data?.find((g) => g.id === id)?.name ?? '';
  const recent = (activity.data?.pages[0]?.items ?? [])
    .filter((a) => a.entityType === 'expense' || a.entityType === 'settlement')
    .slice(0, 2);

  const refresh = () => {
    void groups.refetch();
    void balances.refetch();
    void activity.refetch();
  };

  const scanBill = async () => {
    if (!isPro) return openPricing('scan');
    const file = await chooseImage(t('Scan a bill'));
    if (!file) return;
    useExpenseDraft.getState().start({
      group: activeGroups[0] ?? null,
      me: myId,
      receipt: { uri: file.uri, mimeType: file.mimeType, size: file.size ?? null },
    });
    router.push({ pathname: '/add-expense', params: { keepDraft: '1' } });
  };

  return (
    <Screen
      bg={colors.surface}
      withTabBar
      gap={14}
      refreshing={balances.isRefetching}
      onRefresh={refresh}
      contentStyle={{ paddingTop: 6 }}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          accessibilityHint="Your details, preferences and settings"
          style={styles.profile}
        >
          <Avatar id={myId} name={me.profile.fullName} uri={me.profile.avatarUrl} size={42} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="nav" numberOfLines={1}>
              {t('Hi, {name}!', { name: firstNameOf(me.profile.fullName) })}
            </Text>
            <View style={styles.profileLink}>
              <Text variant="captionMedium" color={colors.positive}>
                {t('View profile')}
              </Text>
              <Icon name="chevron-right" size={14} color={colors.positive} />
            </View>
          </View>
        </Pressable>
        <IconButton
          icon="bell"
          tone="plain"
          iconSize={22}
          badge={unread > 0}
          label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          onPress={() => router.push('/notifications')}
        />
      </View>

      <View style={styles.shell}>
        <View style={styles.mint}>
          <RadialFill colors={colors.mintGradient} offsets={[0, 0.7, 1]} />
          {balances.isLoading ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
              <Skeleton width={40} height={12} />
              <Skeleton width={180} height={36} radius={10} />
              <Skeleton width="80%" height={30} />
            </View>
          ) : (
            <BalanceCard s={primary} />
          )}
        </View>
        <View style={styles.actions}>
          <Action icon="plus" label={t('Add Expense')} primary onPress={() => router.push('/add-expense')} />
          <View style={styles.vr} />
          <Action icon="banknote" label={t('Settle Up')} onPress={() => router.push('/settle')} />
          <View style={styles.vr} />
          <Action icon="scan-line" label={t('Scan Bill')} onPress={scanBill} />
        </View>
      </View>

      {others.map((o) => (
        <Text key={o.currency} variant="caption" color={colors.textFaint} align="center" style={{ marginTop: -6 }}>
          {otherCurrencyCaption(o, locale, o.groupIds.map(groupName).filter(Boolean))}
        </Text>
      ))}

      {approxTotal !== null ? (
        <Text variant="caption" color={colors.textSubtle} align="center" style={{ marginTop: -6 }}>
          {t('About {amount} in total at today’s rates. Rates by Exchange Rate API.', {
            amount: formatMoney(approxTotal, preferred, { locale, sign: 'always' }),
          })}
        </Text>
      ) : !isPro && others.length > 0 ? (
        <Pressable
          onPress={() => openPricing('fx')}
          accessibilityRole="button"
          hitSlop={8}
          style={{ marginTop: -6, alignSelf: 'center' }}
        >
          <Text variant="caption" color={colors.positive} align="center">
            {t('See everything added up in {currency} with Pro', { currency: preferred })}
          </Text>
        </Pressable>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeader title={t('Recent Activity')} action={t('See All')} onAction={() => router.push('/activity')} />
        {activity.isLoading ? (
          <SkeletonRows count={2} bg={colors.bg} />
        ) : recent.length === 0 ? (
          <Card tone="bg" radius={radii.card}>
            <EmptyState
              icon="receipt"
              title={t('No activity yet')}
              body={t('Add your first expense to see it here.')}
            />
          </Card>
        ) : (
          recent.map((a) => <RecentRow key={a.id} item={a} me={myId} />)
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader
          title={t('My Groups')}
          action={activeGroups.length ? 'See All' : undefined}
          onAction={() => router.push('/groups')}
        />
        {groups.isLoading ? (
          <View style={styles.grid}>
            <Skeleton width="48%" height={96} radius={18} />
            <Skeleton width="48%" height={96} radius={18} />
          </View>
        ) : activeGroups.length === 0 ? (
          <Card tone="bg" radius={radii.card}>
            <EmptyState
              icon="users"
              title={t('Start your first group')}
              body={t('Groups keep shared costs for a home, trip or team in one place.')}
              action={t('Create group')}
              onAction={() => router.push('/new-group')}
            />
          </Card>
        ) : (
          <View style={styles.grid}>
            {activeGroups.slice(0, 4).map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/groups/[id]', params: { id: g.id } })}
                accessibilityLabel={`Group ${g.name}`}
                style={styles.groupCard}
              >
                <AvatarStack
                  people={activeMembers(g).map((m) => ({ id: m.profileId, name: m.name, uri: m.avatarUrl }))}
                  size={26}
                  ring={colors.bg}
                />
                <View style={{ gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {g.name}
                  </Text>
                  <GroupBalanceLabel nets={myGroupNets(balances.data ?? [], g.id, myId)} short variant="caption" />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function BalanceCard({ s }: { s: CurrencySummary }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text variant="captionMedium" color={colors.forestCard}>
        {s.currency}
      </Text>
      <Text variant="overlineSm" color={colors.textMuted} style={{ letterSpacing: 0.88 }}>
        {t('NET BALANCE')}
      </Text>
      <AmountText
        minor={s.net}
        currency={s.currency}
        sign="always"
        tone="auto"
        variant="heroSm"
        style={{ marginBottom: 8 }}
      />
      <View style={styles.split}>
        <View style={styles.splitCol}>
          <Text variant="overlineSm" color={colors.textMuted}>
            {t('OWED TO YOU')}
          </Text>
          <AmountText minor={s.owedToYou} currency={s.currency} tone="positive" variant="section" />
        </View>
        <View style={styles.splitDivider} />
        <View style={styles.splitCol}>
          <Text variant="overlineSm" color={colors.textMuted}>
            {t('YOU OWE')}
          </Text>
          <AmountText minor={s.youOwe} currency={s.currency} tone="negative" variant="section" />
        </View>
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  primary,
  onPress,
}: {
  icon: 'plus' | 'banknote' | 'scan-line';
  label: string;
  /** The main action: icon on a mint circle, bold label. */
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} haptic accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Icon name={icon} size={primary ? 24 : 22} color={primary ? colors.forest : colors.onDarkSoft} />
      </View>
      <Text variant={primary ? 'captionStrong' : 'caption'} color={primary ? colors.onDarkStrong : colors.onDarkSoft}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecentRow({ item, me }: { item: Parameters<typeof describeActivity>[0]; me: string }) {
  const v = describeActivity(item, me);
  const { locale } = usePreferences();
  const cur = (v.total?.currency ?? 'USD') as CurrencyCode;
  const tag =
    v.tag && v.tag.kind !== 'none'
      ? `${{ lent: t('YOU LENT'), owe: t('YOU OWE'), paid: t('YOU PAID'), received: t('YOU GOT') }[v.tag.kind]} ${formatMoney(v.tag.minor, cur, { locale, trimZeroFraction: true })}`
      : t('NOT INVOLVED');
  const tagColor =
    v.tag?.kind === 'lent' || v.tag?.kind === 'received'
      ? colors.positive
      : v.tag?.kind === 'owe'
        ? colors.negative
        : colors.textSubtle;
  const href = v.href;
  return (
    <Pressable
      onPress={href ? () => router.push(href) : undefined}
      disabled={!href}
      scaleOnPress={false}
      accessibilityLabel={`${v.title}, ${tag}`}
      style={styles.recent}
    >
      <IconTile icon={v.icon} size={38} round bg={colors.positiveSoft} fg={colors.positive} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {v.title}
        </Text>
        <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
          {v.subtitle.replace(/ · .*$/, '')} · {relativeDay(item.createdAt)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {v.total ? <AmountText minor={v.total.minor} currency={v.total.currency} /> : null}
        <Text variant="microStrong" color={tagColor}>
          {tag}
        </Text>
      </View>
    </Pressable>
  );
}

function relativeDay(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('Today');
  if (d.toDateString() === y.toDateString()) return t('Yesterday');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function otherCurrencyCaption(s: CurrencySummary, locale: string, groupNames: string[]) {
  const amt = formatMoney(Math.abs(s.net), s.currency, { locale });
  const where = groupNames.length ? ` · ${groupNames.slice(0, 2).join(', ')}${groupNames.length > 2 ? '…' : ''}` : '';
  if (s.net < 0) return t('Excludes {amount} you owe in {currency}', { amount: amt, currency: s.currency }) + where;
  if (s.net > 0) return t('Excludes {amount} owed to you in {currency}', { amount: amt, currency: s.currency }) + where;
  return t('Settled up in {currency}', { currency: s.currency }) + where;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  profileLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shell: { backgroundColor: colors.forestCard, borderRadius: radii.hero, padding: 10 },
  mint: {
    borderRadius: radii.heroInner,
    paddingVertical: 14,
    paddingHorizontal: 18,
    overflow: 'hidden',
    // Solid mint under the gradient, so the panel stays light green if the SVG doesn't draw.
    backgroundColor: colors.mint,
  },
  split: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: colors.hairlineOnMint,
    paddingTop: 12,
  },
  splitCol: { flex: 1, alignItems: 'center', gap: 2 },
  splitDivider: { width: 1, backgroundColor: colors.hairlineOnMint },
  actions: { flexDirection: 'row', paddingTop: 12, paddingBottom: 4 },
  action: { flex: 1, alignItems: 'center', gap: 6, minHeight: 48, justifyContent: 'center' },
  // Same size on every action so the labels line up; only the primary one is filled.
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionIconPrimary: { backgroundColor: colors.mint },
  vr: { width: 1, backgroundColor: colors.onDarkHairline },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.bg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  groupCard: { width: '48.5%', padding: 14, borderRadius: radii.card, backgroundColor: colors.bg, gap: 14 },
});
