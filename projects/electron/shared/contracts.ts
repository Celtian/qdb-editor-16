import type { QdbDesktopApi as DownloaderDesktopApi, SourceName } from './downloader/contracts.js';

export type {
  AppError,
  CombinedEntity,
  CombinedEntityFilterOptions,
  CombinedEntityFilterOptionsRequest,
  CombinedEntityKind,
  CombinedLeague,
  CombinedPageRequest,
  CombinedPlayer,
  CombinedTeam,
  CommitImportRequest,
  CommitTeamCombinationRequest,
  Entity,
  EntityFilterOptions,
  EntityFilterOptionsRequest,
  EntityKind,
  ExportColumnSelection,
  ExportConfigurationPreference,
  ExportDataset,
  ExportFieldNameConfiguration,
  ExportFormat,
  ExportRequest,
  ExportResult,
  FieldResolution,
  FieldResolutions,
  ImportOperation,
  ImportPreview,
  ImportResult,
  League,
  MergeImportOptions,
  Page,
  PageRequest,
  Player,
  PreviewTeamCombinationRequest,
  Result,
  SourceName,
  Team,
  TeamCombinationPreview,
  TeamCombinationResult,
} from './downloader/contracts.js';
export type {
  CustomBadge,
  CustomBadgeColor,
  CustomBadgeSummary,
} from './downloader/custom-badge.js';
export type {
  CombinedCustomBadge,
  CombinedCustomBadgeSummary,
} from './downloader/combined-custom-badge.js';

export type ThemePreference = 'system' | 'light' | 'dark';
export type DatabaseSourceKind = 'blank' | 'text-folder' | 't3db';
export type DatabaseStatus = 'available' | 'corrupt';
export type ValidationSeverity = 'error' | 'warning';
export type TableValue = string | number;
export type TableRowValues = Record<string, TableValue>;
export type ObjectKind = 'countries' | 'stadiums' | 'leagues' | 'teams' | 'players' | 'referees';
export type ObjectSection =
  | 'root'
  | 'teams'
  | 'referees'
  | 'identity'
  | 'traits'
  | 'tactics'
  | 'manager'
  | 'stadium'
  | 'location'
  | 'players'
  | 'jersey-numbers'
  | 'contract'
  | 'appearance'
  | 'gear'
  | 'skills'
  | 'behaviour'
  | 'leagues';

export interface ProjectDescriptor {
  id: string;
  name: string;
  referenceDate: string;
  createdAt: string;
  updatedAt: string;
  databaseCount: number;
  sourceLeagueCount: number;
  sourceTeamCount: number;
  sourcePlayerCount: number;
  combinedLeagueCount: number;
  combinedTeamCount: number;
  combinedPlayerCount: number;
  sourceNames: SourceName[];
}

export interface CreateProjectRequest {
  name: string;
  referenceDate: string;
}

export interface UpdateProjectRequest extends CreateProjectRequest {
  id: string;
}

export interface ProjectDeletionResult {
  projectId: string;
  removed: boolean;
  databasesRemoved: number;
  deletedExportCount: number;
  failedExportDirectories: string[];
}

export interface LegacyMigrationCounts {
  leagues: number;
  teams: number;
  players: number;
  combinedLeagues: number;
  combinedTeams: number;
  combinedPlayers: number;
}

export interface LegacyMigrationProjectPreview {
  legacyProjectId: string;
  name: string;
  referenceDate: string;
  action: 'merge' | 'create';
  targetProjectId?: string;
  targetName: string;
  counts: LegacyMigrationCounts;
}

export interface LegacyMigrationPreview {
  sourcePath: string;
  sourceIdentity: string;
  alreadyMigrated: boolean;
  projects: LegacyMigrationProjectPreview[];
  totals: LegacyMigrationCounts;
}

export interface LegacyMigrationRequest {
  sourcePath: string;
  sourceIdentity: string;
}

export interface LegacyMigrationResult {
  sourceIdentity: string;
  projectsMerged: number;
  projectsCreated: number;
  totals: LegacyMigrationCounts;
}

export interface SourceProvenance {
  kind: DatabaseSourceKind;
  originalPaths: string[];
  hashes: Record<string, string>;
  importedAt: string;
}

export interface ValidationSummary {
  validatedAt: string;
  errorCount: number;
  warningCount: number;
}

