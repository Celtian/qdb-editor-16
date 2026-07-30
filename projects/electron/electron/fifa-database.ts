import { existsSync } from 'node:fs';
import { Datatype, type Field } from 'fifatables';
import type {
  FieldDescriptor,
  ObjectDeleteRequest,
  ObjectDeleteResult,
  ObjectDetail,
  ObjectListPage,
  ObjectListRequest,
  ObjectReadRequest,
  SaveRowRequest,
  SaveRowResult,
  SaveObjectRequest,
  SaveObjectResult,
  TableDescriptor,
  TablePage,
  TablePageRequest,
  TableRow,
  TableRowValues,
  TableValue,
  ValidationIssue,
  ValidationReport,
} from '../shared/contracts';
import {
  defaultValueFor,
  fieldDescriptor,
  FIFA_TABLES,
  fieldsFor,
  tableForName,
} from '../shared/table-config';
import { closeDatabase, DatabaseSync, type SQLInputValue } from './runtime-sqlite';
import { FifaObjects } from './fifa-objects';
import { validateRows } from './validation';

export const FIFA_DATABASE_SCHEMA_VERSION = 1;

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;
const sqliteType = (field: Field): string =>
  field.type === Datatype.Int ? 'INTEGER' : field.type === Datatype.Float ? 'REAL' : 'TEXT';

type SqlRow = Record<string, SQLInputValue>;

const valuesFromSql = (row: SqlRow, fields: readonly Field[]): TableRowValues =>
  Object.fromEntries(
    fields.map((field) => {
      const value = row[field.name];
      return [
        field.name,
        typeof value === 'bigint'
          ? Number(value)
          : typeof value === 'string' || typeof value === 'number'
            ? value
            : '',
      ];
    }),
  );

const normalizeForStorage = (field: Field, value: TableValue | undefined): TableValue => {
  if (value === undefined) return defaultValueFor(field);
  if (field.type === Datatype.String) return String(value);
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  if (normalized === '') return '';
  const number = typeof normalized === 'number' ? normalized : Number(normalized);
  if (!Number.isFinite(number)) return String(value);
  return number;
};

const relationshipDefinitions: readonly {
  table: string;
  field: string;
  targetTable: string;
  targetField: string;
}[] = [
  { table: 'formations', field: 'teamid', targetTable: 'teams', targetField: 'teamid' },
  {
    table: 'leaguerefereelinks',
    field: 'leagueid',
    targetTable: 'leagues',
    targetField: 'leagueid',
  },
  {
    table: 'leaguerefereelinks',
    field: 'refereeid',
    targetTable: 'referee',
    targetField: 'refereeid',
  },
  {
    table: 'leagueteamlinks',
    field: 'leagueid',
    targetTable: 'leagues',
    targetField: 'leagueid',
  },
  {
    table: 'leagueteamlinks',
    field: 'teamid',
    targetTable: 'teams',
    targetField: 'teamid',
  },
  { table: 'manager', field: 'teamid', targetTable: 'teams', targetField: 'teamid' },
  {
    table: 'player_grudgelove',
    field: 'playerid',
    targetTable: 'players',
    targetField: 'playerid',
  },
  {
    table: 'playerloans',
    field: 'playerid',
    targetTable: 'players',
    targetField: 'playerid',
  },
  {
    table: 'previousteam',
    field: 'playerid',
    targetTable: 'players',
    targetField: 'playerid',
  },
  { table: 'rivals', field: 'teamid1', targetTable: 'teams', targetField: 'teamid' },
  { table: 'rivals', field: 'teamid2', targetTable: 'teams', targetField: 'teamid' },
  {
    table: 'rowteamnationlinks',
    field: 'nationid',
    targetTable: 'nations',
    targetField: 'nationid',
  },
  {
    table: 'rowteamnationlinks',
    field: 'teamid',
    targetTable: 'teams',
    targetField: 'teamid',
  },
  {
    table: 'teamnationlinks',
    field: 'nationid',
    targetTable: 'nations',
    targetField: 'nationid',
  },
  {
    table: 'teamnationlinks',
    field: 'teamid',
    targetTable: 'teams',
    targetField: 'teamid',
  },
  {
    table: 'teamplayerlinks',
    field: 'playerid',
    targetTable: 'players',
    targetField: 'playerid',
  },
  {
    table: 'teamplayerlinks',
    field: 'teamid',
    targetTable: 'teams',
    targetField: 'teamid',
  },
  {
    table: 'teamstadiumlinks',
    field: 'stadiumid',
    targetTable: 'stadiums',
    targetField: 'stadiumid',
  },
  {
    table: 'teamstadiumlinks',
    field: 'teamid',
    targetTable: 'teams',
    targetField: 'teamid',
  },
];

