import type { SplitMethod } from '@/domain/money';

export const SPLIT_MODES: { value: SplitMethod; label: string; icon: string; help: string; summary: string }[] = [
  {
    value: 'equal',
    label: 'Equal',
    icon: 'equal',
    help: 'Split equally between everyone selected.',
    summary: 'Equally',
  },
  {
    value: 'exact',
    label: 'Exact',
    icon: 'dollar-sign',
    help: 'Enter the exact amount each person owes.',
    summary: 'By exact amounts',
  },
  {
    value: 'percent',
    label: 'Percent',
    icon: 'percent',
    help: 'Assign a percentage to each person. Totals must add up to 100%.',
    summary: 'By percentage',
  },
  {
    value: 'shares',
    label: 'Shares',
    icon: 'chart-pie',
    help: 'Give each person a number of shares — e.g. 2 for a couple, 1 for everyone else.',
    summary: 'By shares',
  },
  {
    value: 'adjust',
    label: 'Adjust',
    icon: 'sliders-horizontal',
    help: 'Add or subtract from someone’s share; the rest is split equally.',
    summary: 'With adjustments',
  },
];

export const splitModeMeta = (m: SplitMethod) => SPLIT_MODES.find((x) => x.value === m)!;
