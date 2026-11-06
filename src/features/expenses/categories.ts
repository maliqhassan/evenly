/** Mirrors the `expense_categories` seed so icons render without a round-trip. */
export const CATEGORY_ICONS: Record<string, string> = {
  groceries: 'shopping-cart',
  dining: 'utensils',
  rent: 'key',
  utilities: 'zap',
  internet: 'wifi',
  transport: 'car',
  travel: 'plane',
  entertainment: 'ticket',
  shopping: 'shopping-bag',
  health: 'heart-pulse',
  gifts: 'gift',
  general: 'receipt',
};

export const CATEGORY_NAMES: Record<string, string> = {
  groceries: 'Groceries',
  dining: 'Dining out',
  rent: 'Rent',
  utilities: 'Utilities',
  internet: 'Internet',
  transport: 'Transport',
  travel: 'Travel',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  health: 'Health',
  gifts: 'Gifts',
  general: 'Other',
};

export const categoryIcon = (id: string | null | undefined) => CATEGORY_ICONS[id ?? ''] ?? 'receipt';
export const categoryName = (id: string | null | undefined) => CATEGORY_NAMES[id ?? ''] ?? 'Other';

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  other: 'Other',
} as const;

export const GROUP_TYPES = [
  { value: 'home', label: 'Home', icon: 'house' },
  { value: 'trip', label: 'Trip', icon: 'plane' },
  { value: 'couple', label: 'Couple', icon: 'heart' },
  { value: 'work', label: 'Work', icon: 'briefcase' },
  { value: 'other', label: 'Other', icon: 'users' },
] as const;

export const GROUP_ICONS = [
  'house',
  'plane',
  'heart',
  'briefcase',
  'users',
  'sandwich',
  'utensils',
  'shopping-cart',
  'ticket',
  'car',
  'gift',
  'key',
] as const;
