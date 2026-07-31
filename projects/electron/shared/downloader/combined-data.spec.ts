import { describe, expect, test } from 'vitest';
import {
  identifyPlayers,
  isStrongPlayerMatch,
  normalizePersonName,
  normalizeSourcePriority,
  resolveNameValue,
  resolvePlayer,
} from './combined-data.js';
import type { PlayerSourceRecord, SourceName } from './contracts.js';

const priority: SourceName[] = ['transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal'];

const player = (
  id: string,
  sourceName: PlayerSourceRecord['sourceName'],
  name: string,
  overrides: Partial<PlayerSourceRecord> = {},
): PlayerSourceRecord => ({
  id,
  sourceName,
  sourceId: id,
  teamId: `${sourceName}-team`,
  teamName: 'Team',
  name,
  ...overrides,
});

describe('combined data matching', () => {
  test('normalizes casing, punctuation, and diacritics', () => {
    expect(normalizePersonName('  Ondřej  Kolář ')).toBe('ondrej kolar');
    expect(normalizePersonName("Jean-Pierre O'Neil")).toBe('jean pierre o neil');
  });

  test('requires strong corroboration and rejects conflicting birthdates', () => {
    const transfermarkt = player('one', 'transfermarkt', 'Ondřej Kolář', {
      birthdate: '1994-10-17',
    });
    expect(
      isStrongPlayerMatch(
        transfermarkt,
        player('two', 'soccerway', 'Ondrej Kolar', { birthdate: '1994-10-17' }),
      ),
    ).toBe(true);
    expect(
      isStrongPlayerMatch(
        transfermarkt,
        player('two', 'soccerway', 'Ondrej Kolar', { birthdate: '1995-10-17' }),
      ),
    ).toBe(false);
    expect(
      isStrongPlayerMatch(
        player('one', 'transfermarkt', 'Sparse Player'),
        player('two', 'soccerway', 'Sparse Player', { position: 'DEFENDER' }),
      ),
    ).toBe(false);
  });

  test('keeps ambiguous same-provider candidates separate', () => {
    const groups = identifyPlayers(
      [
        player('one', 'transfermarkt', 'Shared Name', { birthdate: '2000-01-01' }),
        player('two', 'soccerway', 'Shared Name', { birthdate: '2000-01-01' }),
        player('three', 'soccerway', 'Shared Name', { birthdate: '2000-01-01' }),
      ],
      ['transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal'],
    );
    expect(groups).toHaveLength(3);
    expect(groups.every(({ ambiguous, players }) => ambiguous && players.length === 1)).toBe(true);
  });

  test('resolves fields by priority and honors custom overrides', () => {
    const group = {
      id: 'group',
      automatic: true,
      ambiguous: false,
      players: [
        player('one', 'transfermarkt', 'Priority Name', { height: 190, weight: 84 }),
        player('two', 'soccerway', 'Other Name', { height: 188, weight: 81 }),
      ],
    };
    expect(resolvePlayer(group, priority)).toMatchObject({
      name: 'Priority Name',
      height: 190,
      weight: 84,
    });
    expect(
      resolvePlayer(group, priority, {
        name: { mode: 'custom', value: 'Canonical Name' },
        weight: { mode: 'source', sourceName: 'soccerway' },
      }),
    ).toMatchObject({ name: 'Canonical Name', height: 190, weight: 81 });
  });

  test('prefers equivalent diacritics variants while preserving explicit resolutions', () => {
    const values = [
      { sourceName: 'transfermarkt' as const, value: 'David Simek' },
      { sourceName: 'soccerway' as const, value: 'David Šimek' },
      { sourceName: 'worldfootball' as const, value: 'Dávid Šimek' },
    ];

    expect(resolveNameValue(values, priority)).toBe('David Šimek');
    expect(
      resolveNameValue(values, priority, { mode: 'source', sourceName: 'transfermarkt' }),
    ).toBe('David Simek');
    expect(resolveNameValue(values, priority, { mode: 'custom', value: 'David S.' })).toBe(
      'David S.',
    );
    expect(
      resolveNameValue(
        [
          { sourceName: 'transfermarkt', value: 'Sparta Prague' },
          { sourceName: 'soccerway', value: 'AC Sparta Praha' },
          { sourceName: 'eurofotbal', value: 'AC Spárta Praha' },
        ],
        priority,
      ),
    ).toBe('Sparta Prague');
  });

  test('prefers diacritics for every player name field and keeps source priority as a tie-breaker', () => {
    const group = {
      id: 'group',
      automatic: true,
      ambiguous: false,
      players: [
        player('one', 'transfermarkt', 'David Simek', {
          firstName: 'David',
          lastName: 'Simek',
        }),
        player('two', 'soccerway', 'David Šimek', {
          firstName: 'Davíd',
          lastName: 'Šimek',
        }),
        player('three', 'worldfootball', 'Davíd Šimek', {
          firstName: 'Davíd',
          lastName: 'Šimék',
        }),
      ],
    };

    expect(resolvePlayer(group, priority)).toMatchObject({
      name: 'David Šimek',
      firstName: 'Davíd',
      lastName: 'Šimek',
    });
  });

  test('repairs malformed priority collections', () => {
    expect(normalizeSourcePriority(['soccerway', 'soccerway'])).toEqual([
      'transfermarkt',
      'soccerway',
      'worldfootball',
      'eurofotbal',
    ]);
  });
});
