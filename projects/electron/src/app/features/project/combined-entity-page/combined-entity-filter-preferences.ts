import { Service } from '@angular/core';
import {
  isSourceName,
  leagueTiers,
  playerPositionDetails,
  type CombinedEntityKind,
  type PlayerFoot,
  type PlayerPosition,
  type PlayerPositionDetail,
} from '../../../../../shared/downloader/contracts';
import {
  combinedEntityStatuses,
  type CombinedEntityStatus,
} from '../../../shared/combined-entity-status-badge/combined-entity-status-badge';
import {
  emptyCombinedEntityFilters,
  type CombinedEntityFilters,
} from '../combined-entity-filter-drawer/combined-entity-filter-drawer';

export interface CombinedEntityFilterPreference {
  readonly version: 1;
  readonly filters: CombinedEntityFilters;
}

const filterPreferencePrefix = 'qdb-downloader.filters.combined.';
const entityKinds = [
  'leagues',
  'teams',
  'players',
] as const satisfies readonly CombinedEntityKind[];
const playerPositions = new Set<PlayerPosition>([
  'GOALKEEPER',
  'DEFENDER',
  'MIDFIELDER',
  'ATTACKER',
]);
const playerFeet = new Set<PlayerFoot>(['LEFT', 'RIGHT']);
const positionDetails = new Set(playerPositionDetails);
const statuses = new Set<CombinedEntityStatus>(combinedEntityStatuses);

const isPlayerPosition = (value: string): value is PlayerPosition =>
  playerPositions.has(value as PlayerPosition);
const isPlayerPositionDetail = (value: string): value is PlayerPositionDetail =>
  positionDetails.has(value as PlayerPositionDetail);
const isPlayerFoot = (value: string): value is PlayerFoot => playerFeet.has(value as PlayerFoot);
const isCombinedEntityStatus = (value: string): value is CombinedEntityStatus =>
  statuses.has(value as CombinedEntityStatus);

export const combinedEntityFilterPreferenceKey = (
  projectId: string,
  entity: CombinedEntityKind,
): string => `${filterPreferencePrefix}${encodeURIComponent(projectId)}.${entity}`;

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

const hasFilters = (filters: CombinedEntityFilters): boolean =>
  filters.sourceNames.length > 0 ||
  filters.statuses.length > 0 ||
  filters.customBadgeIds.length > 0 ||
  filters.parentIds.length > 0 ||
  filters.includeTeamsWithoutLeague ||
  filters.tiers.length > 0 ||
  filters.includeLeaguesWithoutTier ||
  filters.countries.length > 0 ||
  filters.nationalities.length > 0 ||
  filters.positions.length > 0 ||
  filters.positionDetails.length > 0 ||
  filters.feet.length > 0;

@Service()
export class CombinedEntityFilterPreferences {
  load(projectId: string, entity: CombinedEntityKind): CombinedEntityFilters | undefined {
    try {
      const stored = window.localStorage.getItem(
        combinedEntityFilterPreferenceKey(projectId, entity),
      );
      if (stored === null) return undefined;
      const value: unknown = JSON.parse(stored);
      if (!this.isStoredPreference(value)) return undefined;
      const filters = this.normalize(entity, value.filters);
      return hasFilters(filters) ? filters : undefined;
    } catch {
      return undefined;
    }
  }

  save(projectId: string, entity: CombinedEntityKind, filters: CombinedEntityFilters): boolean {
    try {
      const normalized = this.normalize(entity, filters);
      const key = combinedEntityFilterPreferenceKey(projectId, entity);
      if (!hasFilters(normalized)) {
        window.localStorage.removeItem(key);
      } else {
        const preference: CombinedEntityFilterPreference = { version: 1, filters: normalized };
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
        window.localStorage.removeItem(combinedEntityFilterPreferenceKey(projectId, entity));
      }
      return true;
    } catch {
      return false;
    }
  }

  private isStoredPreference(
    value: unknown,
  ): value is { version: 1; filters: Record<string, unknown> } {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate['version'] === 1 &&
      typeof candidate['filters'] === 'object' &&
      candidate['filters'] !== null
    );
  }

  private normalize(
    entity: CombinedEntityKind,
    value: Record<string, unknown> | CombinedEntityFilters,
  ): CombinedEntityFilters {
    const filters = emptyCombinedEntityFilters();
    filters.sourceNames = uniqueStrings(value.sourceNames).filter(isSourceName);
    filters.statuses = uniqueStrings(value.statuses).filter(isCombinedEntityStatus);
    filters.customBadgeIds = uniqueStrings(value.customBadgeIds);
    if (entity === 'leagues') {
      filters.tiers = uniqueTiers(value.tiers);
      filters.includeLeaguesWithoutTier = value.includeLeaguesWithoutTier === true;
      filters.countries = uniqueStrings(value.countries);
      return filters;
    }
    if (entity === 'teams') {
      filters.parentIds = uniqueStrings(value.parentIds);
      filters.includeTeamsWithoutLeague = value.includeTeamsWithoutLeague === true;
      filters.countries = uniqueStrings(value.countries);
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