export class FifaDatabase {
  private readonly database: DatabaseSync;
  private readonly objects: FifaObjects;

  static create(path: string, metadata: Record<string, string>): FifaDatabase {
    if (existsSync(path)) throw new Error('The database file already exists.');
    const fifaDatabase = new FifaDatabase(path, false);
    fifaDatabase.initialize(metadata);
    return fifaDatabase;
  }

  constructor(path: string, readOnly = false) {
    this.database = new DatabaseSync(path, { readOnly });
    this.objects = new FifaObjects(this.database);
    this.database.exec('PRAGMA foreign_keys = ON');
    if (!readOnly) this.database.exec('PRAGMA journal_mode = WAL');
  }

  close(): void {
    closeDatabase(this.database);
  }

  metadata(): Record<string, string> {
    return Object.fromEntries(
      (
        this.database.prepare('SELECT key, value FROM _metadata ORDER BY key').all() as {
          key: string;
          value: string;
        }[]
      ).map(({ key, value }) => [key, value]),
    );
  }

  setMetadata(key: string, value: string): void {
    this.database
      .prepare(
        'INSERT INTO _metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  insertRows(tableName: string, rows: readonly TableRowValues[]): void {
    const table = tableForName(tableName);
    const fields = fieldsFor(table);
    const columns = fields.map((field) => quote(field.name));
    const insert = this.database.prepare(
      `INSERT INTO ${quote(table)} (__row_order, ${columns.join(', ')}) VALUES (${[
        '?',
        ...fields.map(() => '?'),
      ].join(', ')})`,
    );
    this.database.exec('BEGIN IMMEDIATE');
    try {
      rows.forEach((row, index) => {
        insert.run(index, ...fields.map((field) => normalizeForStorage(field, row[field.name])));
      });
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listTables(): TableDescriptor[] {
    const counts = new Map(
      (
        this.database
          .prepare(
            'SELECT table_name, severity, sum(occurrences) AS count FROM _validation_issues GROUP BY table_name, severity',
          )
          .all() as { table_name: string; severity: string; count: number }[]
      ).map((row) => [`${row.table_name}:${row.severity}`, Number(row.count)]),
    );
    return FIFA_TABLES.map((table) => ({
      name: table,
      fields: fieldsFor(table).map(fieldDescriptor),
      rowCount: Number(
        this.database.prepare(`SELECT count(*) AS count FROM ${quote(table)}`).get()?.['count'] ??
          0,
      ),
      errorCount: counts.get(`${table}:error`) ?? 0,
      warningCount: counts.get(`${table}:warning`) ?? 0,
    }));
  }

  readTable(request: TablePageRequest): TablePage {
    const table = tableForName(request.table);
    const fields = fieldsFor(table);
    const pageSize = Number.isFinite(request.pageSize)
      ? Math.min(100, Math.max(1, Math.trunc(request.pageSize)))
      : 25;
    const pageIndex = Number.isFinite(request.pageIndex)
      ? Math.max(0, Math.trunc(request.pageIndex))
      : 0;
    const query = typeof request.query === 'string' ? request.query.trim() : '';
    const where = query
      ? `WHERE ${fields.map((field) => `CAST(${quote(field.name)} AS TEXT) LIKE ?`).join(' OR ')}`
      : '';
    const queryValues = query ? fields.map(() => `%${query}%`) : [];
    const sortField = request.sortField
      ? fields.find((field) => field.name === request.sortField)?.name
      : undefined;
    const order = sortField
      ? `${quote(sortField)} ${request.sortDirection === 'desc' ? 'DESC' : 'ASC'}, __row_order ASC`
      : '__row_order ASC';
    const total = Number(
      this.database
        .prepare(`SELECT count(*) AS count FROM ${quote(table)} ${where}`)
        .get(...queryValues)?.['count'] ?? 0,
    );
    const rows = this.database
      .prepare(`SELECT * FROM ${quote(table)} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...queryValues, pageSize, pageIndex * pageSize) as SqlRow[];
    return {
      table,
      fields: fields.map(fieldDescriptor),
      rows: rows.map((row) => this.toTableRow(row, fields)),
      total,
    };
  }

  readAllRows(tableName: string): TableRow[] {
    const table = tableForName(tableName);
    const fields = fieldsFor(table);
    return (
      this.database
        .prepare(`SELECT * FROM ${quote(table)} ORDER BY __row_order ASC`)
        .all() as SqlRow[]
    ).map((row) => this.toTableRow(row, fields));
  }

  readRow(tableName: string, rowId: number): TableRow {
    const table = tableForName(tableName);
    const fields = fieldsFor(table);
    const row = this.database
      .prepare(`SELECT * FROM ${quote(table)} WHERE __row_id = ?`)
      .get(rowId) as SqlRow | undefined;
    if (!row) throw new Error('The row was not found.');
    return this.toTableRow(row, fields);
  }

  saveRow(request: SaveRowRequest): SaveRowResult {
    const table = tableForName(request.table);
    const fields = fieldsFor(table);
    const normalized = Object.fromEntries(
      fields.map((field) => [field.name, normalizeForStorage(field, request.values[field.name])]),
    );
    const candidateId = request.rowId ?? -1;
    const existingRows = this.readAllRows(table)
      .filter((row) => row.rowId !== request.rowId)
      .map((row) => ({ rowId: row.rowId, values: row.values }));
    const issues = validateRows(
      table,
      [...existingRows, { rowId: candidateId, values: normalized }],
      fields,
    ).filter((issue) => issue.samples.some((sample) => sample.rowId === candidateId));
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '));
    if (warnings.length && !request.acceptWarnings)
      return {
        row: {
          rowId: candidateId,
          rowOrder: -1,
          values: normalized,
        },
        warnings,
      };

    this.database.exec('BEGIN IMMEDIATE');
    try {
      let rowId = request.rowId;
      if (rowId === undefined) {
        const rowOrder = Number(
          this.database
            .prepare(`SELECT coalesce(max(__row_order), -1) + 1 AS value FROM ${quote(table)}`)
            .get()?.['value'] ?? 0,
        );
        const result = this.database
          .prepare(
            `INSERT INTO ${quote(table)} (__row_order, ${fields
              .map((field) => quote(field.name))
              .join(', ')}) VALUES (${['?', ...fields.map(() => '?')].join(', ')})`,
          )
          .run(rowOrder, ...fields.map((field) => normalized[field.name] as SQLInputValue));
        rowId = Number(result.lastInsertRowid);
      } else {
        const result = this.database
          .prepare(
            `UPDATE ${quote(table)} SET ${fields
              .map((field) => `${quote(field.name)} = ?`)
              .join(', ')} WHERE __row_id = ?`,
          )
          .run(...fields.map((field) => normalized[field.name] as SQLInputValue), rowId);
        if (result.changes !== 1) throw new Error('The row was not found.');
      }
      this.database.exec('COMMIT');
      return { row: this.readRow(table, rowId), warnings };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  deleteRow(tableName: string, rowId: number): boolean {
    const table = tableForName(tableName);
    return (
      this.database.prepare(`DELETE FROM ${quote(table)} WHERE __row_id = ?`).run(rowId).changes ===
      1
    );
  }

  listObjects(request: ObjectListRequest): ObjectListPage {
    return this.objects.list(request);
  }

  readObject(request: ObjectReadRequest): ObjectDetail {
    return this.objects.read(request);
  }

  saveObject(request: SaveObjectRequest): SaveObjectResult {
    return this.objects.save(request);
  }

  deleteObject(request: ObjectDeleteRequest): ObjectDeleteResult {
    return this.objects.delete(request);
  }

  validate(databaseId: string, checkpoint?: () => void): ValidationReport {
    const issues: ValidationIssue[] = [];
    let rowsChecked = 0;
    for (const table of FIFA_TABLES) {
      checkpoint?.();
      const rows = this.readAllRows(table);
      rowsChecked += rows.length;
      issues.push(
        ...validateRows(
          table,
          rows.map((row) => ({ rowId: row.rowId, values: row.values })),
          fieldsFor(table),
        ),
      );
    }
    checkpoint?.();
    issues.push(...this.relationshipIssues());
    checkpoint?.();
    const validatedAt = new Date().toISOString();
    this.persistIssues(issues);
    return {
      databaseId,
      validatedAt,
      tablesChecked: FIFA_TABLES.length,
      rowsChecked,
      errorCount: issues
        .filter((issue) => issue.severity === 'error')
        .reduce((total, issue) => total + issue.occurrences, 0),
      warningCount: issues
        .filter((issue) => issue.severity === 'warning')
        .reduce((total, issue) => total + issue.occurrences, 0),
      issues,
    };
  }

  validationReport(databaseId: string): ValidationReport {
    const metadata = this.metadata();
    const issues = (
      this.database
        .prepare(
          'SELECT severity, table_name, field_name, message, occurrences, samples_json FROM _validation_issues ORDER BY table_name, field_name',
        )
        .all() as {
        severity: 'error' | 'warning';
        table_name: string;
        field_name: string | null;
        message: string;
        occurrences: number;
        samples_json: string;
      }[]
    ).map((row) => ({
      severity: row.severity,
      table: row.table_name,
      ...(row.field_name ? { field: row.field_name } : {}),
      message: row.message,
      occurrences: Number(row.occurrences),
      samples: JSON.parse(row.samples_json) as ValidationIssue['samples'],
    }));
    return {
      databaseId,
      validatedAt: metadata['validated_at'] ?? '',
      tablesChecked: FIFA_TABLES.length,
      rowsChecked: this.listTables().reduce((total, table) => total + table.rowCount, 0),
      errorCount: issues
        .filter((issue) => issue.severity === 'error')
        .reduce((total, issue) => total + issue.occurrences, 0),
      warningCount: issues
        .filter((issue) => issue.severity === 'warning')
        .reduce((total, issue) => total + issue.occurrences, 0),
      issues,
    };
  }

  private initialize(metadata: Record<string, string>): void {
    this.database.exec(`
      PRAGMA user_version = ${FIFA_DATABASE_SCHEMA_VERSION};
      CREATE TABLE _metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE _validation_issues (
        severity TEXT NOT NULL,
        table_name TEXT NOT NULL,
        field_name TEXT,
        message TEXT NOT NULL,
        occurrences INTEGER NOT NULL,
        samples_json TEXT NOT NULL
      );
    `);
    for (const table of FIFA_TABLES) {
      const fields = fieldsFor(table);
      this.database.exec(
        `CREATE TABLE ${quote(table)} (
          __row_id INTEGER PRIMARY KEY AUTOINCREMENT,
          __row_order INTEGER NOT NULL,
          ${fields.map((field) => `${quote(field.name)} ${sqliteType(field)}`).join(',\n')}
        )`,
      );
      this.database.exec(
        `CREATE INDEX ${quote(`idx_${table}_row_order`)} ON ${quote(table)} (__row_order)`,
      );
    }
    const insert = this.database.prepare('INSERT INTO _metadata(key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(metadata)) insert.run(key, value);
  }

  private toTableRow(row: SqlRow, fields: readonly Field[]): TableRow {
    return {
      rowId: Number(row['__row_id']),
      rowOrder: Number(row['__row_order']),
      values: valuesFromSql(row, fields),
    };
  }

  private relationshipIssues(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const relation of relationshipDefinitions) {
      const rows = this.database
        .prepare(
          `SELECT source.__row_id AS row_id, source.${quote(relation.field)} AS value
           FROM ${quote(relation.table)} source
           LEFT JOIN ${quote(relation.targetTable)} target
             ON source.${quote(relation.field)} = target.${quote(relation.targetField)}
           WHERE source.${quote(relation.field)} IS NOT NULL
             AND CAST(source.${quote(relation.field)} AS TEXT) != ''
             AND target.__row_id IS NULL`,
        )
        .all() as { row_id: number; value: TableValue }[];
      if (rows.length)
        issues.push({
          severity: 'warning',
          table: relation.table,
          field: relation.field,
          message: `Value does not reference an existing ${relation.targetTable}.${relation.targetField}.`,
          occurrences: rows.length,
          samples: rows.slice(0, 25).map((row) => ({ rowId: row.row_id, value: row.value })),
        });
    }
    return issues;
  }

  private persistIssues(issues: ValidationIssue[]): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.exec('DELETE FROM _validation_issues');
      const insert = this.database.prepare(
        'INSERT INTO _validation_issues VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const issue of issues)
        insert.run(
          issue.severity,
          issue.table,
          issue.field ?? null,
          issue.message,
          issue.occurrences,
          JSON.stringify(issue.samples),
        );
      this.setMetadata('validated_at', new Date().toISOString());
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

export const defaultRowValues = (fields: readonly FieldDescriptor[]): TableRowValues =>
  Object.fromEntries(fields.map((field) => [field.name, field.defaultValue]));
