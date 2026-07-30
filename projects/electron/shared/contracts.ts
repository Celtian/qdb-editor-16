export type ThemePreference = 'system' | 'light' | 'dark';
export type DatabaseSourceKind = 'blank' | 'text-folder' | 't3db';
export type DatabaseStatus = 'available' | 'corrupt';
export type ValidationSeverity = 'error' | 'warning';
export type TableValue = string | number;
export type TableRowValues = Record<string, TableValue>;

export interface ProjectDescriptor {
  id: string;
  name: string;
  referenceDate: string;
  createdAt: string;
  updatedAt: string;
  databaseCount: number;
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
  listProjects(): Promise<ProjectDescriptor[]>;
  createProject(request: CreateProjectRequest): Promise<ProjectDescriptor>;
  updateProject(request: UpdateProjectRequest): Promise<ProjectDescriptor>;
  removeProject(id: string): Promise<ProjectDeletionResult>;
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
