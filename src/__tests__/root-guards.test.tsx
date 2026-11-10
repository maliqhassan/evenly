import { Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { RootStack } from '@/features/system/RootStack';
import { type SessionStatus, useSession } from '@/stores/session';

type Status = Exclude<SessionStatus, 'booting'>;

function label(text: string) {
  const Label = () => <Text>{text}</Text>;
  Label.displayName = `Label(${text})`;
  return Label;
}
const group = (initialRouteName: string) => ({
  unstable_settings: { initialRouteName },
  default: () => <Stack screenOptions={{ headerShown: false }} />,
});

function Root() {
  return <RootStack status={useSession((s) => s.status) as Status} />;
}

/**
 * Mirrors the shape of src/app: `(auth)` and `(onboarding)` have no index
 * route, so the root guards must redirect to a real screen, never +not-found.
 */
function routes(status: Status) {
  useSession.setState({ status });
  return {
    _layout: Root,
    '+not-found': label('not-found'),
    '(app)/_layout': group('(tabs)'),
    '(app)/(tabs)/_layout': group('index'),
    '(app)/(tabs)/index': label('home'),
    '(app)/(tabs)/groups': label('groups'),
    '(app)/profile': label('profile'),
    '(auth)/_layout': group('welcome'),
    '(auth)/welcome': label('welcome'),
    '(auth)/sign-in': label('sign-in'),
    '(auth)/sign-in-error': label('sign-in-error'),
    '(onboarding)/_layout': group('complete-profile'),
    '(onboarding)/complete-profile': label('complete-profile'),
    '(onboarding)/preferences': label('preferences'),
  };
}

async function expectScreen(text: string) {
  expect(await screen.findByText(text)).toBeTruthy();
  expect(screen.queryByText('not-found')).toBeNull();
}

describe('root route guards', () => {
  it.each([
    ['signedOut', 'welcome'],
    ['onboarding', 'complete-profile'],
    ['signedIn', 'home'],
  ] as const)('a launch at / while %s opens %s', async (status, expected) => {
    await renderRouter(routes(status), { initialUrl: '/' });
    await expectScreen(expected);
  });

  it('a signed-out deep link into the app opens welcome', async () => {
    await renderRouter(routes('signedOut'), { initialUrl: '/profile' });
    await expectScreen('welcome');
  });

  it.each([
    ['signedOut', 'welcome', 'onboarding', 'complete-profile'],
    ['signedOut', 'welcome', 'signedIn', 'home'],
    ['onboarding', 'complete-profile', 'signedIn', 'home'],
    ['signedIn', 'home', 'signedOut', 'welcome'],
  ] as const)('%s (%s) → %s opens %s', async (from, start, to, expected) => {
    await renderRouter(routes(from), { initialUrl: '/' });
    await expectScreen(start);
    await act(async () => {
      useSession.setState({ status: to });
    });
    await expectScreen(expected);
  });
});
