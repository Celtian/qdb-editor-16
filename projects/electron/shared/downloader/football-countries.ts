import { COUNTRY } from 'soccerbot/es5/shared/countries.js';

export interface FootballCountry {
  readonly name: string;
  readonly code2: string;
  readonly code3: string;
  readonly flagCode: string;
}

const associationFlagCodes: Readonly<Record<string, string>> = {
  ENG: 'GB-ENG',
  NIR: 'GB-NIR',
  SCO: 'GB-SCT',
  WAL: 'GB-WLS',
};

export const footballCountries: readonly FootballCountry[] = COUNTRY.map(
  ({ databasename, code2, code3 }) => ({
    name: databasename,
    code2,
    code3,
    flagCode: associationFlagCodes[code3] ?? code2,
  }),
);

const countriesByCode3 = new Map(footballCountries.map((country) => [country.code3, country]));
const countriesByName = new Map(
  footballCountries.map((country) => [country.name.toLocaleLowerCase('en'), country]),
);

export const findFootballCountryByCode3 = (code3: string): FootballCountry | undefined =>
  countriesByCode3.get(code3.trim().toLocaleUpperCase('en'));

export const findFootballCountryByName = (name: string): FootballCountry | undefined =>
  countriesByName.get(name.trim().toLocaleLowerCase('en'));
