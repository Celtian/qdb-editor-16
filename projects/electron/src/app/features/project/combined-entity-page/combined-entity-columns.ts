import type { CombinedEntityKind } from '../../../../../shared/downloader/contracts';
import type { ColumnDefinition, ColumnPreference } from '../entity-column-editor/column-layout';

export type CombinedEntityColumnKey =
  | 'actions'
  | 'badge'
  | 'birthdate'
  | 'contractExpires'
  | 'country'
  | 'created'
  | 'foot'
  | 'height'
  | 'jerseyNumber'
  | 'joined'
  | 'marketValue'
  | 'name'
  | 'parent'
  | 'playerCount'
  | 'position'
  | 'positionDetail'
  | 'sources'
  | 'tier'
  | 'updated';

export interface CombinedEntityColumnDefinition extends ColumnDefinition {
  readonly key: CombinedEntityColumnKey;
}

const defineColumn = (
  key: CombinedEntityColumnKey,
  label: string,
  defaultVisible = true,
): CombinedEntityColumnDefinition => ({
  key,
  label,
  defaultVisible,
  required: key === 'name' || key === 'actions',
});

export const combinedColumnsByEntity: Record<
  CombinedEntityKind,
  readonly CombinedEntityColumnDefinition[]
> = {
  leagues: [
    defineColumn('name', 'Name'),
    defineColumn('badge', 'Badges', false),
    defineColumn('sources', 'Sources'),
    defineColumn('country', 'Country'),
    defineColumn('tier', 'Tier'),
    defineColumn('parent', 'Teams'),
    defineColumn('created', 'Created', false),
    defineColumn('updated', 'Updated', false),
    defineColumn('actions', 'Actions'),
  ],
  teams: [
    defineColumn('name', 'Name'),
    defineColumn('badge', 'Badges', false),
    defineColumn('parent', 'League', false),
    defineColumn('sources', 'Sources'),
    defineColumn('country', 'Country'),
    defineColumn('playerCount', 'Players'),
    defineColumn('created', 'Created', false),
    defineColumn('updated', 'Updated', false),
    defineColumn('actions', 'Actions'),
  ],
  players: [
    defineColumn('name', 'Name'),
    defineColumn('badge', 'Badges', false),
    defineColumn('parent', 'Team', false),
    defineColumn('sources', 'Sources'),
    defineColumn('country', 'Country'),
    defineColumn('jerseyNumber', 'Number'),
    defineColumn('position', 'Position'),
    defineColumn('positionDetail', 'Position detail'),
    defineColumn('birthdate', 'Birth date'),
    defineColumn('height', 'Height'),
    defineColumn('foot', 'Foot'),
    defineColumn('joined', 'Joined'),
    defineColumn('contractExpires', 'Contract until'),
    defineColumn('marketValue', 'Market value'),
    defineColumn('created', 'Created', false),
    defineColumn('updated', 'Updated', false),
    defineColumn('actions', 'Actions'),
  ],
};

export function defaultCombinedColumnPreference(entity: CombinedEntityKind): ColumnPreference {
  const definitions = combinedColumnsByEntity[entity];
  return {
    version: 1,
    order: definitions.map(({ key }) => key),
    visible: definitions
      .filter(({ defaultVisible, required }) => defaultVisible || required)
      .map(({ key }) => key),
  };
}

export function visibleCombinedColumnsFromPreference(
  entity: CombinedEntityKind,
  preference: ColumnPreference,
): CombinedEntityColumnKey[] {
  const valid = new Set(combinedColumnsByEntity[entity].map(({ key }) => key));
  const visible = new Set(preference.visible);
  return preference.order.filter(
    (key): key is CombinedEntityColumnKey =>
      valid.has(key as CombinedEntityColumnKey) && visible.has(key),
  );
}
