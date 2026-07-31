import { Service } from '@angular/core';
import {
  isSourceName,
  leagueTiers,
  playerPositionDetails,
  type EntityKind,
  type PlayerFoot,
  type PlayerPosition,
  type PlayerPositionDetail,
} from '../../../../../shared/downloader/contracts';
import {
  normalizeEntityStatus,
  type EntityStatus,
} from '../../../../../shared/downloader/entity-status';
import { emptyEntityFilters, type EntityFilters } from '../entity-filter-form/entity-filter-form';

export interface EntityFilterPreference {
  readonly version: 6;
  readonly filters: EntityFilters;
}

const filterPreferencePrefix = 'qdb-downloader.filters.';
const entityKinds = ['leagues', 'teams', 'players'] as const satisfies readonly EntityKind[];
const playerPositions = new Set<PlayerPosition>([
  'GOALKEEPER',
  'DEFENDER',
  'MIDFIELDER',
  'ATTACKER',
]);
const playerFeet = new Set<PlayerFoot>(['LEFT', 'RIGHT']);
const positionDetails = new Set(playerPositionDetails);

const isPlayerPosition = (value: string): value is PlayerPosition =>
  playerPositions.has(value as PlayerPosition);
const isPlayerPositionDetail = (value: string): value is PlayerPositionDetail =>
  positionDetails.has(value as PlayerPositionDetail);
const isPlayerFoot = (value: string): value is PlayerFoot => playerFeet.has(value as PlayerFoot);
export const entityFilterPreferenceKey = (projectId: string, entity: EntityKind): string =>
  `${filterPreferencePrefix}${encodeURIComponent(projectId)}.${entity}`;

const uniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
};
const uniqueTiers = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (tier): tier is number =>
          typeof tier === 'number' &&
          Number.isInteger(tier) &&
          (leagueTiers as readonly number[]).includes(tier),
      ),
    ),
  ];
};

const hasFilters = (filters: EntityFilters): boolean =>
  filters.sourceNames.length > 0 ||
  filters.statuses.length > 0 ||
  filters.customBadgeIds.length > 0 ||
  filters.parentIds.length > 0 ||
  filters.includeTeamsWithoutLeague ||
  filters.tiers.length > 0 ||
  filters.includeLeaguesWithoutTier ||
  filters.seasons.length > 0 ||
  filters.countries.length > 0 ||
  filters.nationalities.length > 0 ||
  filters.positions.length > 0 ||
  filters.positionDetails.length > 0 ||
  filters.feet.length > 0;

@Service()
export class EntityFilterPreferences {
  load(projectId: string, entity: EntityKind): EntityFilters | undefined {
    try {
      const stored = window.localStorage.getItem(entityFilterPreferenceKey(projectId, entity));
      if (stored === null) return undefined;
      const value: unknown = JSON.parse(stored);
      if (!this.isStoredPreference(value)) return undefined;
      const filters = this.normalize(entity, value.filters);
      return hasFilters(filters) ? filters : undefined;
    } catch {
      return undefined;
    }
  }

  save(projectId: string, entity: EntityKind, filters: EntityFilters): boolean {
    try {
      const normalized = this.normalize(entity, filters);
      const key = entityFilterPreferenceKey(projectId, entity);
      if (!hasFilters(normalized)) window.localStorage.removeItem(key);
      else {
        const preference: EntityFilterPreference = { version: 6, filters: normalized };
        window.localStorage.setItem(key, JSON.stringify(preference));
      }
      return true;
    } catch {
      return false;
    }
  }

  resetProject(projectId: string): boolean {
    try {
      for (const entity of entityKinds) {
        window.localStorage.removeItem(entityFilterPreferenceKey(projectId, entity));
      }
      return true;
    } catch {
      return false;
    }
  }

  private isStoredPreference(
    value: unknown,
  ): value is { version: 1 | 2 | 3 | 4 | 5 | 6; filters: Record<string, unknown> } {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      (candidate['version'] === 1 ||
        candidate['version'] === 2 ||
        candidate['version'] === 3 ||
        candidate['version'] === 4 ||
        candidate['version'] === 5 ||
        candidate['version'] === 6) &&
      typeof candidate['filters'] === 'object' &&
      candidate['filters'] !== null
    );
  }

  private normalize(
    entity: EntityKind,
    value: Record<string, unknown> | EntityFilters,
  ): EntityFilters {
    const filters = emptyEntityFilters();
    filters.sourceNames = uniqueStrings(value.sourceNames).filter(isSourceName);
    filters.statuses = [
      ...new Set(
        uniqueStrings(value.statuses)
          .map(normalizeEntityStatus)
          .filter((status): status is EntityStatus => status !== undefined),
      ),
    ];
    filters.customBadgeIds = uniqueStrings(value.customBadgeIds);
    if (entity === 'leagues') {
      filters.seasons = uniqueStrings(value.seasons);
      filters.countries = uniqueStrings(value.countries);
      filters.tiers = uniqueTiers(value.tiers);
      filters.includeLeaguesWithoutTier = value.includeLeaguesWithoutTier === true;
      return filters;
    }
    if (entity === 'teams') {
      filters.parentIds = uniqueStrings(value.parentIds);
      filters.includeTeamsWithoutLeague = value.includeTeamsWithoutLeague === true;
      filters.countries = uniqueStrings(value.countries);
      filters.seasons = uniqueStrings(value.seasons);
      return filters;
    }
    filters.parentIds = uniqueStrings(value.parentIds);
    filters.nationalities = uniqueStrings(value.nationalities);
    filters.positions = uniqueStrings(value.positions).filter(isPlayerPosition);
    filters.positionDetails = uniqueStrings(value.positionDetails).filter(isPlayerPositionDetail);
    filters.feet = uniqueStrings(value.feet).filter(isPlayerFoot);
    return filters;
  }
}
