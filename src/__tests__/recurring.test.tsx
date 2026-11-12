import { fireEvent, render, screen } from '@testing-library/react-native';

import type { RecurringExpense } from '@/api';
import Recurring from '@/app/(app)/groups/[id]/recurring';
import { DialogHost } from '@/components';
import { useSession } from '@/stores/session';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'g1' }), router: { back: jest.fn() } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/features/people', () => ({
  usePeople: () => ({ label: (id: string) => (id === 'me' ? 'You' : 'Sara') }),
}));

const mockSetActive = jest.fn();
const mockRemove = jest.fn();
let mockItems: RecurringExpense[] = [];
let mockMembers: { profileId: string; role: string }[] = [];
jest.mock('@/queries', () => ({
  useGroup: () => ({ group: { id: 'g1', name: 'Flatmates', members: mockMembers } }),
  useRecurring: () => ({ data: mockItems, isLoading: false }),
  useSetRecurringActive: () => ({ mutate: mockSetActive }),
  useDeleteRecurring: () => ({ mutate: mockRemove }),
}));

const rent: RecurringExpense = {
  id: 'r1',
  groupId: 'g1',
  createdBy: 'me',
  description: 'Rent',
  amount: 90000,
  currency: 'USD',
  paidBy: 'me',
  categoryId: 'rent',
  frequency: 'monthly',
  nextRun: '2026-12-01',
  active: true,
  lastError: null,
};
const wifi: RecurringExpense = {
  ...rent,
  id: 'r2',
  description: 'Wi-Fi',
  createdBy: 'sara',
  paidBy: 'sara',
  frequency: 'weekly',
  active: false,
  lastError: 'invalid_participant: member left',
};

function show() {
  return render(
    <>
      <Recurring />
      <DialogHost />
    </>,
  );
}

describe('Recurring expenses screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ me: { profile: { id: 'me' } } as never });
    mockMembers = [{ profileId: 'me', role: 'member' }];
    mockItems = [rent, wifi];
  });

  it('lists what repeats, with the schedule, payer and next date', async () => {
    await show();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Every month · paid by You')).toBeTruthy();
    expect(screen.getByText(/^Next on /)).toBeTruthy();
    expect(screen.getByText('Every week · paid by Sara')).toBeTruthy();
  });

  it('explains in plain words why one was paused', async () => {
    await show();
    expect(screen.getByText('Paused: someone in the split is no longer in the group')).toBeTruthy();
  });

  it('lets the creator pause it', async () => {
    await show();
    await fireEvent.press(screen.getByLabelText('Pause Rent'));
    expect(mockSetActive).toHaveBeenCalledWith({ id: 'r1', active: false }, expect.anything());
  });

  it('asks before stopping one, then removes it', async () => {
    await show();
    await fireEvent.press(screen.getByLabelText('Stop repeating Rent'));
    expect(screen.getByText('Stop “Rent”?')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Stop repeating'));
    expect(mockRemove).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('hides the controls for expenses someone else set up, unless you are an admin', async () => {
    await show();
    expect(screen.queryByLabelText('Resume Wi-Fi')).toBeNull();
    expect(screen.queryByLabelText('Stop repeating Wi-Fi')).toBeNull();
  });

  it('shows the controls to group admins', async () => {
    mockMembers = [{ profileId: 'me', role: 'admin' }];
    await show();
    expect(screen.getByLabelText('Resume Wi-Fi')).toBeTruthy();
    expect(screen.getByLabelText('Stop repeating Wi-Fi')).toBeTruthy();
  });

  it('shows how to set one up when nothing repeats', async () => {
    mockItems = [];
    await show();
    expect(screen.getByText('Nothing repeats yet')).toBeTruthy();
  });
});
