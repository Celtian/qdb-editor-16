import { TestBed } from '@angular/core/testing';
import { EntityColumnPreferences, entityColumnPreferenceKey } from './entity-column-preferences';

describe('EntityColumnPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses default order and visibility independently for every entity', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);

    expect(preferences.load('leagues')).toEqual({
      version: 2,
      order: [
        'name',
        'badge',
        'sourceName',
        'leagueCountry',
        'tier',
        'sourceId',
        'season',
        'teamCount',
        'sourceUrl',
        'createdAt',
        'updatedAt',
        'actions',
      ],
      visible: ['name', 'sourceName', 'leagueCountry', 'tier', 'teamCount', 'sourceUrl', 'actions'],
    });
    expect(preferences.load('teams').visible).toEqual([
      'name',
      'sourceName',
      'teamCountry',
      'playerCount',
      'sourceUrl',
      'actions',
    ]);
    expect(preferences.load('teams').order).toContain('leagueName');
    expect(preferences.load('teams').visible).not.toContain('leagueName');
    expect(preferences.load('players').visible).toEqual([
      'name',
      'sourceName',
      'countryName',
      'jerseyNumber',
      'position',
      'positionDetail',
      'birthdate',
      'height',
      'foot',
      'joined',
      'contractExpires',
      'marketValue',
      'sourceUrl',
      'actions',
    ]);
    expect(preferences.load('players').order).toContain('teamName');
    expect(preferences.load('players').order).toContain('leagueName');
    expect(preferences.load('players').order).toEqual(
      expect.arrayContaining(['height', 'weight', 'foot']),
    );
    expect(preferences.load('players').order.indexOf('weight')).toBe(
      preferences.load('players').order.indexOf('height') + 1,
    );
    expect(preferences.load('players').visible).not.toContain('weight');
    expect(preferences.load('players').visible).not.toContain('teamName');
    expect(preferences.load('players').visible).not.toContain('leagueName');
  });

  it('migrates legacy visibility arrays without changing their built-in order', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);
    window.localStorage.setItem(
      entityColumnPreferenceKey('teams'),
      JSON.stringify(['updatedAt', 'unknown', 'updatedAt', 42]),
    );

    expect(preferences.load('teams')).toEqual({
      version: 2,
      order: [
        'name',
        'badge',
        'leagueName',
        'sourceName',
        'teamCountry',
        'sourceId',
        'season',
        'playerCount',
        'sourceUrl',
        'createdAt',
        'updatedAt',
        'actions',
      ],
      visible: ['name', 'updatedAt', 'actions'],
    });
    expect(preferences.load('leagues').visible).toContain('actions');

    window.localStorage.setItem(
      entityColumnPreferenceKey('leagues'),
      JSON.stringify({
        version: 2,
        order: ['name', 'externalId', 'season', 'actions'],
        visible: ['name', 'externalId', 'actions'],
      }),
    );
    const migrated = preferences.load('leagues');
    expect(migrated.order.slice(0, 5)).toEqual(['name', 'badge', 'sourceId', 'season', 'actions']);
    expect(migrated.visible).not.toContain('badge');
    expect(migrated.visible).toContain('sourceId');
    expect(migrated.order).not.toContain('externalId');
  });

  it('persists custom order and normalizes required, duplicate, unknown, and new columns', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);
    preferences.save('players', {
      version: 2,
      order: [
        'marketValue',
        'name',
        'sourceName',
        'sourceId',
        'countryName',
        'jerseyNumber',
        'position',
        'positionDetail',
        'birthdate',
        'height',
        'foot',
        'joined',
        'contractExpires',
        'createdAt',
        'updatedAt',
      ],
      visible: ['name', 'marketValue', 'createdAt'],
    });
    expect(
      JSON.parse(window.localStorage.getItem(entityColumnPreferenceKey('players')) ?? ''),
    ).toEqual({
      version: 2,
      order: [
        'marketValue',
        'name',
        'badge',
        'sourceName',
        'sourceId',
        'countryName',
        'jerseyNumber',
        'position',
        'positionDetail',
        'birthdate',
        'height',
        'weight',
        'foot',
        'joined',
        'contractExpires',
        'createdAt',
        'updatedAt',
        'teamName',
        'leagueName',
        'sourceUrl',
        'actions',
      ],
      visible: ['marketValue', 'name', 'createdAt', 'sourceUrl', 'actions'],
    });

    window.localStorage.setItem(
      entityColumnPreferenceKey('leagues'),
      JSON.stringify({
        version: 2,
        order: ['actions', 'name', 'unknown', 'actions'],
        visible: ['name', 'unknown'],
      }),
    );
    expect(preferences.load('leagues')).toEqual({
      version: 2,
      order: [
        'actions',
        'name',
        'badge',
        'sourceName',
        'leagueCountry',
        'tier',
        'sourceId',
        'season',
        'teamCount',
        'sourceUrl',
        'createdAt',
        'updatedAt',
      ],
      visible: ['actions', 'name', 'sourceName', 'leagueCountry', 'tier', 'teamCount', 'sourceUrl'],
    });

    window.localStorage.setItem(
      entityColumnPreferenceKey('teams'),
      JSON.stringify({
        version: 2,
        order: ['name', 'badge', 'actions'],
        visible: ['name', 'badge', 'actions'],
      }),
    );
    expect(preferences.load('teams').visible).toContain('badge');
  });

  it('falls back to defaults for malformed, unsupported, or unavailable storage', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);
    window.localStorage.setItem(entityColumnPreferenceKey('leagues'), '{invalid');
    expect(preferences.load('leagues').visible).toContain('teamCount');

    window.localStorage.setItem(
      entityColumnPreferenceKey('leagues'),
      JSON.stringify({ version: 1, order: [], visible: [] }),
    );
    expect(preferences.load('leagues').visible).toContain('teamCount');

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.load('teams').visible).toContain('playerCount');
    getItem.mockRestore();
  });

  it('resets every entity layout without removing unrelated preferences', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);
    for (const entity of ['leagues', 'teams', 'players'] as const) {
      window.localStorage.setItem(entityColumnPreferenceKey(entity), '{}');
    }
    window.localStorage.setItem('qdb-downloader.theme', 'dark');

    expect(preferences.resetAll()).toBe(true);
    for (const entity of ['leagues', 'teams', 'players'] as const) {
      expect(window.localStorage.getItem(entityColumnPreferenceKey(entity))).toBeNull();
    }
    expect(window.localStorage.getItem('qdb-downloader.theme')).toBe('dark');

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.resetAll()).toBe(false);
    removeItem.mockRestore();
  });

  it('resets one entity layout without removing other preferences', () => {
    const preferences = TestBed.inject(EntityColumnPreferences);
    window.localStorage.setItem(entityColumnPreferenceKey('leagues'), '{}');
    window.localStorage.setItem(entityColumnPreferenceKey('teams'), '{}');
    window.localStorage.setItem('qdb-downloader.theme', 'dark');

    expect(preferences.reset('leagues')).toBe(true);
    expect(window.localStorage.getItem(entityColumnPreferenceKey('leagues'))).toBeNull();
    expect(window.localStorage.getItem(entityColumnPreferenceKey('teams'))).toBe('{}');
    expect(window.localStorage.getItem('qdb-downloader.theme')).toBe('dark');

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.reset('teams')).toBe(false);
    removeItem.mockRestore();
  });
});
