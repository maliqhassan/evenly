import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Modal stack: Record payment (20) → Payment recorded (21). */
export default function RecordPaymentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="success" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
