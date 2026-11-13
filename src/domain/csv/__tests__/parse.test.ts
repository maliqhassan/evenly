import {
  buildImportRows,
  detectDelimiter,
  guessColumns,
  looksLikeHeader,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
} from '../parse';

const TODAY = new Date(2026, 10, 13);

describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes, line breaks inside quotes and CRLF', () => {
    const text =
      'Date,Description,Amount\r\n2026-11-01,"Dinner, with ""Sara""",-45.50\r\n2026-11-02,"Line\nbreak",12\r\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-11-01', 'Dinner, with "Sara"', '-45.50'],
      ['2026-11-02', 'Line\nbreak', '12'],
    ]);
  });

  it('detects semicolons and tabs, strips a byte-order mark and skips blank lines', () => {
    expect(detectDelimiter('Datum;Betrag\n1;2')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(parseCsv('﻿a;b\n\n1;2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseCsvAmount', () => {
  const a = (v: string, c: 'USD' | 'PKR' | 'EUR' | 'JPY' = 'USD') => parseCsvAmount(v, c);

  it('reads common formats', () => {
    expect(a('12.50')).toBe(1250);
    expect(a('1,234.50')).toBe(123450);
    expect(a('1.234,50', 'EUR')).toBe(123450);
    expect(a('12,50', 'EUR')).toBe(1250);
    expect(a('1,250')).toBe(125000); // thousands, not decimals
    expect(a('1.250.000', 'EUR')).toBe(125000000);
    expect(a('Rs 1,850', 'PKR')).toBe(185000);
    expect(a('$45')).toBe(4500);
    expect(a('1,350', 'JPY')).toBe(1350);
    expect(a('1250.00', 'JPY')).toBe(1250);
  });

  it('reads negatives written in different ways', () => {
    expect(a('-45.50')).toBe(-4550);
    expect(a('(12.00)')).toBe(-1200);
    expect(a('12.00-')).toBe(-1200);
    expect(a('+3')).toBe(300);
  });

  it('rejects anything that is not a money value', () => {
    expect(a('')).toBeNull();
    expect(a('abc')).toBeNull();
    expect(a('12.345')).toBe(1234500); // read as thousands
    expect(a('12.3456')).toBeNull(); // too many decimals for dollars
    expect(a('1250.50', 'JPY')).toBeNull();
    expect(a('1-2')).toBeNull();
  });
});

describe('parseCsvDate', () => {
  it('reads ISO, numeric and month-name dates', () => {
    expect(parseCsvDate('2026-11-01', 'MDY', TODAY)).toBe('2026-11-01');
    expect(parseCsvDate('2026-11-01T10:30:00Z', 'MDY', TODAY)).toBe('2026-11-01');
    expect(parseCsvDate('01/11/2026', 'DMY', TODAY)).toBe('2026-11-01');
    expect(parseCsvDate('11/01/2026', 'MDY', TODAY)).toBe('2026-11-01');
    expect(parseCsvDate('25.10.2026', 'MDY', TODAY)).toBe('2026-10-25'); // 25 can only be the day
    expect(parseCsvDate('01-Nov-2026', 'MDY', TODAY)).toBe('2026-11-01');
    expect(parseCsvDate('Nov 1, 2026', 'MDY', TODAY)).toBe('2026-11-01');
  });

  it('accepts old statements but not impossible or future dates', () => {
    expect(parseCsvDate('2019-03-15', 'MDY', TODAY)).toBe('2019-03-15');
    expect(parseCsvDate('2030-01-01', 'MDY', TODAY)).toBeNull();
    expect(parseCsvDate('31/02/2026', 'DMY', TODAY)).toBeNull();
    expect(parseCsvDate('yesterday', 'MDY', TODAY)).toBeNull();
  });
});

describe('guessColumns', () => {
  it('finds date, description and a signed amount, never the balance', () => {
    expect(guessColumns(['Transaction Date', 'Details', 'Amount', 'Balance'])).toMatchObject({
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
    });
  });

  it('finds separate debit and credit columns on bank statements', () => {
    expect(guessColumns(['Posting date', 'Narrative', 'Debit', 'Credit', 'Balance'])).toMatchObject({
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      amount: null,
    });
    expect(guessColumns(['Date', 'Payee', 'Money out', 'Money in', 'Currency'])).toMatchObject({
      debit: 2,
      credit: 3,
      currency: 4,
    });
  });

  it('tells a header row from a data row', () => {
    expect(looksLikeHeader(['Date', 'Description', 'Amount'], 'USD')).toBe(true);
    expect(looksLikeHeader(['2026-11-01', 'Coffee', '-4.50'], 'USD')).toBe(false);
  });
});

describe('buildImportRows', () => {
  const opts = { currency: 'USD' as const, dateOrder: 'MDY' as const, spending: 'negative' as const, today: TODAY };

  it('turns money out into expenses and skips money in', () => {
    const map = guessColumns(['Date', 'Description', 'Amount']);
    const rows = buildImportRows(
      [
        ['2026-11-01', 'Groceries', '-45.50'],
        ['2026-11-02', 'Salary', '2000.00'],
        ['2026-11-03', '  Coffee   shop ', '-4.00'],
      ],
      map,
      opts,
    );
    expect(rows).toEqual([
      { line: 1, date: '2026-11-01', description: 'Groceries', amount: 4550, skip: null },
      { line: 2, date: '2026-11-02', description: 'Salary', amount: 0, skip: 'not_spending' },
      { line: 3, date: '2026-11-03', description: 'Coffee shop', amount: 400, skip: null },
    ]);
  });

  it('treats positive amounts as spending when told to', () => {
    const map = guessColumns(['Date', 'Item', 'Price']);
    const [row] = buildImportRows([['2026-11-01', 'Pizza', '12.00']], map, { ...opts, spending: 'positive' });
    expect(row).toMatchObject({ amount: 1200, skip: null });
  });

  it('uses the debit column, and skips rows that are credits', () => {
    const map = guessColumns(['Date', 'Narrative', 'Debit', 'Credit']);
    const rows = buildImportRows(
      [
        ['01/11/2026', 'Electric bill', '120.00', ''],
        ['02/11/2026', 'Refund', '', '30.00'],
      ],
      map,
      { ...opts, dateOrder: 'DMY' },
    );
    expect(rows.map((r) => [r.amount, r.skip])).toEqual([
      [12000, null],
      [0, 'not_spending'],
    ]);
  });

  it('skips rows in another currency, without an amount, or with an unreadable date', () => {
    const map = guessColumns(['Date', 'Description', 'Amount', 'Currency']);
    const rows = buildImportRows(
      [
        ['2026-11-01', 'Hotel', '-200.00', 'EUR'],
        ['2026-11-02', 'Note only', '', 'USD'],
        ['someday', 'Taxi', '-15.00', 'USD'],
        ['2026-11-04', '', '-3.00', ''],
      ],
      map,
      opts,
    );
    expect(rows.map((r) => r.skip)).toEqual(['other_currency', 'no_amount', 'no_date', null]);
    expect(rows[3]!.description).toBe('Imported expense');
  });
});
