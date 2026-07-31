import type {
  EntityKind,
  ExportColumnSelection,
  ExportFieldNameConfiguration,
  ExportColumnMapping,
  ExportFieldNameStyle,
  League,
  Player,
  Team,
} from './contracts.js';

export interface ExportColumnDefinition<Key extends string = string> {
  key: Key;
  label: string;
}

interface ExportModels {
  leagues: League;
  teams: Team;
  players: Player;
}

type ExportColumnDefinitions = {
  [Entity in EntityKind]: readonly ExportColumnDefinition<keyof ExportModels[Entity] & string>[];
};

export const exportColumnDefinitions = {
  leagues: [
    { key: 'id', label: 'ID' },
    { key: 'projectId', label: 'Project ID' },
    { key: 'sourceName', label: 'Source' },
    { key: 'sourceId', label: 'Source ID' },
    { key: 'name', label: 'Name' },
    { key: 'countryName', label: 'Country name' },
    { key: 'countryCode2', label: 'Country code (2)' },
    { key: 'countryCode3', label: 'Country code (3)' },
    { key: 'season', label: 'Season' },
    { key: 'sourceUrl', label: 'Source page' },
    { key: 'teamCount', label: 'Team count' },
    { key: 'createdAt', label: 'Created at' },
    { key: 'updatedAt', label: 'Updated at' },
  ],
  teams: [
    { key: 'id', label: 'ID' },
    { key: 'projectId', label: 'Project ID' },
    { key: 'leagueId', label: 'League ID' },
    { key: 'sourceName', label: 'Source' },
    { key: 'sourceId', label: 'Source ID' },
    { key: 'name', label: 'Name' },
    { key: 'countryName', label: 'Country name' },
    { key: 'countryCode2', label: 'Country code (2)' },
    { key: 'countryCode3', label: 'Country code (3)' },
    { key: 'season', label: 'Season' },
    { key: 'sourceUrl', label: 'Source page' },
    { key: 'playerCount', label: 'Player count' },
    { key: 'createdAt', label: 'Created at' },
    { key: 'updatedAt', label: 'Updated at' },
  ],
  players: [
    { key: 'id', label: 'ID' },
    { key: 'projectId', label: 'Project ID' },
    { key: 'teamId', label: 'Team ID' },
    { key: 'sourceName', label: 'Source' },
    { key: 'sourceId', label: 'Source ID' },
    { key: 'name', label: 'Name' },
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'jerseyNumber', label: 'Jersey number' },
    { key: 'position', label: 'Position' },
    { key: 'positionDetail', label: 'Position detail' },
    { key: 'birthdate', label: 'Birthdate' },
    { key: 'height', label: 'Height' },
    { key: 'weight', label: 'Weight' },
    { key: 'foot', label: 'Foot' },
    { key: 'joined', label: 'Joined' },
    { key: 'contractExpires', label: 'Contract expires' },
    { key: 'marketValue', label: 'Market value' },
    { key: 'countryName', label: 'Country name' },
    { key: 'countryCode2', label: 'Country code (2)' },
    { key: 'countryCode3', label: 'Country code (3)' },
    { key: 'minutesPlayed', label: 'Minutes played' },
    { key: 'sourceUrl', label: 'Source page' },
    { key: 'createdAt', label: 'Created at' },
    { key: 'updatedAt', label: 'Updated at' },
  ],
} as const satisfies ExportColumnDefinitions;

const defaultExcludedColumns = {
  leagues: new Set<string>(['projectId', 'sourceUrl', 'teamCount', 'createdAt', 'updatedAt']),
  teams: new Set<string>(['projectId', 'sourceUrl', 'playerCount', 'createdAt', 'updatedAt']),
  players: new Set<string>(['projectId', 'sourceUrl', 'createdAt', 'updatedAt']),
} satisfies Record<EntityKind, ReadonlySet<string>>;

export const exportEntityKinds = [
  'leagues',
  'teams',
  'players',
] as const satisfies readonly EntityKind[];
export const exportFieldNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const reservedExportFieldNames = ['players', 'sources', 'sourceNames', 'sourceIds'] as const;

