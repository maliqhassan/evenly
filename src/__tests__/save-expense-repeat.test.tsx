import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { useSaveExpense } from '@/queries';

const input = {
  groupId: 'g1',
  clientId: 'c1',
  description: 'Rent',
  amount: 90000,
  currency: 'USD' as const,
  paidBy: 'me',
  splits: [{ profileId: 'me', amount: 90000, inputValue: null }],
  splitMethod: 'equal' as const,
  categoryId: 'rent',
  date: '2026-11-01',
  notes: null,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('saving an expense with Repeat', () => {
  beforeEach(() => {
    jest.spyOn(api, 'saveExpense').mockResolvedValue('e1');
    jest.spyOn(api, 'createRecurring').mockResolvedValue('r1');
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates the template from the saved expense, starting on its date', async () => {
    const { result } = await renderHook(() => useSaveExpense(), { wrapper });
    result.current.mutate({ input, repeat: 'monthly' });
    await waitFor(() => expect(api.createRecurring).toHaveBeenCalled());
    const sent = (api.createRecurring as jest.Mock).mock.calls[0][0];
    expect(sent).toMatchObject({
      groupId: 'g1',
      clientId: 'c1',
      frequency: 'monthly',
      startDate: '2026-11-01',
      amount: 90000,
    });
    expect(sent).not.toHaveProperty('date');
    expect(sent).not.toHaveProperty('expenseId');
  });

  it('does not create one for a one-off expense', async () => {
    const { result } = await renderHook(() => useSaveExpense(), { wrapper });
    result.current.mutate({ input });
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalled());
    expect(api.createRecurring).not.toHaveBeenCalled();
  });

  it('does not create one when editing an existing expense', async () => {
    const { result } = await renderHook(() => useSaveExpense(), { wrapper });
    result.current.mutate({ input: { ...input, expenseId: 'e1' }, repeat: 'weekly' });
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalled());
    expect(api.createRecurring).not.toHaveBeenCalled();
  });
});
