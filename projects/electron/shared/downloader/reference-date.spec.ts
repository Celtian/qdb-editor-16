import { describe, expect, test } from 'vitest';
import { formatReferenceDate, isReferenceDate, slugifySnapshotName } from './reference-date.js';

describe('reference dates', () => {
  test('accepts real date-only values, including leap days', () => {
    expect(isReferenceDate('2024-02-29')).toBe(true);
    expect(isReferenceDate('2026-01-01')).toBe(true);
  });

  test('rejects invalid formats and calendar dates', () => {
    for (const value of ['2023-02-29', '2026-04-31', '2026-1-01', '1899-12-31', '']) {
      expect(isReferenceDate(value)).toBe(false);
    }
  });

  test('formats local calendar parts and creates safe names', () => {
    expect(formatReferenceDate('2026-01-01', 'en-GB')).toBe('1 Jan 2026');
    expect(formatReferenceDate('2026-07-25')).toBe('Jul 25, 2026');
    expect(slugifySnapshotName('2026/1')).toBe('2026-1');
    expect(slugifySnapshotName('  Ženy / jaro  ')).toBe('zeny-jaro');
  });
});
