import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  CreateProjectRequest,
  DatabaseDescriptor,
  ProjectDeletionResult,
  ProjectDescriptor,
  SourceProvenance,
  ThemePreference,
  UpdateProjectRequest,
  ValidationSummary,
} from '../shared/contracts';
import { FIFA_TABLES } from '../shared/table-config';
import { closeDatabase, DatabaseSync } from './runtime-sqlite';

const CATALOG_SCHEMA_VERSION = 1;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

interface ProjectRow {
  id: string;
  name: string;
  reference_date: string;
  created_at: string;
  updated_at: string;
  database_count: number;
}

interface DatabaseRow {
  id: string;
  project_id: string;
  name: string;
  source_json: string;
  status: 'available' | 'corrupt';
  table_count: number;
  row_count: number;
  created_at: string;
  updated_at: string;
  validated_at: string;
  error_count: number;
  warning_count: number;
  error: string | null;
}

const asProject = (row: ProjectRow): ProjectDescriptor => ({
  id: row.id,
  name: row.name,
  referenceDate: row.reference_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  databaseCount: Number(row.database_count),
});

const asDatabase = (row: DatabaseRow): DatabaseDescriptor => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  fifaVersion: 16,
  source: JSON.parse(row.source_json) as SourceProvenance,
  status: row.status,
  tableCount: Number(row.table_count),
  rowCount: Number(row.row_count),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  validation: {
    validatedAt: row.validated_at,
    errorCount: Number(row.error_count),
    warningCount: Number(row.warning_count),
  },
  ...(row.error ? { error: row.error } : {}),
});

export const validateId = (id: string): string => {
  if (!uuidPattern.test(id)) throw new Error('Invalid identifier.');
  return id;
};

const validateName = (name: string): string => {
  const value = name.trim();
  if (!value) throw new Error('Name is required.');
  if (value.length > 80) throw new Error('Name must not exceed 80 characters.');
  return value;
};

const validateReferenceDate = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  if (
    !datePattern.test(value) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new Error('Reference date must use YYYY-MM-DD.');
  return value;
};

