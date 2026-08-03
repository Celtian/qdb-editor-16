import { describe, expect, it } from 'vitest';

import { decodeFifaText, encodeFifaText, parseTextTable } from './text-format';

describe('FIFA text format', () => {
  it('round trips UTF-16LE DB Master values', () => {
    const buffer = encodeFifaText(
      ['id', 'name'],
      [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Quoted\t"name"\nline' },
      ],
    );

    expect([...buffer.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(decodeFifaText(buffer)).toContain('\r\n');
    expect(parseTextTable(buffer)).toEqual({
      headers: ['id', 'name'],
      rows: [
        { id: '1', name: 'Alpha' },
        { id: '2', name: 'Quoted\t"name"\nline' },
      ],
    });
  });

  it('rejects files without the required byte-order mark', () => {
    expect(() => decodeFifaText(Buffer.from('plain text'))).toThrow(/UTF-16LE/);
  });
});
