import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import Intro from '@/app/intro';
import { useIntro } from '@/stores/intro';

jest.mock('@/lib/secure-storage', () => ({
  secureStorage: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

function Welcome() {
  return <Text>welcome</Text>;
}

describe('feature tour', () => {
  beforeEach(() => useIntro.setState({ seen: false }));

  it('steps through every page with Next, then Get started opens Welcome and marks it seen', async () => {
    await renderRouter({ intro: Intro, welcome: Welcome }, { initialUrl: '/intro' });

    for (const title of ['Split any bill', 'Know who owes what', 'Settle up in a tap']) {
      expect(screen.getByText(title)).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByText('Next'));
      });
    }
    expect(screen.queryByText('Skip')).toBeNull(); // no Skip on the last page
    await act(async () => {
      fireEvent.press(screen.getByText('Get started'));
    });

    expect(await screen.findByText('welcome')).toBeTruthy();
    expect(useIntro.getState().seen).toBe(true);
  });

  it('Skip ends the tour from the first page', async () => {
    await renderRouter({ intro: Intro, welcome: Welcome }, { initialUrl: '/intro' });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Skip the tour'));
    });

    expect(await screen.findByText('welcome')).toBeTruthy();
    expect(useIntro.getState().seen).toBe(true);
  });
});
