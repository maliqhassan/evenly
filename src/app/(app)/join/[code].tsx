import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { api, errorMessage } from '@/api';
import { Button, ErrorState, Header, IconTile, Screen, Skeleton, Text, toast } from '@/components';
import { t } from '@/i18n';
import { track } from '@/lib/monitoring';
import { useAcceptInvite } from '@/queries';
import { colors } from '@/theme';

/** Join a group from an invite link (evenly.app/j/<code>). */
export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const preview = useQuery({ queryKey: ['invite', code], queryFn: () => api.previewInvite(code), retry: false });
  const accept = useAcceptInvite();

  const join = async () => {
    try {
      const groupId = await accept.mutateAsync(code);
      track('invite_accepted');
      router.dismiss();
      router.push({ pathname: '/groups/[id]', params: { id: groupId } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const p = preview.data;
  return (
    <Screen
      footer={
        p ? (
          p.alreadyMember ? (
            <Button
              label={t('Open group')}
              onPress={() => {
                router.dismiss();
                router.push({ pathname: '/groups/[id]', params: { id: p.groupId } });
              }}
            />
          ) : (
            <Button label={`Join ${p.groupName}`} onPress={join} loading={accept.isPending} />
          )
        ) : undefined
      }
    >
      <Header left="close" />
      {preview.isLoading ? (
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 60 }}>
          <Skeleton width={72} height={72} radius={22} />
          <Skeleton width={200} height={24} />
        </View>
      ) : preview.isError || !p ? (
        <ErrorState message={errorMessage(preview.error)} onRetry={() => router.dismiss()} />
      ) : (
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 48 }}>
          <IconTile icon={p.icon} size={72} radius={22} bg={colors.forestCard} fg={colors.mint} iconSize={34} />
          <Text variant="h2" align="center">
            {p.groupName}
          </Text>
          <Text variant="bodyLg" color={colors.textMuted} align="center">
            {p.inviterName} invited you · {p.memberCount} members · {p.currency}
          </Text>
          {p.alreadyMember ? (
            <Text variant="secondary" color={colors.positive}>
              {t('You’re already a member.')}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
