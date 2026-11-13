import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import ImportCsv from '@/app/(app)/groups/[id]/import';
import { useSession } from '@/stores/session';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'g1' }), router: { back: jest.fn() } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_a: string, s: string) => {
    // Deterministic stand-in for SHA-256: hex of a simple hash, padded to 64 chars.
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, '0').repeat(8);
  }),
}));
const mockBankCsv = [
  'Date,Description,Amount,Balance',
  '2026-11-01,Groceries,-45.50,1000.00',
  '2026-11-02,Salary,2000.00,3000.00',
  '2026-11-03,Electric bill,-30.00,2970.00',
].join('\n');
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///bank.csv', name: 'bank.csv' }] })),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ text: async () => mockBankCsv })),
}));
jest.mock('@/features/people', () => ({
  activeMembers: (g: { members: { profileId: string }[] }) => g.members,
  usePeople: () => ({ label: (id: string) => (id === 'me' ? 'You' : 'Sara') }),
}));
jest.mock('@/queries', () => ({
  useGroup: () => ({
    group: {
      id: 'g1',
      name: 'Flatmates',
      currency: 'USD',
      members: [
        { profileId: 'me', status: 'active' },
        { profileId: 'sara', status: 'active' },
      ],
    },
  }),
  invalidateLedger: jest.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('Import from CSV', () => {
  beforeEach(() => {
    useSession.setState({ me: { profile: { id: 'me' } } as never });
    jest.spyOn(api, 'saveExpense').mockResolvedValue('e1');
  });
  afterEach(() => jest.restoreAllMocks());

  async function chooseFile() {
    await render(<ImportCsv />, { wrapper });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choose CSV file'));
    });
    await screen.findByText('bank.csv');
  }

  it('reads the file, guesses the columns and previews only the spending', async () => {
    await chooseFile();
    expect(screen.getByText('3 rows')).toBeTruthy();
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Electric bill')).toBeTruthy();
    expect(screen.queryByText('Salary')).toBeNull(); // money in
    expect(screen.getByText('2 to import · $75.50')).toBeTruthy();
    expect(screen.getByText(/1 rows skipped/)).toBeTruthy();
  });

  it('imports each row as an expense split equally, with ids that stay the same on a second import', async () => {
    await chooseFile();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Import 2 expenses'));
    });
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledTimes(2));
    const first = (api.saveExpense as jest.Mock).mock.calls[0][0];
    expect(first).toMatchObject({
      groupId: 'g1',
      description: 'Groceries',
      amount: 4550,
      currency: 'USD',
      paidBy: 'me',
      splitMethod: 'equal',
      date: '2026-11-01',
      splits: [
        { profileId: 'me', amount: 2275, inputValue: null },
        { profileId: 'sara', amount: 2275, inputValue: null },
      ],
    });
    const ids = (api.saveExpense as jest.Mock).mock.calls.map((c) => c[0].clientId);

    // Same file again → same client ids → the server returns the existing expenses.
    (api.saveExpense as jest.Mock).mockClear();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Import 2 expenses'));
    });
    await waitFor(() => expect(api.saveExpense).toHaveBeenCalledTimes(2));
    expect((api.saveExpense as jest.Mock).mock.calls.map((c) => c[0].clientId)).toEqual(ids);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('leaves out rows the user unticks', async () => {
    await chooseFile();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Groceries'));
    });
    expect(screen.getByText('1 to import · $30.00')).toBeTruthy();
  });
});
