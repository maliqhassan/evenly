import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ParsedReceipt } from '@/domain/receipt';
import { ReceiptScanSheet } from '@/features/expenses/ReceiptScanSheet';
import { canScanReceipts, dateOrderFor, scanReceipt } from '@/lib/receipt-scan';
import { useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockCapture = jest.fn();
jest.mock('@/lib/monitoring', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));

let mockNative: { recognizeText: jest.Mock } | null = null;
jest.mock('../../modules/receipt-text', () => ({
  get ReceiptText() {
    return mockNative;
  },
}));

const box = (y: number, x = 0) => ({ x, y, width: 200, height: 30 });
const photo = {
  text: '',
  blocks: [
    {
      text: '',
      lines: [
        { text: 'BAKE & BREW', bounds: box(10) },
        { text: 'Latte', bounds: box(60, 0) },
        { text: '4.50', bounds: box(61, 600) },
        { text: 'Muffin', bounds: box(110, 0) },
        { text: '3.25', bounds: box(111, 600) },
        { text: 'TOTAL', bounds: box(160, 0) },
        { text: '7.75', bounds: box(161, 600) },
      ],
    },
  ],
};

describe('scanReceipt', () => {
  beforeEach(() => {
    mockNative = { recognizeText: jest.fn() };
    mockCapture.mockClear();
  });

  it('does nothing in builds without a text recognizer', async () => {
    mockNative = null;
    expect(canScanReceipts()).toBe(false);
    expect(await scanReceipt('file:///r.jpg', { currency: 'USD', dateFormat: 'MM/DD/YYYY' })).toBeNull();
  });

  it('reads the photo, joins names with their prices and finds the total', async () => {
    mockNative!.recognizeText.mockResolvedValue(photo);
    expect(canScanReceipts()).toBe(true);
    const r = await scanReceipt('file:///r.jpg', { currency: 'USD', dateFormat: 'MM/DD/YYYY' });
    expect(mockNative!.recognizeText).toHaveBeenCalledWith('file:///r.jpg');
    expect(r).toMatchObject({
      merchant: 'Bake & Brew',
      total: 775,
      items: [
        { name: 'Latte', amount: 450 },
        { name: 'Muffin', amount: 325 },
      ],
      itemsMatchTotal: true,
    });
  });

  it('returns null and reports it when the photo cannot be read', async () => {
    mockNative!.recognizeText.mockRejectedValue(new Error('ERR_READ_IMAGE'));
    expect(await scanReceipt('file:///bad.jpg', { currency: 'USD', dateFormat: 'MM/DD/YYYY' })).toBeNull();
    expect(mockCapture).toHaveBeenCalled();
  });

  it('reads ambiguous dates the way the user’s date format does', () => {
    expect(dateOrderFor('MM/DD/YYYY')).toBe('MDY');
    expect(dateOrderFor('DD/MM/YYYY')).toBe('DMY');
    expect(dateOrderFor('YYYY-MM-DD')).toBe('DMY');
  });
});

const base: ParsedReceipt = {
  merchant: 'Bake & Brew',
  date: '2026-11-12',
  total: 775,
  totalIsGuess: false,
  items: [
    { name: 'Latte', amount: 450 },
    { name: 'Muffin', amount: 325 },
  ],
  extra: 0,
  itemsTotal: 775,
  itemsMatchTotal: true,
};

describe('ReceiptScanSheet', () => {
  const show = async (receipt: ParsedReceipt | null) => {
    const onUseTotal = jest.fn();
    const onSplitByItem = jest.fn();
    const onClose = jest.fn();
    await render(
      <ReceiptScanSheet
        receipt={receipt}
        currency="USD"
        onUseTotal={onUseTotal}
        onSplitByItem={onSplitByItem}
        onClose={onClose}
      />,
    );
    return { onUseTotal, onSplitByItem, onClose };
  };

  it('shows what was found and offers each choice', async () => {
    const h = await show(base);
    expect(await screen.findByText('Receipt scanned')).toBeTruthy();
    expect(screen.getByText('Bake & Brew')).toBeTruthy();
    expect(screen.getByText('$7.75')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Use these details'));
    expect(h.onUseTotal).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Split by item'));
    expect(h.onSplitByItem).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(h.onClose).toHaveBeenCalled();
  });

  it('does not offer to split by item when the items did not add up to the total', async () => {
    await show({ ...base, itemsMatchTotal: false, itemsTotal: 700 });
    expect(await screen.findByText(/didn’t add up to the total/)).toBeTruthy();
    expect(screen.queryByLabelText('Split by item')).toBeNull();
  });

  it('says when the total is a guess, and when none was found', async () => {
    const { rerender } = await render(
      <ReceiptScanSheet
        receipt={{ ...base, totalIsGuess: true }}
        currency="USD"
        onUseTotal={jest.fn()}
        onSplitByItem={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText(/best guess/)).toBeTruthy();
    await rerender(
      <ReceiptScanSheet
        receipt={{ ...base, total: null, items: [], itemsMatchTotal: false }}
        currency="USD"
        onUseTotal={jest.fn()}
        onSplitByItem={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('is hidden when there is nothing scanned', async () => {
    await show(null);
    expect(screen.queryByText('Receipt scanned')).toBeNull();
  });
});

describe('filling the expense from a receipt', () => {
  const members = ['you', 'sara'];
  const taxed: ParsedReceipt = {
    ...base,
    items: [
      { name: 'Latte', amount: 450 },
      { name: 'Muffin', amount: 250 },
    ],
    extra: 75,
  };

  beforeEach(() =>
    useExpenseDraft.setState({
      currency: 'USD',
      memberIds: members,
      description: '',
      amountText: '',
      date: '2026-01-01',
      itemized: true,
      items: [],
      extraText: '',
    }),
  );

  it('"total" fills the amount, place and date', () => {
    useExpenseDraft.getState().applyReceipt(base, 'total');
    expect(useExpenseDraft.getState()).toMatchObject({
      description: 'Bake & Brew',
      amountText: '7.75',
      date: '2026-11-12',
      itemized: false,
      items: [],
    });
  });

  it('keeps a description the user already typed', () => {
    useExpenseDraft.setState({ description: 'Team coffee' });
    useExpenseDraft.getState().applyReceipt(base, 'total');
    expect(useExpenseDraft.getState().description).toBe('Team coffee');
  });

  it('"items" lists them for everyone, with tax and tip, ready to adjust', () => {
    useExpenseDraft.getState().applyReceipt(taxed, 'items');
    const d = useExpenseDraft.getState();
    expect(d.items.map((i) => [i.name, i.amountText, i.memberIds])).toEqual([
      ['Latte', '4.50', ['you', 'sara']],
      ['Muffin', '2.50', ['you', 'sara']],
    ]);
    expect(d.extraText).toBe('0.75');
    expect(d.itemized).toBe(false); // the Items screen turns it on when confirmed
  });

  it('leaves the amount alone when no total was found', () => {
    useExpenseDraft.setState({ amountText: '12.00' });
    useExpenseDraft.getState().applyReceipt({ ...base, total: null }, 'total');
    expect(useExpenseDraft.getState().amountText).toBe('12.00');
  });
});
