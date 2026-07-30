import { Service } from '@angular/core';
import type {
  CreateBlankDatabaseRequest,
  CreateProjectRequest,
  DeleteRowRequest,
  DatabaseObjectSettings,
  ExportDatabaseRequest,
  ImportDatabaseRequest,
  OperationKind,
  ObjectDeleteRequest,
  ObjectListRequest,
  ObjectReadRequest,
  PrepareT3dbRequest,
  SaveRowRequest,
  SaveObjectRequest,
  TablePageRequest,
  ThemePreference,
  UpdateProjectRequest,
} from '../../../shared/contracts';

@Service()
export class DesktopApi {
  private get api() {
    if (!window.qdbEditor)
      throw new Error('The desktop bridge is unavailable. Open this page through QDB Editor 16.');
    return window.qdbEditor;
  }

  listProjects() {
    return this.api.listProjects();
  }
  createProject(request: CreateProjectRequest) {
    return this.api.createProject(request);
  }
  updateProject(request: UpdateProjectRequest) {
    return this.api.updateProject(request);
  }
  removeProject(id: string) {
    return this.api.removeProject(id);
  }
  listDatabases(projectId: string) {
    return this.api.listDatabases(projectId);
  }
  createBlankDatabase(request: CreateBlankDatabaseRequest) {
    return this.api.createBlankDatabase(request);
  }
  renameDatabase(id: string, name: string) {
    return this.api.renameDatabase(id, name);
  }
  removeDatabase(id: string) {
    return this.api.removeDatabase(id);
  }
  selectTextSource() {
    return this.api.selectTextSource();
  }
  selectT3dbDatabaseFile() {
    return this.api.selectT3dbDatabaseFile();
  }
  selectT3dbMetadataFile() {
    return this.api.selectT3dbMetadataFile();
  }
  prepareT3dbSource(request: PrepareT3dbRequest) {
    return this.api.prepareT3dbSource(request);
  }
  importDatabase(request: ImportDatabaseRequest) {
    return this.api.importDatabase(request);
  }
  listTables(databaseId: string) {
    return this.api.listTables(databaseId);
  }
  readTable(request: TablePageRequest) {
    return this.api.readTable(request);
  }
  readRow(databaseId: string, table: string, rowId: number) {
    return this.api.readRow(databaseId, table, rowId);
  }
  saveRow(request: SaveRowRequest) {
    return this.api.saveRow(request);
  }
  deleteRow(request: DeleteRowRequest) {
    return this.api.deleteRow(request);
  }
  listObjects(request: ObjectListRequest) {
    return this.api.listObjects(request);
  }
  readObject(request: ObjectReadRequest) {
    return this.api.readObject(request);
  }
  saveObject(request: SaveObjectRequest) {
    return this.api.saveObject(request);
  }
  deleteObject(request: ObjectDeleteRequest) {
    return this.api.deleteObject(request);
  }
  getDatabaseObjectSettings(databaseId: string) {
    return this.api.getDatabaseObjectSettings(databaseId);
  }
  saveDatabaseObjectSettings(databaseId: string, settings: DatabaseObjectSettings) {
    return this.api.saveDatabaseObjectSettings(databaseId, settings);
  }
  restoreDatabaseObjectSettings(databaseId: string) {
    return this.api.restoreDatabaseObjectSettings(databaseId);
  }
  validateDatabase(databaseId: string) {
    return this.api.validateDatabase(databaseId);
  }
  getValidation(databaseId: string) {
    return this.api.getValidation(databaseId);
  }
  selectExportDirectory() {
    return this.api.selectExportDirectory();
  }
  exportDatabase(request: ExportDatabaseRequest) {
    return this.api.exportDatabase(request);
  }
  revealExport(path: string) {
    return this.api.revealExport(path);
  }
  cancelOperation(operation: OperationKind) {
    return this.api.cancelOperation(operation);
  }
  getTheme() {
    return this.api.getTheme();
  }
  setTheme(theme: ThemePreference) {
    return this.api.setTheme(theme);
  }
  onProgress(listener: Parameters<NonNullable<typeof window.qdbEditor>['onProgress']>[0]) {
    return this.api.onProgress(listener);
  }
}
