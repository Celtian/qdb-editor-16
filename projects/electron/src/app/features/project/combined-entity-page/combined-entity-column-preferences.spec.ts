import { TestBed } from '@angular/core/testing';

import {
  CombinedEntityColumnPreferences,
  combinedEntityColumnPreferenceKey,
} from './combined-entity-column-preferences';

describe('CombinedEntityColumnPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses source-aligned defaults independently for every combined entity', () => {
    const preferences = TestBed.inject(CombinedEntityColumnPreferences);

    expect(preferences.load('leagues')).toEqual({
      version: 1,
      order: [
        'name',
        'badge',
        'sources',
        'country',
        'tier',
        'parent',
        'created',
        'updated',
        'actions',
      ],
      visible: ['name', 'sources', 'country', 'tier', 'parent', 'actions'],
    });
    expect(preferences.load('teams')).toEqual({
      version: 1,
      order: [
        'name',
        'badge',
        'parent',
        'sources',
        'country',
        'playerCount',
        'created',
        'updated',
        'actions',
      ],
      visible: ['name', 'sources', 'country', 'playerCount', 'actions'],
    });
    expect(preferences.load('players').visible).toEqual([
      'name',
      'sources',
      'country',
      'jerseyNumber',
      'position',
      'positionDetail',
      'birthdate',
      'height',
      'foot',
      'joined',
      'contractExpires',
      'marketValue',
      'actions',
    ]);
  });

  it('persists custom layouts and normalizes required, duplicate, unknown, and new columns', () => {
    const preferences = TestBed.inject(CombinedEntityColumnPreferences);
    preferences.save('teams', {
      version: 1,
      order: ['actions', 'name', 'badge', 'unknown', 'badge'],
      visible: ['badge', 'unknown'],
    });

    expect(
      JSON.parse(window.localStorage.getItem(combinedEntityColumnPreferenceKey('teams')) ?? ''),
    ).toEqual({
      version: 1,
      order: [
        'actions',
        'name',
        'badge',
        'parent',
        'sources',
        'country',
        'playerCount',
        'created',
        'updated',
      ],
      visible: ['actions', 'name', 'badge', 'sources', 'country', 'playerCount'],
    });
  });

  it('inserts hidden created timestamps into existing stored layouts before updated timestamps', () => {
    const preferences = TestBed.inject(CombinedEntityColumnPreferences);
    window.localStorage.setItem(
      combinedEntityColumnPreferenceKey('teams'),
      JSON.stringify({
        version: 1,
        order: ['name', 'sources', 'updated', 'actions'],
        visible: ['name', 'sources', 'updated', 'actions'],
      }),
    );

    const preference = preferences.load('teams');

    expect(preference.order.indexOf('created')).toBe(preference.order.indexOf('updated') - 1);
    expect(preference.visible).not.toContain('created');
    expect(preference.visible).toContain('updated');
  });

  it('falls back for malformed or unsupported storage and tolerates unavailable storage', () => {
    const preferences = TestBed.inject(CombinedEntityColumnPreferences);
    window.localStorage.setItem(combinedEntityColumnPreferenceKey('leagues'), '{invalid');
    expect(preferences.load('leagues').visible).toContain('tier');

    window.localStorage.setItem(
      combinedEntityColumnPreferenceKey('leagues'),
      JSON.stringify({ version: 2, order: [], visible: [] }),
    );
    expect(preferences.load('leagues').visible).toContain('parent');

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.load('players').visible).toContain('marketValue');
    getItem.mockRestore();
  });

  it('resets one or every combined layout without removing source or unrelated preferences', () => {
    const preferences = TestBed.inject(CombinedEntityColumnPreferences);
    for (const entity of ['leagues', 'teams', 'players'] as const) {
      window.localStorage.setItem(combinedEntityColumnPreferenceKey(entity), '{}');
    }
    window.localStorage.setItem('qdb-downloader.visible-columns.leagues', 'source-layout');
    window.localStorage.setItem('qdb-downloader.theme', 'dark');

    expect(preferences.reset('leagues')).toBe(true);
    expect(window.localStorage.getItem(combinedEntityColumnPreferenceKey('leagues'))).toBeNull();
    expect(window.localStorage.getItem(combinedEntityColumnPreferenceKey('teams'))).toBe('{}');

    expect(preferences.resetAll()).toBe(true);
    expect(window.localStorage.getItem(combinedEntityColumnPreferenceKey('teams'))).toBeNull();
    expect(window.localStorage.getItem(combinedEntityColumnPreferenceKey('players'))).toBeNull();
    expect(window.localStorage.getItem('qdb-downloader.visible-columns.leagues')).toBe(
      'source-layout',
    );
    expect(window.localStorage.getItem('qdb-downloader.theme')).toBe('dark');

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.reset('players')).toBe(false);
    expect(preferences.resetAll()).toBe(false);
    removeItem.mockRestore();
  });
});
