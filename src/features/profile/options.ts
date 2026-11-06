import type { DateFormatPref, NumberFormatPref } from '@/api';
import type { SelectOption } from '@/components';
import { CURRENCIES, currencyLabel } from '@/domain/money';

export const REGIONS: {
  code: string;
  name: string;
  currency: string;
  numberFormat: NumberFormatPref;
  dateFormat: DateFormatPref;
}[] = [
  { code: 'US', name: 'United States', currency: 'USD', numberFormat: '1,234.56', dateFormat: 'MM/DD/YYYY' },
  { code: 'CA', name: 'Canada', currency: 'CAD', numberFormat: '1,234.56', dateFormat: 'YYYY-MM-DD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'AU', name: 'Australia', currency: 'AUD', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'DE', name: 'Germany', currency: 'EUR', numberFormat: '1.234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'FR', name: 'France', currency: 'EUR', numberFormat: '1 234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'ES', name: 'Spain', currency: 'EUR', numberFormat: '1.234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'IT', name: 'Italy', currency: 'EUR', numberFormat: '1.234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', numberFormat: '1.234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', numberFormat: '1 234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', numberFormat: '1.234,56', dateFormat: 'DD/MM/YYYY' },
  { code: 'IN', name: 'India', currency: 'INR', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' },
  { code: 'JP', name: 'Japan', currency: 'JPY', numberFormat: '1,234.56', dateFormat: 'YYYY-MM-DD' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', numberFormat: '1 234,56', dateFormat: 'YYYY-MM-DD' },
];

export const regionName = (code: string) => REGIONS.find((r) => r.code === code)?.name ?? code;

export const currencyOptions: SelectOption<string>[] = CURRENCIES.map((c) => ({
  value: c.code,
  label: currencyLabel(c.code),
  description: c.symbol,
}));
export const regionOptions: SelectOption<string>[] = REGIONS.map((r) => ({ value: r.code, label: r.name }));
export const numberFormatOptions: SelectOption<NumberFormatPref>[] = [
  { value: '1,234.56', label: '1,234.56' },
  { value: '1.234,56', label: '1.234,56' },
  { value: '1 234,56', label: '1 234,56' },
];
export const dateFormatOptions: SelectOption<DateFormatPref>[] = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];
