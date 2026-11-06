import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Modal stack: Add expense (15) → Split (16). */
export default function AddExpenseLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
