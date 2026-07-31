import { describe, expect, test } from 'vitest';
import { toCsv, toJson } from './export-format.js';

describe('export formatting', () => {
  test('writes stable CSV headers and RFC 4180 escaped UTF-8 values', () => {
    expect(
      toCsv(
        [{ name: 'Žluťoučký kůň', note: 'A, "quoted"\nline', optional: undefined }],
        ['name', 'note', 'optional'],
      ),
    ).toBe('\uFEFFname,note,optional\r\nŽluťoučký kůň,"A, ""quoted""\nline",\r\n');
  });

  test('writes header-only CSV and empty JSON arrays', () => {
    expect(toCsv([], ['id', 'name'])).toBe('\uFEFFid,name\r\n');
    expect(toJson([])).toBe('[]\n');
  });
});