const reservedExportFieldNameSet = new Set(
  reservedExportFieldNames.map((name) => name.toLocaleLowerCase()),
);

export interface ExportColumnValidationError {
  entity: EntityKind;
  sourceKey?: string;
  kind: 'empty' | 'source' | 'duplicate-source' | 'style' | 'name' | 'reserved' | 'duplicate-name';
  message: string;
}

export const exportFieldName = (sourceKey: string, style: ExportFieldNameStyle): string => {
  if (style === 'camelCase') return sourceKey;
  return sourceKey
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Za-z])(\d+)/g, '$1_$2')
    .replace(/(\d+)([A-Za-z])/g, '$1_$2')
    .toLocaleLowerCase();
};

const selectedKeys = <Entity extends EntityKind>(
  entity: Entity,
  include: (key: string) => boolean,
): ExportColumnSelection[Entity] =>
  exportColumnDefinitions[entity]
    .filter(({ key }) => include(key))
    .map(({ key }) => key) as ExportColumnSelection[Entity];

export const defaultExportColumns = (): ExportColumnSelection => ({
  leagues: selectedKeys('leagues', (key) => !defaultExcludedColumns.leagues.has(key)),
  teams: selectedKeys('teams', (key) => !defaultExcludedColumns.teams.has(key)),
  players: selectedKeys('players', (key) => !defaultExcludedColumns.players.has(key)),
});

export const fullExportColumns = (): ExportColumnSelection => ({
  leagues: selectedKeys('leagues', () => true),
  teams: selectedKeys('teams', () => true),
  players: selectedKeys('players', () => true),
});

export const cloneExportColumns = (columns: ExportColumnSelection): ExportColumnSelection => ({
  leagues: [...columns.leagues],
  teams: [...columns.teams],
  players: [...columns.players],
});

export const sameExportColumns = (
  first: ExportColumnSelection,
  second: ExportColumnSelection,
): boolean =>
  exportEntityKinds.every((entity) => {
    const firstColumns = first[entity] as readonly string[];
    const secondColumns = second[entity] as readonly string[];
    return (
      firstColumns.length === secondColumns.length &&
      firstColumns.every((sourceKey, index) => sourceKey === secondColumns[index])
    );
  });

export const validateExportColumns = (
  columns: ExportColumnSelection,
): readonly ExportColumnValidationError[] => {
  const errors: ExportColumnValidationError[] = [];
  for (const entity of exportEntityKinds) {
    const selected = columns[entity] as readonly string[];
    if (selected.length === 0) {
      errors.push({
        entity,
        kind: 'empty',
        message: `Choose at least one ${entity} field.`,
      });
      continue;
    }
    const allowed = new Set<string>(exportColumnDefinitions[entity].map(({ key }) => key));
    const sourceKeys = new Set<string>();
    for (const sourceKey of selected) {
      if (!allowed.has(sourceKey)) {
        errors.push({
          entity,
          sourceKey,
          kind: 'source',
          message: 'Choose a valid source field.',
        });
      } else if (sourceKeys.has(sourceKey)) {
        errors.push({
          entity,
          sourceKey,
          kind: 'duplicate-source',
          message: 'Each source field can be selected only once.',
        });
      }
      sourceKeys.add(sourceKey);
    }
  }
  return errors;
};

const allFieldNames = <Entity extends EntityKind>(
  entity: Entity,
  nameStyle: ExportFieldNameStyle,
): ExportFieldNameConfiguration[Entity] =>
  exportColumnDefinitions[entity].map(({ key }) => ({
    sourceKey: key,
    outputName: exportFieldName(key, nameStyle),
  })) as ExportFieldNameConfiguration[Entity];

export const createExportFieldNames = (
  nameStyle: ExportFieldNameStyle,
): ExportFieldNameConfiguration => ({
  nameStyle,
  leagues: allFieldNames('leagues', nameStyle),
  teams: allFieldNames('teams', nameStyle),
  players: allFieldNames('players', nameStyle),
});

export const camelCaseExportFieldNames = (): ExportFieldNameConfiguration =>
  createExportFieldNames('camelCase');

