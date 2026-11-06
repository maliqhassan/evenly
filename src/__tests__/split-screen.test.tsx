import { fireEvent, render, screen } from '@testing-library/react-native';

import Split from '@/app/(app)/add-expense/split';
import { useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/features/people', () => {
  const names: Record<string, string> = { you: 'Vanessa', malik: 'Malik', jordan: 'Jordan', priya: 'Priya' };
  return {
    usePeople: () => ({
      myId: 'you',
      get: (id: string) => ({ id, name: names[id], firstName: names[id], avatarUrl: null, email: null }),
      label: (id: string) => (id === 'you' ? 'You' : names[id]),
    }),
  };
});

const members = ['you', 'malik', 'jordan', 'priya'];

function seed(method: 'exact' | 'percent', inputs: Record<string, string>) {
  useExpenseDraft.setState({
    amountText: '120.00',
    currency: 'USD',
    description: 'Groceries — Trader Joe’s',
    memberIds: members,
    included: Object.fromEntries(members.map((m) => [m, true])),
    method,
    inputs: { equal: {}, exact: {}, percent: {}, shares: {}, adjust: {}, [method]: inputs },
  });
}

describe('Split screen', () => {
  it('shows the 16b error state and disables Done when $8.50 is unassigned', async () => {
    seed('exact', { you: '30.00', malik: '30.00', jordan: '27.50', priya: '24.00' });
    await render(<Split />);
    expect(screen.getByText('Split $120.00')).toBeTruthy();
    expect(screen.getByText('$8.50 left to assign')).toBeTruthy();
    expect(screen.getByText('$111.50 of $120.00')).toBeTruthy();
    expect(screen.getByLabelText('Done').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('turns green and enables Done once the split adds up', async () => {
    seed('exact', { you: '30.00', malik: '30.00', jordan: '27.50', priya: '24.00' });
    await render(<Split />);
    await fireEvent.changeText(screen.getByLabelText('Exact for Jordan'), '36.00');
    expect(screen.getByText('Fully allocated')).toBeTruthy();
    expect(screen.getByText('$120.00 of $120.00')).toBeTruthy();
    expect(screen.getByLabelText('Done').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('computes per-person amounts in percent mode (design screen 16)', async () => {
    seed('percent', { you: '25', malik: '25', jordan: '30', priya: '20' });
    await render(<Split />);
    expect(screen.getByText('100% allocated')).toBeTruthy();
    expect(screen.getByText('$36.00')).toBeTruthy(); // Jordan 30%
    expect(screen.getByText('$24.00')).toBeTruthy(); // Priya 20%
  });

  it('reports remaining percentage when under 100%', async () => {
    seed('percent', { you: '25', malik: '25', jordan: '20', priya: '20' });
    await render(<Split />);
    expect(screen.getByText('10% left to assign')).toBeTruthy();
  });
});