export class Catalog {
  readonly projectsDirectory: string;
  private readonly database: DatabaseSync;

  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.projectsDirectory = join(root, 'projects');
    mkdirSync(this.projectsDirectory, { recursive: true });
    this.database = new DatabaseSync(join(root, 'catalog.sqlite'));
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL');
    this.migrate();
    this.cleanupStagedFiles();
  }

  close(): void {
    closeDatabase(this.database);
  }

  listProjects(): ProjectDescriptor[] {
    return (
      this.database
        .prepare(
          `SELECT p.*, count(d.id) AS database_count
           FROM projects p
           LEFT JOIN databases d ON d.project_id = p.id
           GROUP BY p.id
           ORDER BY p.updated_at DESC, p.name COLLATE NOCASE`,
        )
        .all() as unknown as ProjectRow[]
    ).map(asProject);
  }

  project(id: string): ProjectDescriptor {
    validateId(id);
    const row = this.database
      .prepare(
        `SELECT p.*, count(d.id) AS database_count
         FROM projects p
         LEFT JOIN databases d ON d.project_id = p.id
         WHERE p.id = ?
         GROUP BY p.id`,
      )
      .get(id) as unknown as ProjectRow | undefined;
    if (!row) throw new Error('Project was not found.');
    return asProject(row);
  }

  createProject(request: CreateProjectRequest): ProjectDescriptor {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      this.database
        .prepare(
          'INSERT INTO projects(id, name, reference_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          id,
          validateName(request.name),
          validateReferenceDate(request.referenceDate),
          now,
          now,
        );
    } catch (error) {
      if (String(error).includes('UNIQUE'))
        throw new Error('A project with this name already exists.', { cause: error });
      throw error;
    }
    mkdirSync(this.projectDirectory(id), { recursive: true });
    return this.project(id);
  }

  updateProject(request: UpdateProjectRequest): ProjectDescriptor {
    validateId(request.id);
    try {
      const result = this.database
        .prepare('UPDATE projects SET name = ?, reference_date = ?, updated_at = ? WHERE id = ?')
        .run(
          validateName(request.name),
          validateReferenceDate(request.referenceDate),
          new Date().toISOString(),
          request.id,
        );
      if (result.changes !== 1) throw new Error('Project was not found.');
    } catch (error) {
      if (String(error).includes('UNIQUE'))
        throw new Error('A project with this name already exists.', { cause: error });
      throw error;
    }
    return this.project(request.id);
  }

  removeProject(id: string): ProjectDeletionResult {
    validateId(id);
    const project = this.project(id);
    const directory = this.projectDirectory(id);
    const staged = `${directory}.deleting-${randomUUID()}`;
    if (existsSync(directory)) renameSync(directory, staged);
    try {
      const removed =
        this.database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes === 1;
      if (existsSync(staged)) rmSync(staged, { recursive: true, force: true });
      return { projectId: id, removed, databasesRemoved: project.databaseCount };
    } catch (error) {
      if (existsSync(staged)) renameSync(staged, directory);
      throw error;
    }
  }

  listDatabases(projectId: string): DatabaseDescriptor[] {
    validateId(projectId);
    this.project(projectId);
    return (
      this.database
        .prepare(
          'SELECT * FROM databases WHERE project_id = ? ORDER BY updated_at DESC, name COLLATE NOCASE',
        )
        .all(projectId) as unknown as DatabaseRow[]
    ).map((row) => {
      const descriptor = asDatabase(row);
      return existsSync(this.databasePath(descriptor.id))
        ? descriptor
        : {
            ...descriptor,
            status: 'corrupt' as const,
            error: 'The managed database file is missing.',
          };
    });
  }

  databaseDescriptor(id: string): DatabaseDescriptor {
    validateId(id);
    const row = this.database.prepare('SELECT * FROM databases WHERE id = ?').get(id) as
      (DatabaseRow & Record<string, unknown>) | undefined;
    if (!row) throw new Error('Database was not found.');
    const descriptor = asDatabase(row);
    if (!existsSync(this.databasePath(id)))
      return { ...descriptor, status: 'corrupt', error: 'The managed database file is missing.' };
    return descriptor;
  }

  createDatabaseRecord(
    id: string,
    projectId: string,
    name: string,
    source: SourceProvenance,
    rowCount: number,
    validation: ValidationSummary,
  ): DatabaseDescriptor {
    validateId(id);
    validateId(projectId);
    this.project(projectId);
    const now = new Date().toISOString();
    try {
      this.database
        .prepare(
          `INSERT INTO databases(
            id, project_id, name, source_json, status, table_count, row_count,
            created_at, updated_at, validated_at, error_count, warning_count
          ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          validateName(name),
          JSON.stringify(source),
          FIFA_TABLES.length,
          rowCount,
          now,
          now,
          validation.validatedAt,
          validation.errorCount,
          validation.warningCount,
        );
    } catch (error) {
      if (String(error).includes('UNIQUE'))
        throw new Error('A database with this name already exists in the project.', {
          cause: error,
        });
      throw error;
    }
    this.touchProject(projectId);
    return this.databaseDescriptor(id);
  }

  assertDatabaseNameAvailable(projectId: string, name: string): string {
    validateId(projectId);
    this.project(projectId);
    const value = validateName(name);
    const existing = this.database
      .prepare('SELECT 1 FROM databases WHERE project_id = ? AND name = ? COLLATE NOCASE')
      .get(projectId, value);
    if (existing) throw new Error('A database with this name already exists in the project.');
    return value;
  }

  renameDatabase(id: string, name: string): DatabaseDescriptor {
    const descriptor = this.databaseDescriptor(id);
    try {
      this.database
        .prepare('UPDATE databases SET name = ?, updated_at = ? WHERE id = ?')
        .run(validateName(name), new Date().toISOString(), id);
    } catch (error) {
      if (String(error).includes('UNIQUE'))
        throw new Error('A database with this name already exists in the project.', {
          cause: error,
        });
      throw error;
    }
    this.touchProject(descriptor.projectId);
    return this.databaseDescriptor(id);
  }

  updateDatabaseSummary(
    id: string,
    rowCount: number,
    validation: ValidationSummary,
  ): DatabaseDescriptor {
    const descriptor = this.databaseDescriptor(id);
    this.database
      .prepare(
        `UPDATE databases
         SET row_count = ?, validated_at = ?, error_count = ?, warning_count = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        rowCount,
        validation.validatedAt,
        validation.errorCount,
        validation.warningCount,
        new Date().toISOString(),
        id,
      );
    this.touchProject(descriptor.projectId);
    return this.databaseDescriptor(id);
  }

  removeDatabase(id: string): boolean {
    const descriptor = this.databaseDescriptor(id);
    const path = this.databasePath(id);
    const staged = `${path}.deleting-${randomUUID()}`;
    this.removeSidecars(path);
    if (existsSync(path)) renameSync(path, staged);
    try {
      const removed =
        this.database.prepare('DELETE FROM databases WHERE id = ?').run(id).changes === 1;
      if (existsSync(staged)) unlinkSync(staged);
      this.touchProject(descriptor.projectId);
      return removed;
    } catch (error) {
      if (existsSync(staged)) renameSync(staged, path);
      throw error;
    }
  }

  projectDirectory(projectId: string): string {
    return join(this.projectsDirectory, validateId(projectId));
  }

  databasePath(databaseId: string): string {
    const row = this.database
      .prepare('SELECT project_id FROM databases WHERE id = ?')
      .get(validateId(databaseId)) as { project_id: string } | undefined;
    if (!row) throw new Error('Database was not found.');
    return join(this.projectDirectory(row.project_id), `${databaseId}.sqlite`);
  }

  temporaryDatabasePath(projectId: string, databaseId: string): string {
    const directory = this.projectDirectory(projectId);
    mkdirSync(directory, { recursive: true });
    return join(directory, `${validateId(databaseId)}.importing`);
  }

  finalDatabasePath(projectId: string, databaseId: string): string {
    return join(this.projectDirectory(projectId), `${validateId(databaseId)}.sqlite`);
  }

  getTheme(): ThemePreference {
    const row = this.database.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as
      { value: string } | undefined;
    return row?.value === 'light' || row?.value === 'dark' ? row.value : 'system';
  }

  setTheme(theme: ThemePreference): ThemePreference {
    if (!['system', 'light', 'dark'].includes(theme)) throw new Error('Invalid theme preference.');
    this.database
      .prepare(
        "INSERT INTO settings(key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(theme);
    return theme;
  }

  private migrate(): void {
    const version = Number(
      this.database.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0,
    );
    if (version > CATALOG_SCHEMA_VERSION)
      throw new Error('The catalog was created by a newer QDB Editor 16 version.');
    if (version === 0)
      this.database.exec(`
        BEGIN;
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          reference_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE databases (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL COLLATE NOCASE,
          source_json TEXT NOT NULL,
          status TEXT NOT NULL,
          table_count INTEGER NOT NULL,
          row_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          validated_at TEXT NOT NULL,
          error_count INTEGER NOT NULL,
          warning_count INTEGER NOT NULL,
          error TEXT,
          UNIQUE(project_id, name)
        );
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        PRAGMA user_version = ${CATALOG_SCHEMA_VERSION};
        COMMIT;
      `);
  }

  private touchProject(projectId: string): void {
    this.database
      .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId);
  }

  private cleanupStagedFiles(): void {
    const isStaged = (name: string): boolean =>
      name.includes('.deleting-') ||
      name.endsWith('.importing') ||
      name.endsWith('.importing-wal') ||
      name.endsWith('.importing-shm');
    for (const entry of readdirSync(this.projectsDirectory, { withFileTypes: true })) {
      const path = join(this.projectsDirectory, entry.name);
      if (isStaged(entry.name)) {
        rmSync(path, { recursive: entry.isDirectory(), force: true });
        continue;
      }
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(path))
        if (isStaged(file)) rmSync(join(path, file), { force: true });
    }
  }

  private removeSidecars(path: string): void {
    for (const suffix of ['-wal', '-shm'])
      try {
        unlinkSync(`${path}${suffix}`);
      } catch {
        // Missing SQLite sidecars are harmless.
      }
  }
}
