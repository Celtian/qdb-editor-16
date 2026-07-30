import { computed, inject, Service, signal } from '@angular/core';
import type {
  DatabaseDescriptor,
  OperationProgress,
  ProjectDescriptor,
  TableDescriptor,
} from '../../../shared/contracts';
import { DesktopApi } from './desktop-api';

@Service()
export class AppStore {
  private readonly desktop = inject(DesktopApi);
  private readonly projectState = signal<ProjectDescriptor[]>([]);
  private readonly databaseState = signal<DatabaseDescriptor[]>([]);
  private readonly tableState = signal<TableDescriptor[]>([]);

  readonly projects = this.projectState.asReadonly();
  readonly databases = this.databaseState.asReadonly();
  readonly tables = this.tableState.asReadonly();
  readonly activeProjectId = signal('');
  readonly activeDatabaseId = signal('');
  readonly activeProject = computed(() =>
    this.projectState().find((project) => project.id === this.activeProjectId()),
  );
  readonly activeDatabase = computed(() =>
    this.databaseState().find((database) => database.id === this.activeDatabaseId()),
  );
  readonly loading = signal(false);
  readonly error = signal('');
  readonly progress = signal<OperationProgress | undefined>(undefined);

  constructor() {
    try {
      this.desktop.onProgress((value) => this.progress.set(value));
    } catch {
      // The bridge is attached when Electron loads the renderer.
    }
  }

  async refreshProjects(): Promise<void> {
    await this.run(async () => this.projectState.set(await this.desktop.listProjects()));
  }

  async refreshDatabases(projectId: string): Promise<void> {
    this.activeProjectId.set(projectId);
    await this.run(async () => {
      const databases = await this.desktop.listDatabases(projectId);
      this.databaseState.set(databases);
      if (
        this.activeDatabaseId() &&
        !databases.some((database) => database.id === this.activeDatabaseId())
      )
        this.activeDatabaseId.set('');
    });
  }

  async refreshTables(databaseId: string): Promise<void> {
    this.activeDatabaseId.set(databaseId);
    await this.run(async () => this.tableState.set(await this.desktop.listTables(databaseId)));
  }

  selectContext(projectId: string, databaseId = ''): void {
    this.activeProjectId.set(projectId);
    this.activeDatabaseId.set(databaseId);
  }

  async operation<T>(action: () => Promise<T>): Promise<T> {
    this.loading.set(true);
    this.error.set('');
    try {
      return await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.loading.set(false);
      this.progress.set(undefined);
    }
  }

  clearError(): void {
    this.error.set('');
  }

  async cancelCurrentOperation(): Promise<void> {
    const operation = this.progress()?.operation;
    if (operation) await this.desktop.cancelOperation(operation);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await this.operation(async () => action());
    } catch {
      // The user-facing error is exposed through the store.
    }
  }
}
