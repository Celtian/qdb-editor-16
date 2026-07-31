import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExportColumnSelection,
  ExportFormat,
  ExportFieldNameConfiguration,
  ExportRequest,
  ExportResult,
  CombinedSourceRef,
  CombinedPlayer,
  Player,
  Project,
} from '../../shared/downloader/contracts.js';
import {
  exportColumnDefinitions,
  validateExportColumns,
  validateExportFieldNames,
} from '../../shared/downloader/export-schema.js';
import { toCsv, toJson } from '../../shared/downloader/export-format.js';
import { slugifySnapshotName } from '../../shared/downloader/reference-date.js';
import type { SnapshotDatabase } from './database.js';
import { ApplicationError } from './errors.js';

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');
const exportFormats = new Set<ExportFormat>(['json', 'single-json', 'csv']);

const pickColumns = (
  row: object,
  columns: readonly string[],
  fieldNames: ReadonlyMap<string, string>,
): Record<string, unknown> => {
  const selected: Record<string, unknown> = {};
  const values = row as Record<string, unknown>;
  for (const sourceKey of columns) {
    const outputName = fieldNames.get(sourceKey);
    if (outputName) selected[outputName] = values[sourceKey];
  }
  return selected;
};

const withCombinedSources = (
  row: object,
  selected: Record<string, unknown>,
  format: ExportFormat,
): Record<string, unknown> => {
  const sources = (row as { sources?: CombinedSourceRef[] }).sources ?? [];
  return format === 'csv'
    ? {
        ...selected,
        sourceNames: sources.map(({ sourceName }) => sourceName).join(';'),
        sourceIds: sources.map(({ sourceId }) => sourceId).join(';'),
      }
    : { ...selected, sources };
};

const validateConfiguration = (
  columns: ExportColumnSelection,
  fieldNames: ExportFieldNameConfiguration,
): void => {
  const errors = [...validateExportColumns(columns), ...validateExportFieldNames(fieldNames)];
  if (errors.length > 0) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: errors[0].message,
    });
  }
};

export class SnapshotExportWriter {
  constructor(private readonly database: SnapshotDatabase) {}

  async write(project: Project, request: ExportRequest): Promise<ExportResult> {
    validateConfiguration(request.columns, request.fieldNames);
    const selectedColumns = {
      leagues: exportColumnDefinitions.leagues
        .filter(({ key }) => request.columns.leagues.includes(key))
        .map(({ key }) => key),
      teams: exportColumnDefinitions.teams
        .filter(({ key }) => request.columns.teams.includes(key))
        .map(({ key }) => key),
      players: exportColumnDefinitions.players
        .filter(({ key }) => request.columns.players.includes(key))
        .map(({ key }) => key),
    };
    const fieldNames = {
      leagues: new Map(
        request.fieldNames.leagues.map(({ sourceKey, outputName }) => [sourceKey, outputName]),
      ),
      teams: new Map(
        request.fieldNames.teams.map(({ sourceKey, outputName }) => [sourceKey, outputName]),
      ),
      players: new Map(
        request.fieldNames.players.map(({ sourceKey, outputName }) => [sourceKey, outputName]),
      ),
    };
    const { destination, format } = request;
    if (!exportFormats.has(format)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid export format.',
      });
    }
    if (!destination.trim()) {
      throw new ApplicationError({ code: 'INVALID_INPUT', message: 'Choose an export folder.' });
    }
    const baseName = `${slugifySnapshotName(project.name)}_${project.referenceDate}_${timestamp()}`;
    let directory = join(destination, baseName);
    let suffix = 1;
    while (existsSync(directory)) directory = join(destination, `${baseName}_${suffix++}`);
    try {
      mkdirSync(destination, { recursive: true });
      mkdirSync(directory, { recursive: false });
      const combined = request.dataset === 'combined';
      const rows = combined
        ? this.database.exportCombinedRows(project.id)
        : this.database.exportRows(project.id);
      const leagueIds = new Set(request.leagueIds);
      const leagues = rows.leagues.filter(({ id }) => leagueIds.has(id));
      const teams = rows.teams.filter(({ leagueId }) =>
        leagueId ? leagueIds.has(leagueId) : request.includeTeamsWithoutLeague,
      );
      const teamIds = new Set(teams.map(({ id }) => id));
      const players = rows.players.filter(({ teamId }) => teamIds.has(teamId));
      if (format === 'single-json') {
        const playersByTeam = new Map<string, (Player | CombinedPlayer)[]>();
        for (const player of players) {
          const teamPlayers = playersByTeam.get(player.teamId) ?? [];
          teamPlayers.push(player);
          playersByTeam.set(player.teamId, teamPlayers);
        }
        const snapshot = {
          project: {
            name: project.name,
            referenceDate: project.referenceDate,
          },
          leagues: leagues.map((row) => {
            const selected = pickColumns(row, selectedColumns.leagues, fieldNames.leagues);
            return combined ? withCombinedSources(row, selected, format) : selected;
          }),
          teams: teams.map((row) => ({
            ...(combined
              ? withCombinedSources(
                  row,
                  pickColumns(row, selectedColumns.teams, fieldNames.teams),
                  format,
                )
              : pickColumns(row, selectedColumns.teams, fieldNames.teams)),
            players: (playersByTeam.get(row.id) ?? []).map((player) =>
              combined
                ? withCombinedSources(
                    player,
                    pickColumns(player, selectedColumns.players, fieldNames.players),
                    format,
                  )
                : pickColumns(player, selectedColumns.players, fieldNames.players),
            ),
          })),
        };
        const path = join(directory, 'snapshot.json');
        await writeFile(path, toJson(snapshot), 'utf8');
        return { directory, files: [path] };
      }
      const selectedRows = {
        leagues: leagues.map((row) => {
          const selected = pickColumns(row, selectedColumns.leagues, fieldNames.leagues);
          return combined ? withCombinedSources(row, selected, format) : selected;
        }),
        teams: teams.map((row) => {
          const selected = pickColumns(row, selectedColumns.teams, fieldNames.teams);
          return combined ? withCombinedSources(row, selected, format) : selected;
        }),
        players: players.map((row) => {
          const selected = pickColumns(row, selectedColumns.players, fieldNames.players);
          return combined ? withCombinedSources(row, selected, format) : selected;
        }),
      };
      const entries = Object.entries(selectedRows) as [
        keyof typeof selectedRows,
        Record<string, unknown>[],
      ][];
      const files: string[] = [];
      for (const [name, values] of entries) {
        const path = join(directory, `${name}.${format}`);
        const entityFieldNames = fieldNames[name] as ReadonlyMap<string, string>;
        const columns = [
          ...(selectedColumns[name] as readonly string[]).map(
            (sourceKey) => entityFieldNames.get(sourceKey) ?? sourceKey,
          ),
          ...(combined && format === 'csv' ? ['sourceNames', 'sourceIds'] : []),
        ];
        const content = format === 'json' ? toJson(values) : toCsv(values, columns);
        await writeFile(path, content, 'utf8');
        files.push(path);
      }
      return { directory, files };
    } catch (error) {
      throw new ApplicationError(
        { code: 'EXPORT', message: 'The project could not be exported.', details: String(error) },
        { cause: error },
      );
    }
  }
}
