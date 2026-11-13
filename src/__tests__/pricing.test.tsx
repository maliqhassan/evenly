import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';

import { api, AppError } from '@/api';
import Pricing from '@/app/(app)/pricing';
import { handlePlanLimit } from '@/features/plan';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ reason: 'expenses' })),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const freePlan = {
  plan: 'free' as const,
  groupLimit: 3,
  groupsUsed: 2,
  expenseLimit: 15,
  expensesUsed: 15,
  resetsOn: '2026-12-01',
  selfService: true,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('Pricing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('explains why it opened and shows the Free allowance', async () => {
    jest.spyOn(api, 'getPlan').mockResolvedValue(freePlan);
    await render(<Pricing />, { wrapper });
    expect(
      await screen.findByText('Free includes 15 expenses a month. Go Pro for unlimited expenses.'),
    ).toBeTruthy();
    expect(screen.getByText('15 of 15')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('switches to Pro straight away while testing, then closes', async () => {
    jest.spyOn(api, 'getPlan').mockResolvedValue(freePlan);
    const setPlan = jest.spyOn(api, 'setPlan').mockResolvedValue();
    await render(<Pricing />, { wrapper });
    await screen.findByText('15 of 15');
    await act(async () => {
      fireEvent.press(screen.getByText('Switch to Pro'));
    });
    await waitFor(() => expect(setPlan).toHaveBeenCalledWith('pro'));
    expect(router.back).toHaveBeenCalled();
  });

  it('can be closed without choosing anything', async () => {
    jest.spyOn(api, 'getPlan').mockResolvedValue(freePlan);
    const setPlan = jest.spyOn(api, 'setPlan');
    await render(<Pricing />, { wrapper });
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(router.back).toHaveBeenCalled();
    expect(setPlan).not.toHaveBeenCalled();
  });
});

describe('handlePlanLimit', () => {
  it('opens pricing for the limit the server reported', () => {
    expect(handlePlanLimit(new AppError('plan_limit', 'groups'))).toBe(true);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pricing', params: { reason: 'groups' } });
  });

  it('leaves other errors to the caller', () => {
    expect(handlePlanLimit(new AppError('network'))).toBe(false);
  });
});