export const snakeCaseExportFieldNames = (): ExportFieldNameConfiguration =>
  createExportFieldNames('snake_case');

export const cloneExportFieldNames = (
  fieldNames: ExportFieldNameConfiguration,
): ExportFieldNameConfiguration => ({
  nameStyle: fieldNames.nameStyle,
  leagues: fieldNames.leagues.map(({ sourceKey, outputName }) => ({ sourceKey, outputName })),
  teams: fieldNames.teams.map(({ sourceKey, outputName }) => ({ sourceKey, outputName })),
  players: fieldNames.players.map(({ sourceKey, outputName }) => ({ sourceKey, outputName })),
});

export const sameExportFieldNames = (
  first: ExportFieldNameConfiguration,
  second: ExportFieldNameConfiguration,
): boolean =>
  first.nameStyle === second.nameStyle &&
  exportEntityKinds.every((entity) => {
    const firstNames = first[entity] as readonly ExportColumnMapping[];
    const secondNames = second[entity] as readonly ExportColumnMapping[];
    return (
      firstNames.length === secondNames.length &&
      firstNames.every(
        (mapping, index) =>
          mapping.sourceKey === secondNames[index]?.sourceKey &&
          mapping.outputName === secondNames[index]?.outputName,
      )
    );
  });

export const validateExportFieldNames = (
  fieldNames: ExportFieldNameConfiguration,
): readonly ExportColumnValidationError[] => {
  const errors: ExportColumnValidationError[] = [];
  const nameStyle: unknown = fieldNames.nameStyle;
  if (nameStyle !== 'camelCase' && nameStyle !== 'snake_case') {
    errors.push({
      entity: 'leagues',
      kind: 'style',
      message: 'Choose a valid fallback field-name style.',
    });
  }
  for (const entity of exportEntityKinds) {
    const mappings = fieldNames[entity] as readonly ExportColumnMapping[];
    const definitions = exportColumnDefinitions[entity];
    const allowed = new Set<string>(definitions.map(({ key }) => key));
    const sourceKeyCounts = new Map<string, number>();
    const outputNameCounts = new Map<string, number>();
    for (const { sourceKey, outputName } of mappings) {
      sourceKeyCounts.set(sourceKey, (sourceKeyCounts.get(sourceKey) ?? 0) + 1);
      const normalizedName = outputName.toLocaleLowerCase();
      outputNameCounts.set(normalizedName, (outputNameCounts.get(normalizedName) ?? 0) + 1);
    }
    for (const { key } of definitions) {
      if (!sourceKeyCounts.has(key)) {
        errors.push({
          entity,
          sourceKey: key,
          kind: 'source',
          message: 'Every exportable field must have an exported name.',
        });
      }
    }
    for (const column of mappings) {
      if (!allowed.has(column.sourceKey)) {
        errors.push({
          entity,
          sourceKey: column.sourceKey,
          kind: 'source',
          message: 'Choose a valid source field.',
        });
      } else if ((sourceKeyCounts.get(column.sourceKey) ?? 0) > 1) {
        errors.push({
          entity,
          sourceKey: column.sourceKey,
          kind: 'duplicate-source',
          message: 'Each source field can have only one exported name.',
        });
      }

      const normalizedName = column.outputName.toLocaleLowerCase();
      if (!exportFieldNamePattern.test(column.outputName)) {
        errors.push({
          entity,
          sourceKey: column.sourceKey,
          kind: 'name',
          message: 'Use letters, numbers, and underscores, starting with a letter or underscore.',
        });
      } else if (reservedExportFieldNameSet.has(normalizedName)) {
        errors.push({
          entity,
          sourceKey: column.sourceKey,
          kind: 'reserved',
          message: `${column.outputName} is reserved by the export format.`,
        });
      } else if ((outputNameCounts.get(normalizedName) ?? 0) > 1) {
        errors.push({
          entity,
          sourceKey: column.sourceKey,
          kind: 'duplicate-name',
          message: 'Exported field names must be unique.',
        });
      }
    }
  }
  return errors;
};
