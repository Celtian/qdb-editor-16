import { describe, expect, test } from 'vitest';
import {
  cloneExportColumns,
  cloneExportFieldNames,
  defaultExportColumns,
  exportFieldName,
  fullExportColumns,
  sameExportColumns,
  sameExportFieldNames,
  snakeCaseExportFieldNames,
  validateExportColumns,
  validateExportFieldNames,
} from './export-schema.js';

describe('export schema', () => {
  test('creates stable camel case and snake case field names', () => {
    expect(exportFieldName('countryCode2', 'snake_case')).toBe('country_code_2');
    expect(exportFieldName('sourceUrl', 'snake_case')).toBe('source_url');
    expect(exportFieldName('sourceUrl', 'camelCase')).toBe('sourceUrl');

    const snakeCase = snakeCaseExportFieldNames();
    expect(
      snakeCase.leagues.find(({ sourceKey }) => sourceKey === 'countryCode2')?.outputName,
    ).toBe('country_code_2');
  });

  test('creates independent default and full visibility selections', () => {
    const defaults = defaultExportColumns();
    const full = fullExportColumns();

    expect(defaults.leagues).not.toContain('projectId');
    expect(full.leagues).toContain('projectId');
    expect(full.players.length).toBeGreaterThan(defaults.players.length);
  });

  test('deep-clones and compares visibility and field-name configurations separately', () => {
    const columns = defaultExportColumns();
    const columnsClone = cloneExportColumns(columns);
    expect(sameExportColumns(columns, columnsClone)).toBe(true);
    columnsClone.leagues[0] = 'projectId';
    expect(sameExportColumns(columns, columnsClone)).toBe(false);
    expect(columns.leagues[0]).toBe('id');

    const fieldNames = snakeCaseExportFieldNames();
    const fieldNamesClone = cloneExportFieldNames(fieldNames);
    expect(sameExportFieldNames(fieldNames, fieldNamesClone)).toBe(true);
    fieldNamesClone.leagues[0].outputName = 'league_id';
    expect(sameExportFieldNames(fieldNames, fieldNamesClone)).toBe(false);
    expect(fieldNames.leagues[0].outputName).toBe('id');
  });

  test('validates visibility independently from complete field names', () => {
    const columns = defaultExportColumns();
    columns.leagues = [];
    columns.teams.push(columns.teams[0]);
    expect(validateExportColumns(columns)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'leagues', kind: 'empty' }),
        expect.objectContaining({ entity: 'teams', kind: 'duplicate-source' }),
      ]),
    );

    const fieldNames = snakeCaseExportFieldNames();
    fieldNames.teams[0].outputName = 'not valid';
    fieldNames.players[0].outputName = 'sources';
    fieldNames.players[1].outputName = 'PLAYER_ID';
    fieldNames.players[2].outputName = 'player_id';
    fieldNames.leagues.pop();

    expect(validateExportFieldNames(fieldNames)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'leagues', kind: 'source' }),
        expect.objectContaining({ entity: 'teams', kind: 'name' }),
        expect.objectContaining({ entity: 'players', kind: 'reserved' }),
        expect.objectContaining({ entity: 'players', kind: 'duplicate-name' }),
      ]),
    );
  });
});