export interface DatabaseDescriptor {
  id: string;
  projectId: string;
  name: string;
  fifaVersion: 16;
  source: SourceProvenance;
  status: DatabaseStatus;
  tableCount: number;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  validation: ValidationSummary;
  error?: string;
}

export interface CreateBlankDatabaseRequest {
  projectId: string;
  name: string;
}

export interface SourceFileSelection {
  id: string;
  displayPath: string;
  fileName: string;
}

export interface ImportCandidate {
  selectionId: string;
  suggestedName: string;
  sourceKind: Exclude<DatabaseSourceKind, 'blank'>;
  originalPaths: string[];
  tables: { table: string; rows: number }[];
  unsupportedTables: string[];
  warnings: string[];
}

export interface PrepareT3dbRequest {
  databaseFileId: string;
  metadataFileId: string;
}

export interface ImportDatabaseRequest {
  projectId: string;
  selectionId: string;
  name: string;
}

export interface ImportDatabaseResult {
  database: DatabaseDescriptor;
  validation: ValidationReport;
}

export interface FieldDescriptor {
  name: string;
  type: 'int' | 'float' | 'string';
  defaultValue: TableValue;
  unique: boolean;
  range?: { min: number; max: number };
}

export interface TableDescriptor {
  name: string;
  fields: FieldDescriptor[];
  rowCount: number;
  errorCount: number;
  warningCount: number;
}

