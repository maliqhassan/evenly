import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Split from '@/app/(app)/add-expense/split';
import { useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
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

const mockMutate = jest.fn();
let mockSaved: unknown = null;
jest.mock('@/queries', () => ({
  useGroup: () => ({ group: { id: 'g1', name: 'Flatmates' }, isLoading: false }),
  useGroupSplitDefault: () => ({ data: mockSaved }),
  useSaveSplitDefault: () => ({ mutate: mockMutate, isPending: false }),
}));

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

  describe('saving a default split', () => {
    const SAVE = 'Save as my default for this group';
    const quarters = { you: '25', malik: '25', jordan: '25', priya: '25' };
    const quartersDefault = {
      method: 'percent',
      members: members.map((profileId) => ({ profileId, included: true, value: 2500 })),
    };
    beforeEach(() => {
      mockMutate.mockClear();
      mockSaved = null;
      seed('percent', quarters);
      useExpenseDraft.setState({ groupId: 'g1', expenseId: null });
    });

    it('offers to save a split that adds up and sends it for this group', async () => {
      await render(<Split />);
      await fireEvent.press(screen.getByLabelText(SAVE));
      expect(mockMutate).toHaveBeenCalledWith({ groupId: 'g1', value: quartersDefault }, expect.anything());
    });

    it('shows it as saved, with Clear, when it matches the saved default', async () => {
      mockSaved = quartersDefault;
      await render(<Split />);
      expect(screen.getByText('Your default split for Flatmates')).toBeTruthy();
      expect(screen.queryByLabelText(SAVE)).toBeNull();
      await fireEvent.press(screen.getByLabelText('Clear your default split for this group'));
      expect(mockMutate).toHaveBeenCalledWith({ groupId: 'g1', value: null }, expect.anything());
    });

    it('does not offer it while the split does not add up', async () => {
      seed('percent', { you: '25', malik: '25', jordan: '25', priya: '10' });
      useExpenseDraft.setState({ groupId: 'g1', expenseId: null });
      await render(<Split />);
      expect(screen.queryByLabelText(SAVE)).toBeNull();
    });

    it('does not offer exact splits, which depend on this bill', async () => {
      seed('exact', { you: '30.00', malik: '30.00', jordan: '30.00', priya: '30.00' });
      useExpenseDraft.setState({ groupId: 'g1', expenseId: null });
      await render(<Split />);
      expect(screen.queryByLabelText(SAVE)).toBeNull();
    });

    it('does not offer it when editing an existing expense', async () => {
      useExpenseDraft.setState({ expenseId: 'e1' });
      await render(<Split />);
      expect(screen.queryByLabelText(SAVE)).toBeNull();
    });
  });

  describe('splitting by item', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      useExpenseDraft.setState({ itemized: false, items: [], extraText: '', expenseId: null });
    });

    it('offers to split by item from the regular split screen', async () => {
      seed('percent', { you: '25', malik: '25', jordan: '25', priya: '25' });
      await render(<Split />);
      await fireEvent.press(screen.getByLabelText('Split by item'));
      expect(router.push).toHaveBeenCalledWith('/add-expense/items');
    });

    it('shows each person’s total once the bill is itemized, and can go back to a regular split', async () => {
      seed('percent', {});
      useExpenseDraft.setState({
        itemized: true,
        amountText: '88.00',
        extraText: '8',
        items: [
          { id: 'a', name: 'Pizza', amountText: '60', memberIds: ['you', 'malik'] },
          { id: 'b', name: 'Salad', amountText: '20', memberIds: ['malik'] },
        ],
      });
      await render(<Split />);
      expect(screen.getByText('By item')).toBeTruthy();
      expect(screen.getByText('$33.00')).toBeTruthy();
      expect(screen.getByText('$55.00')).toBeTruthy();
      expect(screen.getByLabelText('Done').props.accessibilityState).toMatchObject({ disabled: false });

      await fireEvent.press(screen.getByLabelText('Edit items'));
      expect(router.push).toHaveBeenCalledWith('/add-expense/items');

      await fireEvent.press(screen.getByLabelText('Use a regular split instead'));
      expect(useExpenseDraft.getState().itemized).toBe(false);
    });

    it('explains why Done is disabled when the items are incomplete', async () => {
      seed('percent', {});
      useExpenseDraft.setState({
        itemized: true,
        amountText: '10.00',
        items: [{ id: 'a', name: '', amountText: '', memberIds: ['you'] }],
      });
      await render(<Split />);
      expect(screen.getByText('Enter an amount for item 1')).toBeTruthy();
      expect(screen.getByLabelText('Done').props.accessibilityState).toMatchObject({ disabled: true });
    });
  });
});
