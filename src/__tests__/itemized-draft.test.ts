import type { Expense, Group } from '@/api';
import { draftItemization, evaluateDraft, parseDraftItems, useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'draft-1' }));

const ids = ['you', 'sara', 'ali'];
type DraftState = ReturnType<typeof useExpenseDraft.getState>;

function draft(over: Partial<DraftState> = {}) {
  useExpenseDraft.setState({
    groupId: 'g1',
    currency: 'USD',
    memberIds: ids,
    amountText: '',
    itemized: true,
    items: [],
    extraText: '',
    ...over,
  });
  return useExpenseDraft.getState();
}

const item = (name: string, amountText: string, memberIds: string[]) => ({
  id: `i-${name}`,
  name,
  amountText,
  memberIds,
});

describe('itemized draft', () => {
  describe('parseDraftItems', () => {
    it('turns the typed items into amounts, naming unnamed ones', () => {
      const d = draft({ items: [item('Pizza', '60', ['you', 'sara']), item('', '2.50', ['ali'])], extraText: '8' });
      expect(parseDraftItems(d)).toEqual({
        items: [
          { name: 'Pizza', amount: 6000, memberIds: ['you', 'sara'] },
          { name: 'Item 2', amount: 250, memberIds: ['ali'] },
        ],
        extra: 800,
      });
    });

    it('treats a blank tax and tip as zero', () => {
      const d = draft({ items: [item('Soda', '3', ['you'])] });
      expect(parseDraftItems(d)).toMatchObject({ extra: 0 });
    });

    it('says what is missing', () => {
      expect(parseDraftItems(draft({ items: [] }))).toEqual({ error: 'Add at least one item' });
      expect(parseDraftItems(draft({ items: [item('A', '', ['you'])] }))).toEqual({
        error: 'Enter an amount for item 1',
      });
      expect(parseDraftItems(draft({ items: [item('A', '0', ['you'])] }))).toEqual({
        error: 'Enter an amount for item 1',
      });
      expect(parseDraftItems(draft({ items: [item('A', '5', [])] }))).toEqual({ error: 'Choose who had item 1' });
      expect(parseDraftItems(draft({ items: [item('A', '5', ['you'])], extraText: 'abc' }))).toEqual({
        error: 'Tax and tip is not a valid amount',
      });
    });
  });

  describe('evaluateDraft', () => {
    const items = [item('Pizza', '60', ['you', 'sara']), item('Salad', '20', ['sara'])];

    it('splits from the items when the amount matches their total', () => {
      const r = evaluateDraft(draft({ items, extraText: '8', amountText: '88.00' }));
      expect(r.ok).toBe(true);
      expect(r.allocations).toEqual([
        { id: 'you', amount: 3300 },
        { id: 'sara', amount: 5500 },
      ]);
    });

    it('is not ok when the amount has drifted from the items', () => {
      const r = evaluateDraft(draft({ items, extraText: '8', amountText: '90.00' }));
      expect(r).toMatchObject({ ok: false, message: 'The amount no longer matches the items' });
    });

    it('explains an invalid item instead of throwing', () => {
      expect(evaluateDraft(draft({ items: [item('A', '', ['you'])] }))).toMatchObject({
        ok: false,
        message: 'Enter an amount for item 1',
      });
    });

    it('uses the regular split when not itemized', () => {
      const r = evaluateDraft(
        draft({
          itemized: false,
          amountText: '90.00',
          method: 'equal',
          included: { you: true, sara: true, ali: false },
        }),
      );
      expect(r.ok).toBe(true);
      expect(r.allocations.map((a) => a.amount)).toEqual([4500, 4500]);
    });
  });

  describe('draftItemization', () => {
    it('gives the items to save, or null when not itemized or not valid yet', () => {
      const items = [item('Pizza', '60', ['you', 'sara'])];
      expect(draftItemization(draft({ items, extraText: '5' }))).toEqual({
        items: [{ name: 'Pizza', amount: 6000, memberIds: ['you', 'sara'] }],
        extra: 500,
      });
      expect(draftItemization(draft({ items, itemized: false }))).toBeNull();
      expect(draftItemization(draft({ items: [] }))).toBeNull();
    });
  });

  describe('editing and switching groups', () => {
    const group = {
      id: 'g1',
      currency: 'USD',
      members: ids.map((profileId) => ({ profileId, status: 'active' })),
    } as unknown as Group;
    const expense = {
      id: 'e1',
      groupId: 'g1',
      description: 'Dinner',
      amount: 8800,
      currency: 'USD',
      paidBy: 'you',
      categoryId: 'dining',
      date: '2026-11-01',
      notes: null,
      splitMethod: 'exact',
      version: 2,
      splits: [
        { profileId: 'you', amount: 3300, inputValue: null },
        { profileId: 'sara', amount: 5500, inputValue: null },
      ],
      itemization: {
        items: [
          { name: 'Pizza', amount: 6000, memberIds: ['you', 'sara'] },
          { name: 'Salad', amount: 2000, memberIds: ['sara'] },
        ],
        extra: 800,
      },
    } as unknown as Expense & { itemization: { items: never[]; extra: number } };

    it('restores the items of an itemized expense so they can be edited', () => {
      useExpenseDraft.getState().startEdit(expense, group);
      const d = useExpenseDraft.getState();
      expect(d.itemized).toBe(true);
      expect(d.hadItems).toBe(true);
      expect(d.extraText).toBe('8.00');
      expect(d.items.map((i) => [i.name, i.amountText, i.memberIds])).toEqual([
        ['Pizza', '60.00', ['you', 'sara']],
        ['Salad', '20.00', ['sara']],
      ]);
      expect(evaluateDraft(d).ok).toBe(true);
    });

    it('leaves a regular expense alone', () => {
      useExpenseDraft.getState().startEdit({ ...expense, itemization: null } as never, group);
      const d = useExpenseDraft.getState();
      expect(d.itemized).toBe(false);
      expect(d.hadItems).toBe(false);
      expect(d.items).toEqual([]);
    });

    it('starts over when the group changes', () => {
      draft({ items: [item('Pizza', '60', ['you'])], extraText: '5' });
      useExpenseDraft.getState().setGroup(group, 'you');
      const d = useExpenseDraft.getState();
      expect(d.itemized).toBe(false);
      expect(d.items).toEqual([]);
      expect(d.extraText).toBe('');
    });
  });
});
