import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import Items from '@/app/(app)/add-expense/items';
import { useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
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

function seed(over: Partial<ReturnType<typeof useExpenseDraft.getState>> = {}) {
  useExpenseDraft.setState({
    currency: 'USD',
    description: 'Dinner',
    memberIds: members,
    amountText: '',
    itemized: false,
    items: [],
    extraText: '',
    ...over,
  });
}

const press = (label: string) => fireEvent.press(screen.getByLabelText(label));
const doneDisabled = () => screen.getByLabelText('Done').props.accessibilityState?.disabled;

describe('Split by item screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts with one empty item and cannot be finished yet', async () => {
    seed();
    await render(<Items />);
    expect(screen.getByLabelText('Name of item 1')).toBeTruthy();
    expect(screen.getByText('Enter an amount for item 1')).toBeTruthy();
    expect(doneDisabled()).toBe(true);
    expect(screen.queryByLabelText('Remove item 1')).toBeNull(); // the only item can't be removed
  });

  it('asks who had an item when nobody is chosen', async () => {
    seed();
    await render(<Items />);
    await fireEvent.changeText(screen.getByLabelText('Amount of item 1'), '12');
    await press('Clear everyone from item 1');
    expect(screen.getByText('Choose who had item 1')).toBeTruthy();
    expect(doneDisabled()).toBe(true);
  });

  it('shares items among their people and tax and tip in proportion, then saves into the draft', async () => {
    seed();
    await render(<Items />);

    // Pizza 60.00 for You and Malik.
    await fireEvent.changeText(screen.getByLabelText('Name of item 1'), 'Pizza');
    await fireEvent.changeText(screen.getByLabelText('Amount of item 1'), '60');
    await press('Jordan had item 1');
    await press('Priya had item 1');

    // Salad 20.00 for Malik only.
    await press('Add item');
    await fireEvent.changeText(screen.getByLabelText('Amount of item 2'), '20');
    await press('Clear everyone from item 2');
    await press('Malik had item 2');

    // 8.00 tax and tip, shared 3000 : 5000 by what each person ordered (30.00 and 50.00).
    await fireEvent.changeText(screen.getByLabelText('Tax and tip'), '8');

    expect(screen.getByText('$88.00')).toBeTruthy(); // total
    expect(screen.getByText('$33.00')).toBeTruthy(); // You: 30.00 + 3.00
    expect(screen.getByText('$55.00')).toBeTruthy(); // Malik: 50.00 + 5.00
    expect(doneDisabled()).toBe(false);

    await press('Done');
    const d = useExpenseDraft.getState();
    expect(d.itemized).toBe(true);
    expect(d.amountText).toBe('88.00');
    expect(d.extraText).toBe('8');
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toMatchObject({ name: 'Pizza', amountText: '60', memberIds: ['you', 'malik'] });
    expect(router.back).toHaveBeenCalled();
  });

  it('can remove an item once there are two', async () => {
    seed();
    await render(<Items />);
    await press('Add item');
    expect(screen.getByLabelText('Remove item 2')).toBeTruthy();
    await press('Remove item 2');
    expect(screen.queryByLabelText('Name of item 2')).toBeNull();
  });

  it('reopens with the items already in the draft', async () => {
    seed({
      itemized: true,
      amountText: '10.00',
      items: [{ id: 'a', name: 'Burger', amountText: '10', memberIds: ['you'] }],
    });
    await render(<Items />);
    expect(screen.getByDisplayValue('Burger')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(doneDisabled()).toBe(false);
  });

  it('rejects a bad tax and tip amount', async () => {
    seed();
    await render(<Items />);
    await fireEvent.changeText(screen.getByLabelText('Amount of item 1'), '10');
    await fireEvent.changeText(screen.getByLabelText('Tax and tip'), '1.234');
    expect(screen.getByText('Tax and tip is not a valid amount')).toBeTruthy();
    expect(doneDisabled()).toBe(true);
  });
});
