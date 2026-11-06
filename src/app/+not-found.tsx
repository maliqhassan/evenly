import { router } from 'expo-router';

import { Button, EmptyState, Screen } from '@/components';

export default function NotFound() {
  return (
    <Screen>
      <EmptyState icon="circle-alert" title="This page doesn’t exist" body="The link may be out of date." />
      <Button label="Go home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
