import type { EntityKind } from '../../../../../shared/downloader/contracts';

export type EntityColumnKey =
  | 'actions'
  | 'badge'
  | 'birthdate'
  | 'contractExpires'
  | 'countryName'
  | 'createdAt'
  | 'sourceId'
  | 'foot'
  | 'height'
  | 'weight'
  | 'jerseyNumber'
  | 'joined'
  | 'leagueCountry'
  | 'leagueName'
  | 'marketValue'
  | 'name'
  | 'playerCount'
  | 'position'
  | 'positionDetail'
  | 'season'
  | 'sourceName'
  | 'sourceUrl'
  | 'teamCountry'
  | 'teamCount'
  | 'teamName'
  | 'tier'
  | 'updatedAt';

export interface EntityColumnDefinition {
  key: EntityColumnKey;
  label: string;
  defaultVisible: boolean;
  required: boolean;
}

export interface EntityColumnPreference {
  readonly version: 2;
  readonly order: readonly EntityColumnKey[];
  readonly visible: readonly EntityColumnKey[];
}

export type EntityColumnVisibility = Record<EntityColumnKey, boolean>;

export const entityColumnLabels: Record<EntityColumnKey, string> = {
  actions: 'Actions',
  badge: 'Badge',
  birthdate: 'Birth date',
  contractExpires: 'Contract until',
  countryName: 'Nationality',
  createdAt: 'Created',
  sourceId: 'Source ID',
  foot: 'Foot',
  height: 'Height',
  weight: 'Weight',
  jerseyNumber: 'Number',
  joined: 'Joined',
  leagueCountry: 'Country',
  leagueName: 'League',
  marketValue: 'Market value',
  name: 'Name',
  playerCount: 'Players',
  position: 'Position',
  positionDetail: 'Position detail',
  season: 'Season',
  sourceName: 'Source',
  sourceUrl: 'Source page',
  teamCountry: 'Country',
  teamCount: 'Teams',
  teamName: 'Team',
  tier: 'Tier',
  updatedAt: 'Updated',
};

const defineColumn = (key: EntityColumnKey, defaultVisible = true): EntityColumnDefinition => ({
  key,
  label: entityColumnLabels[key],
  defaultVisible,
  required: key === 'name' || key === 'actions',
});

export const columnsByEntity: Record<EntityKind, readonly EntityColumnDefinition[]> = {
  leagues: [
    defineColumn('name'),
    defineColumn('badge', false),
    defineColumn('sourceName'),
    defineColumn('leagueCountry'),
    defineColumn('tier'),
    defineColumn('sourceId', false),
    defineColumn('season', false),
    defineColumn('teamCount'),
    defineColumn('sourceUrl'),
    defineColumn('createdAt', false),
    defineColumn('updatedAt', false),
    defineColumn('actions'),
  ],
  teams: [
    defineColumn('name'),
    defineColumn('badge', false),
    defineColumn('leagueName', false),
    defineColumn('sourceName'),
    defineColumn('teamCountry'),
    defineColumn('sourceId', false),
    defineColumn('season', false),
    defineColumn('playerCount'),
    defineColumn('sourceUrl'),
    defineColumn('createdAt', false),
    defineColumn('updatedAt', false),
    defineColumn('actions'),
  ],
  players: [
    defineColumn('name'),
    defineColumn('badge', false),
    defineColumn('teamName', false),
    defineColumn('leagueName', false),
    defineColumn('sourceName'),
    defineColumn('sourceId', false),
    defineColumn('countryName'),
    defineColumn('jerseyNumber'),
    defineColumn('position'),
    defineColumn('positionDetail'),
    defineColumn('birthdate'),
    defineColumn('height'),
    defineColumn('weight', false),
    defineColumn('foot'),
    defineColumn('joined'),
    defineColumn('contractExpires'),
    defineColumn('marketValue'),
    defineColumn('sourceUrl'),
    defineColumn('createdAt', false),
    defineColumn('updatedAt', false),
    defineColumn('actions'),
  ],
};

const allColumnKeys = Object.keys(entityColumnLabels) as EntityColumnKey[];

export function defaultVisibleColumns(entity: EntityKind): EntityColumnKey[] {
  return columnsByEntity[entity]
    .filter((column) => column.required || column.defaultVisible)
    .map((column) => column.key);
}

export function defaultColumnPreference(entity: EntityKind): EntityColumnPreference {
  return {
    version: 2,
    order: columnsByEntity[entity].map((column) => column.key),
    visible: defaultVisibleColumns(entity),
  };
}

export function visibleColumnsFromPreference(
  preference: EntityColumnPreference,
): EntityColumnKey[] {
  const visible = new Set(preference.visible);
  return preference.order.filter((column) => visible.has(column));
}

export function toColumnVisibility(
  visibleColumns: readonly EntityColumnKey[],
): EntityColumnVisibility {
  const visible = new Set(visibleColumns);
  return Object.fromEntries(
    allColumnKeys.map((key) => [key, visible.has(key)]),
  ) as EntityColumnVisibility;
}

export function fromColumnVisibility(
  definitions: readonly EntityColumnDefinition[],
  visibility: EntityColumnVisibility,
): EntityColumnKey[] {
  return definitions
    .filter((column) => column.required || visibility[column.key])
    .map((column) => column.key);
}
