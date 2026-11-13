import { router } from 'expo-router';

import { Button, EmptyState, Screen } from '@/components';
import { t } from '@/i18n';

export default function NotFound() {
  return (
    <Screen>
      <EmptyState icon="circle-alert" title={t('This page doesn’t exist')} body={t('The link may be out of date.')} />
      <Button label={t('Go home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