export interface TablePageRequest {
  databaseId: string;
  table: string;
  pageIndex: number;
  pageSize: number;
  query: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface TableRow {
  rowId: number;
  rowOrder: number;
  values: TableRowValues;
}

export interface TablePage {
  table: string;
  fields: FieldDescriptor[];
  rows: TableRow[];
  total: number;
}

export interface SaveRowRequest {
  databaseId: string;
  table: string;
  rowId?: number;
  values: TableRowValues;
  acceptWarnings: boolean;
}

export interface DeleteRowRequest {
  databaseId: string;
  table: string;
  rowId: number;
}

export interface ValidationSample {
  rowId: number;
  value: TableValue | '(missing)' | '(empty)';
}

export interface ValidationIssue {
  severity: ValidationSeverity;
  table: string;
  field?: string;
  message: string;
  occurrences: number;
  samples: ValidationSample[];
}

export interface ValidationReport extends ValidationSummary {
  databaseId: string;
  tablesChecked: number;
  rowsChecked: number;
  issues: ValidationIssue[];
}

export interface SaveRowResult {
  row: TableRow;
  warnings: ValidationIssue[];
}

export interface ObjectListRequest {
  databaseId: string;
  kind: ObjectKind;
  pageIndex: number;
  pageSize: number;
  query: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ObjectSummary {
  id: number;
  name: string;
  values: TableRowValues;
}

export interface ObjectListPage {
  kind: ObjectKind;
  items: ObjectSummary[];
  total: number;
}

export interface ObjectReference {
  id: number;
  name: string;
  values: TableRowValues;
}

export interface ObjectDetail {
  kind: ObjectKind;
  id: number;
  title: string;
  section: ObjectSection;
  fields: FieldDescriptor[];
  values: TableRowValues;
  relationIds: number[];
  related: ObjectReference[];
  readOnly: boolean;
}

export interface ObjectReadRequest {
  databaseId: string;
  kind: ObjectKind;
  id: number;
  section: ObjectSection;
}

export interface SaveObjectRequest {
  databaseId: string;
  kind: ObjectKind;
  id?: number;
  section: ObjectSection;
  values: TableRowValues;
  relationIds?: number[];
  related?: { id: number; values: TableRowValues }[];
  acceptWarnings: boolean;
}

export interface SaveObjectResult {
  id: number;
  warnings: ValidationIssue[];
}

export interface ObjectDeleteRequest {
  databaseId: string;
  kind: ObjectKind;
  id: number;
}

export interface ObjectDependency {
  table: string;
  field: string;
  count: number;
  sampleIds: number[];
}

export type ObjectDeleteResult =
  { deleted: true; dependencies: [] } | { deleted: false; dependencies: ObjectDependency[] };

export type WeightedSettings = Record<string, number>;

export interface DatabaseObjectSettings {
  ids: {
    league: number;
    team: number;
    country: number;
    player: number;
    referee: number;
  };
  dates: { date: number; now: boolean };
  referee: {
    foulsStyle: WeightedSettings;
    cardsStyle: WeightedSettings;
    jerseySleeve: WeightedSettings;
  };
  traits: { teamTraits: WeightedSettings; playerTraits: WeightedSettings };
  shoes: { shoeType: WeightedSettings };
  kit: {
    jerseyFit: WeightedSettings;
    jerseyStyle: WeightedSettings;
    jerseySleeveLength: WeightedSettings;
    sockLength: WeightedSettings;
    winterAccessories: WeightedSettings;
  };
  tactics: {
    busPositioning: WeightedSettings;
    ccPositioning: WeightedSettings;
    defDefenderLine: WeightedSettings;
  };
  animations: {
    freeKickStart: WeightedSettings;
    penaltiesStart: WeightedSettings;
    penaltiesMotionStyle: WeightedSettings;
    penaltiesKickStyle: WeightedSettings;
  };
}

export interface ExportDatabaseRequest {
  databaseId: string;
  targetParentPath: string;
}

export interface ExportDatabaseResult {
  databaseId: string;
  outputPath: string;
}

export interface OperationProgress {
  operation: 'import' | 'validation' | 'export';
  message: string;
}

export type OperationKind = OperationProgress['operation'];

export interface QdbEditorApi {
  downloader: DownloaderDesktopApi;
  listProjects(): Promise<ProjectDescriptor[]>;
  createProject(request: CreateProjectRequest): Promise<ProjectDescriptor>;
  updateProject(request: UpdateProjectRequest): Promise<ProjectDescriptor>;
  removeProject(id: string): Promise<ProjectDeletionResult>;
  detectLegacyDownloaderDatabase(): Promise<string | undefined>;
  selectLegacyDownloaderDatabase(): Promise<string | undefined>;
  previewLegacyDownloaderMigration(sourcePath: string): Promise<LegacyMigrationPreview>;
  migrateLegacyDownloader(request: LegacyMigrationRequest): Promise<LegacyMigrationResult>;
  listDatabases(projectId: string): Promise<DatabaseDescriptor[]>;
  createBlankDatabase(request: CreateBlankDatabaseRequest): Promise<DatabaseDescriptor>;
  renameDatabase(id: string, name: string): Promise<DatabaseDescriptor>;
  removeDatabase(id: string): Promise<boolean>;
  selectTextSource(): Promise<ImportCandidate | undefined>;
  selectT3dbDatabaseFile(): Promise<SourceFileSelection | undefined>;
  selectT3dbMetadataFile(): Promise<SourceFileSelection | undefined>;
  prepareT3dbSource(request: PrepareT3dbRequest): Promise<ImportCandidate>;
  importDatabase(request: ImportDatabaseRequest): Promise<ImportDatabaseResult>;
  listTables(databaseId: string): Promise<TableDescriptor[]>;
  readTable(request: TablePageRequest): Promise<TablePage>;
  readRow(databaseId: string, table: string, rowId: number): Promise<TableRow>;
  saveRow(request: SaveRowRequest): Promise<SaveRowResult>;
  deleteRow(request: DeleteRowRequest): Promise<boolean>;
  listObjects(request: ObjectListRequest): Promise<ObjectListPage>;
  readObject(request: ObjectReadRequest): Promise<ObjectDetail>;
  saveObject(request: SaveObjectRequest): Promise<SaveObjectResult>;
  deleteObject(request: ObjectDeleteRequest): Promise<ObjectDeleteResult>;
  getDatabaseObjectSettings(databaseId: string): Promise<DatabaseObjectSettings>;
  saveDatabaseObjectSettings(
    databaseId: string,
    settings: DatabaseObjectSettings,
  ): Promise<DatabaseObjectSettings>;
  restoreDatabaseObjectSettings(databaseId: string): Promise<DatabaseObjectSettings>;
  validateDatabase(databaseId: string): Promise<ValidationReport>;
  getValidation(databaseId: string): Promise<ValidationReport>;
  selectExportDirectory(): Promise<string | undefined>;
  exportDatabase(request: ExportDatabaseRequest): Promise<ExportDatabaseResult>;
  revealExport(path: string): Promise<boolean>;
  cancelOperation(operation: OperationKind): Promise<boolean>;
  getTheme(): Promise<ThemePreference>;
  setTheme(theme: ThemePreference): Promise<ThemePreference>;
  onProgress(listener: (progress: OperationProgress) => void): () => void;
}
