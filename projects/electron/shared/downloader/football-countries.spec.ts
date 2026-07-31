import { describe, expect, test } from 'vitest';
import {
  findFootballCountryByCode3,
  findFootballCountryByName,
  footballCountries,
} from './football-countries.js';

describe('football countries', () => {
  test('exposes canonical football associations and resolves normalized selections', () => {
    expect(footballCountries.length).toBeGreaterThan(200);
    expect(findFootballCountryByName(' scotland ')).toEqual({
      name: 'Scotland',
      code2: 'GB',
      code3: 'SCO',
      flagCode: 'GB-SCT',
    });
    expect(findFootballCountryByCode3(' eng ')).toEqual({
      name: 'England',
      code2: 'GB',
      code3: 'ENG',
      flagCode: 'GB-ENG',
    });
    expect(findFootballCountryByCode3('XXX')).toBeUndefined();
  });
});
