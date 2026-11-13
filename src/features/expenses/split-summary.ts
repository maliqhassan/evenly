import type { SplitMethod } from '@/domain/money';
import { msg } from '@/i18n';

export const SPLIT_MODES: { value: SplitMethod; label: string; icon: string; help: string; summary: string }[] = [
  {
    value: 'equal',
    label: msg('Equal'),
    icon: 'equal',
    help: msg('Split equally between everyone selected.'),
    summary: msg('Equally'),
  },
  {
    value: 'exact',
    label: msg('Exact'),
    icon: 'dollar-sign',
    help: msg('Enter the exact amount each person owes.'),
    summary: msg('By exact amounts'),
  },
  {
    value: 'percent',
    label: msg('Percent'),
    icon: 'percent',
    help: msg('Assign a percentage to each person. Totals must add up to 100%.'),
    summary: msg('By percentage'),
  },
  {
    value: 'shares',
    label: msg('Shares'),
    icon: 'chart-pie',
    help: msg('Give each person a number of shares — e.g. 2 for a couple, 1 for everyone else.'),
    summary: msg('By shares'),
  },
  {
    value: 'adjust',
    label: msg('Adjust'),
    icon: 'sliders-horizontal',
    help: msg('Add or subtract from someone’s share; the rest is split equally.'),
    summary: msg('With adjustments'),
  },
];

export const splitModeMeta = (m: SplitMethod) => SPLIT_MODES.find((x) => x.value === m)!;
