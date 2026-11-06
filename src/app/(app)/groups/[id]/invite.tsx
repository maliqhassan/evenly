import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { api, errorMessage } from '@/api';
import {
  Avatar,
  Card,
  Header,
  Icon,
  Overline,
  Pressable,
  QRCode,
  Screen,
  SearchField,
  Sheet,
  Skeleton,
  Text,
  toast,
} from '@/components';
import { activeMembers } from '@/features/people';
import { useDebounced } from '@/hooks/useDebounced';
import { inviteUrl } from '@/lib/config';
import { track } from '@/lib/monitoring';
import { useFriends, useGroup, useGroupInvitations, useInviteLink, useInviteProfiles } from '@/queries';
import { colors, radii, spacing } from '@/theme';

type State = 'invite' | 'pending' | 'member';

/** 13 — Invite members */
export default function Invite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { group } = useGroup(id);
  const link = useInviteLink(id);
  const friends = useFriends();
  const pending = useGroupInvitations(id);
  const invite = useInviteProfiles(id);
  const [q, setQ] = useState('');
  const [qr, setQr] = useState(false);

  const url = link.data ? inviteUrl(link.data.code) : '';
  const shortUrl = url.replace(/^https?:\/\//, '');

  // Exact e-mail lookup for people who aren't friends yet.
  const email = useDebounced(q.trim(), 400);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const lookup = useQuery({
    queryKey: ['find-by-email', email.toLowerCase()],
    queryFn: () => api.findProfileByEmail(email),
    enabled: isEmail,
    retry: false,
  });
  const found = isEmail && email === q.trim() ? (lookup.data ?? null) : null;

  const rows = useMemo(() => {
    if (!group) return [];
    const memberIds = new Set(activeMembers(group).map((m) => m.profileId));
    const pendingIds = new Set((pending.data ?? []).map((p) => p.inviteeProfileId));
    const state = (pid: string): State => (memberIds.has(pid) ? 'member' : pendingIds.has(pid) ? 'pending' : 'invite');
    const s = q.trim().toLowerCase();
    const list = (friends.data ?? [])
      .filter((f) => !s || `${f.name} ${f.email ?? ''}`.toLowerCase().includes(s))
      .map((f) => ({
        id: f.profileId,
        name: f.name,
        sub: f.email ?? f.groupNames.join(' · '),
        avatarUrl: f.avatarUrl,
        state: state(f.profileId),
      }));
    if (found && !list.some((x) => x.id === found.id))
      list.unshift({
        id: found.id,
        name: found.fullName,
        sub: q.trim(),
        avatarUrl: found.avatarUrl,
        state: state(found.id),
      });
    const order: Record<State, number> = { invite: 0, pending: 1, member: 2 };
    return list.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
  }, [group, friends.data, pending.data, q, found]);

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    toast.success('Invite link copied');
  };
  const share = async () => {
    track('invite_link_shared');
    await Share.share({ message: `Join “${group?.name ?? 'my group'}” on Evenly to split expenses: ${url}`, url });
  };
  const sendInvite = async (pid: string) => {
    try {
      await invite.mutateAsync([pid]);
      toast.success('Invitation sent');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen>
      <Header title={group ? `Invite to ${group.name}` : 'Invite'} />

      <View style={styles.linkCard}>
        <View style={{ gap: 4 }}>
          <Text variant="bodyLgStrong" color={colors.onDark}>
            Share invite link
          </Text>
          <Text variant="secondary" color={colors.onDarkMuted}>
            Anyone with the link can join this group.
          </Text>
        </View>
        <View style={styles.linkField}>
          {link.isLoading ? (
            <Skeleton width={160} height={14} style={{ opacity: 0.3 }} />
          ) : (
            <Text variant="secondary" color={colors.onDark} numberOfLines={1} style={{ flex: 1 }} selectable>
              {shortUrl}
            </Text>
          )}
          <Pressable onPress={copy} disabled={!url} accessibilityLabel="Copy invite link" style={styles.copy}>
            <Icon name="copy" size={14} color={colors.forest} />
            <Text variant="secondaryStrong" color={colors.forest}>
              Copy
            </Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={share}
            disabled={!url}
            accessibilityLabel="Share invite link"
            style={[styles.pillBtn, { backgroundColor: colors.mint }]}
          >
            <Icon name="share" size={16} color={colors.forest} />
            <Text variant="secondaryStrong" color={colors.forest}>
              Share
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setQr(true)}
            disabled={!url}
            accessibilityLabel="Show QR code"
            style={[styles.pillBtn, styles.outline]}
          >
            <Icon name="qr-code" size={16} color={colors.onDark} />
            <Text variant="secondary" color={colors.onDark}>
              QR code
            </Text>
          </Pressable>
        </View>
      </View>

      <SearchField value={q} onChangeText={setQ} placeholder="Name or email" bg={colors.surface} />

      <View style={{ gap: 8 }}>
        <Overline>{q ? 'RESULTS' : 'SUGGESTED'}</Overline>
        <Card radius={radii.card}>
          {rows.length === 0 ? (
            <Text variant="secondary" color={colors.textMuted} align="center" style={{ padding: 20 }}>
              {q
                ? 'No one found. Enter their full email, or share the link.'
                : 'Friends from your other groups will appear here.'}
            </Text>
          ) : (
            rows.map((r, i) => (
              <View key={r.id} style={[styles.row, i < rows.length - 1 && styles.divider]}>
                <Avatar id={r.id} name={r.name} uri={r.avatarUrl} size={38} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text variant="caption" color={colors.textFaint} numberOfLines={1}>
                    {r.sub}
                  </Text>
                </View>
                <StateButton
                  state={r.state}
                  onPress={() => sendInvite(r.id)}
                  busy={invite.isPending && invite.variables?.[0] === r.id}
                />
              </View>
            ))
          )}
        </Card>
      </View>

      <Sheet visible={qr} onClose={() => setQr(false)} title="Scan to join">
        <View style={styles.qr}>
          <View style={styles.qrCard}>{url ? <QRCode value={url} size={220} /> : null}</View>
          <Text variant="secondary" color={colors.textMuted} align="center">
            Ask friends to scan this with their camera to join {group?.name}.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}

function StateButton({ state, onPress, busy }: { state: State; onPress: () => void; busy: boolean }) {
  const s = {
    invite: { bg: colors.forest, fg: colors.onDarkStrong, label: busy ? '…' : 'Invite' },
    pending: { bg: colors.warningSoft, fg: colors.warning, label: 'Pending' },
    member: { bg: colors.surfaceMuted, fg: colors.textSubtle, label: 'Member' },
  }[state];
  return (
    <Pressable
      onPress={onPress}
      disabled={state !== 'invite' || busy}
      accessibilityLabel={s.label}
      style={[styles.stateBtn, { backgroundColor: s.bg }]}
    >
      <Text variant="captionStrong" color={s.fg}>
        {s.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkCard: { padding: 18, borderRadius: radii.cardXl, backgroundColor: colors.forestCard, gap: 14 },
  linkField: {
    height: 46,
    borderRadius: radii.input,
    backgroundColor: colors.onDarkField,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 8,
  },
  copy: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.mint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  outline: { borderWidth: 1, borderColor: colors.onDarkBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  stateBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    minWidth: 72,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  qr: { alignItems: 'center', gap: spacing['3xl'], paddingHorizontal: spacing.screen, paddingBottom: spacing.md },
  qrCard: { padding: 16, borderRadius: radii.cardLg, backgroundColor: colors.surface },
});
