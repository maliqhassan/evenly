import type { SplitDefault } from '@/api';
import { draftAsDefault, sameDefault, useExpenseDraft } from '@/stores/drafts';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'draft-1' }));

const ids = ['you', 'malik', 'jordan'];
type DraftState = ReturnType<typeof useExpenseDraft.getState>;

function draft(over: Partial<DraftState> = {}) {
  useExpenseDraft.setState({
    groupId: 'g1',
    currency: 'USD',
    memberIds: ids,
    included: { you: true, malik: true, jordan: true },
    method: 'equal',
    inputs: { equal: {}, exact: {}, percent: {}, shares: {}, adjust: {} },
    ...over,
  });
}

const inputs = (method: 'percent' | 'shares', values: Record<string, string>): DraftState['inputs'] => ({
  equal: {},
  exact: {},
  percent: {},
  shares: {},
  adjust: {},
  [method]: values,
});

const percent = (rows: [string, boolean, number][]): SplitDefault => ({
  method: 'percent',
  members: rows.map(([profileId, included, value]) => ({ profileId, included, value })),
});

describe('saved default splits', () => {
  describe('draftAsDefault', () => {
    it('saves who is included for an equal split', () => {
      draft({ included: { you: true, malik: false, jordan: true } });
      expect(draftAsDefault(useExpenseDraft.getState())).toEqual({
        method: 'equal',
        members: [
          { profileId: 'you', included: true, value: 0 },
          { profileId: 'malik', included: false, value: 0 },
          { profileId: 'jordan', included: true, value: 0 },
        ],
      });
    });

    it('saves percentages as basis points and shares as scaled shares', () => {
      draft({ method: 'percent', inputs: inputs('percent', { you: '50', malik: '33.33', jordan: '16.67' }) });
      expect(draftAsDefault(useExpenseDraft.getState())?.members.map((m) => m.value)).toEqual([5000, 3333, 1667]);
      draft({ method: 'shares', inputs: inputs('shares', { you: '2', malik: '1.5', jordan: '1' }) });
      expect(draftAsDefault(useExpenseDraft.getState())?.members.map((m) => m.value)).toEqual([200, 150, 100]);
    });

    it('refuses exact and adjust splits, which depend on the bill total', () => {
      draft({ method: 'exact' });
      expect(draftAsDefault(useExpenseDraft.getState())).toBeNull();
      draft({ method: 'adjust' });
      expect(draftAsDefault(useExpenseDraft.getState())).toBeNull();
    });
  });

  describe('applyDefault', () => {
    it('starts the draft from the saved percentages', () => {
      draft();
      useExpenseDraft.getState().applyDefault(
        percent([
          ['you', true, 6000],
          ['malik', true, 4000],
          ['jordan', false, 0],
        ]),
      );
      const d = useExpenseDraft.getState();
      expect(d.method).toBe('percent');
      expect(d.included).toEqual({ you: true, malik: true, jordan: false });
      expect(d.inputs.percent).toMatchObject({ you: '60', malik: '40' });
    });

    it('restores equal splits with the same people', () => {
      draft();
      useExpenseDraft.getState().applyDefault({
        method: 'equal',
        members: [
          { profileId: 'you', included: true, value: 0 },
          { profileId: 'malik', included: false, value: 0 },
          { profileId: 'jordan', included: true, value: 0 },
        ],
      });
      const d = useExpenseDraft.getState();
      expect(d.method).toBe('equal');
      expect(d.included).toEqual({ you: true, malik: false, jordan: true });
    });

    it('is ignored when someone left and the percentages no longer add up to 100%', () => {
      draft({ memberIds: ['you', 'malik'], included: { you: true, malik: true } });
      useExpenseDraft.getState().applyDefault(
        percent([
          ['you', true, 5000],
          ['malik', true, 2500],
          ['jordan', true, 2500], // no longer in the group
        ]),
      );
      expect(useExpenseDraft.getState().method).toBe('equal');
    });

    it('leaves out anyone who joined after it was saved', () => {
      draft();
      useExpenseDraft.getState().applyDefault({
        method: 'shares',
        members: [
          { profileId: 'you', included: true, value: 200 },
          { profileId: 'malik', included: true, value: 100 },
        ],
      });
      expect(useExpenseDraft.getState().included).toEqual({ you: true, malik: true, jordan: false });
    });
  });

  describe('sameDefault', () => {
    const a = percent([
      ['you', true, 5000],
      ['malik', true, 5000],
      ['jordan', false, 0],
    ]);

    it('ignores order and people who are not included', () => {
      const b = percent([
        ['malik', true, 5000],
        ['you', true, 5000],
      ]);
      expect(sameDefault(a, b)).toBe(true);
    });

    it('notices a different percentage, method or nothing saved', () => {
      const changed = { ...a, members: a.members.map((m) => (m.profileId === 'you' ? { ...m, value: 6000 } : m)) };
      expect(sameDefault(a, changed)).toBe(false);
      expect(sameDefault(a, { ...a, method: 'shares' })).toBe(false);
      expect(sameDefault(a, null)).toBe(false);
      expect(sameDefault(null, undefined)).toBe(true);
    });
  });
});
