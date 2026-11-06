import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components';

/** Tab bar: Home, Groups, [+ Add expense], Activity, Friends. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="friends" />
    </Tabs>
  );
}
