import { TestBed } from '@angular/core/testing';

import { emptyCombinedEntityFilters } from '../combined-entity-filter-drawer/combined-entity-filter-drawer';
import { entityFilterPreferenceKey } from '../entity-table-page/entity-filter-preferences';
import {
  CombinedEntityFilterPreferences,
  combinedEntityFilterPreferenceKey,
} from './combined-entity-filter-preferences';

describe('CombinedEntityFilterPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores normalized filters independently by project and entity', () => {
    const preferences = TestBed.inject(CombinedEntityFilterPreferences);
    preferences.save('project-a', 'teams', {
      ...emptyCombinedEntityFilters(),
      sourceNames: ['transfermarkt', 'transfermarkt'],
      statuses: ['needsReview'],
      customBadgeIds: ['badge-a', ' badge-a ', 'badge-b'],
      parentIds: ['league-a', ' league-a ', 'league-b'],
      includeTeamsWithoutLeague: true,
      countries: ['England', ' England ', 'Scotland'],
      nationalities: ['Ignored'],
    });
    preferences.save('project-b', 'players', {
      ...emptyCombinedEntityFilters(),
      parentIds: ['team-a'],
      positions: ['ATTACKER'],
      positionDetails: ['ST'],
      feet: ['RIGHT'],
    });
    preferences.save('project-c', 'leagues', {
      ...emptyCombinedEntityFilters(),
      tiers: [2, 2, 7],
      includeLeaguesWithoutTier: true,
      countries: ['England'],
    });

    expect(preferences.load('project-a', 'teams')).toEqual({
      ...emptyCombinedEntityFilters(),
      sourceNames: ['transfermarkt'],
      statuses: ['needsReview'],
      customBadgeIds: ['badge-a', 'badge-b'],
      parentIds: ['league-a', 'league-b'],
      includeTeamsWithoutLeague: true,
      countries: ['England', 'Scotland'],
    });
    expect(preferences.load('project-b', 'players')).toEqual({
      ...emptyCombinedEntityFilters(),
      parentIds: ['team-a'],
      positions: ['ATTACKER'],
      positionDetails: ['ST'],
      feet: ['RIGHT'],
    });
    expect(preferences.load('project-c', 'leagues')).toEqual({
      ...emptyCombinedEntityFilters(),
      tiers: [2, 7],
      includeLeaguesWithoutTier: true,
      countries: ['England'],
    });
    expect(preferences.load('project-a', 'players')).toBeUndefined();
  });

  it('removes empty preferences and rejects malformed or unsupported values', () => {
    const preferences = TestBed.inject(CombinedEntityFilterPreferences);
    const key = combinedEntityFilterPreferenceKey('project-a', 'leagues');
    preferences.save('project-a', 'leagues', {
      ...emptyCombinedEntityFilters(),
      countries: ['England'],
    });
    expect(window.localStorage.getItem(key)).not.toBeNull();

    preferences.save('project-a', 'leagues', emptyCombinedEntityFilters());
    expect(window.localStorage.getItem(key)).toBeNull();

    window.localStorage.setItem(key, '{invalid');
    expect(preferences.load('project-a', 'leagues')).toBeUndefined();
    window.localStorage.setItem(key, JSON.stringify({ version: 2, filters: {} }));
    expect(preferences.load('project-a', 'leagues')).toBeUndefined();
  });

  it('sanitizes stored values before exposing them', () => {
    const preferences = TestBed.inject(CombinedEntityFilterPreferences);
    window.localStorage.setItem(
      combinedEntityFilterPreferenceKey('project-a', 'players'),
      JSON.stringify({
        version: 1,
        filters: {
          sourceNames: ['soccerway', 'INVALID'],
          statuses: ['ready', 'INVALID'],
          customBadgeIds: ['badge-a', 42],
          parentIds: ['team-a', 42],
          nationalities: ['Scotland', 'Scotland'],
          positions: ['ATTACKER', 'INVALID'],
          positionDetails: ['ST', 'INVALID'],
          feet: ['RIGHT', 'INVALID'],
          tiers: [1],
          countries: ['Ignored'],
        },
      }),
    );

    expect(preferences.load('project-a', 'players')).toEqual({
      ...emptyCombinedEntityFilters(),
      sourceNames: ['soccerway'],
      statuses: ['ready'],
      customBadgeIds: ['badge-a'],
      parentIds: ['team-a'],
      nationalities: ['Scotland'],
      positions: ['ATTACKER'],
      positionDetails: ['ST'],
      feet: ['RIGHT'],
    });
  });

  it('resets only combined filters for one project and reports unavailable storage', () => {
    const preferences = TestBed.inject(CombinedEntityFilterPreferences);
    window.localStorage.setItem(combinedEntityFilterPreferenceKey('project-a', 'teams'), '{}');
    window.localStorage.setItem(combinedEntityFilterPreferenceKey('project-a', 'players'), '{}');
    window.localStorage.setItem(combinedEntityFilterPreferenceKey('project-b', 'players'), '{}');
    window.localStorage.setItem(entityFilterPreferenceKey('project-a', 'players'), 'source-filter');
    window.localStorage.setItem('unrelated', 'value');

    expect(preferences.resetProject('project-a')).toBe(true);
    expect(
      window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-a', 'teams')),
    ).toBeNull();
    expect(
      window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-a', 'players')),
    ).toBeNull();
    expect(
      window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-b', 'players')),
    ).toBe('{}');
    expect(window.localStorage.getItem(entityFilterPreferenceKey('project-a', 'players'))).toBe(
      'source-filter',
    );
    expect(window.localStorage.getItem('unrelated')).toBe('value');

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    expect(preferences.resetProject('project-c')).toBe(false);
    expect(preferences.save('project-c', 'leagues', emptyCombinedEntityFilters())).toBe(false);
    removeItem.mockRestore();
  });
});
