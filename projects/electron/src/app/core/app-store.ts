import { computed, effect, inject, Service, signal } from '@angular/core';
import type {
  DatabaseDescriptor,
  OperationProgress,
  ProjectDescriptor,
  TableDescriptor,
} from '../../../shared/contracts';
import { DesktopApi } from './desktop-api';
import { DesktopApi as DownloaderApi } from './downloader-api';

export interface BranchLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string;
}

const idleBranchState: BranchLoadState = { status: 'idle', error: '' };

@Service()
export class AppStore {
  private readonly desktop = inject(DesktopApi);
  private readonly downloader = inject(DownloaderApi);
  private readonly projectState = signal<ProjectDescriptor[]>([]);
  private readonly databaseState = signal<ReadonlyMap<string, DatabaseDescriptor[]>>(new Map());
  private readonly tableState = signal<ReadonlyMap<string, TableDescriptor[]>>(new Map());
  private readonly databaseBranchState = signal<ReadonlyMap<string, BranchLoadState>>(new Map());
  private readonly tableBranchState = signal<ReadonlyMap<string, BranchLoadState>>(new Map());
  private readonly databaseLoads = new Map<string, Promise<void>>();
  private readonly tableLoads = new Map<string, Promise<void>>();

  readonly projects = this.projectState.asReadonly();
  readonly activeProjectId = signal('');
  readonly activeDatabaseId = signal('');
  readonly databases = computed(() => this.databasesFor(this.activeProjectId()));
  readonly tables = computed(() => this.tablesFor(this.activeDatabaseId()));
  readonly activeProject = computed(() =>
    this.projectState().find((project) => project.id === this.activeProjectId()),
  );
  readonly activeDatabase = computed(() =>
    this.databases().find((database) => database.id === this.activeDatabaseId()),
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
    effect(() => {
      const scrape = this.downloader.scrapeProgress();
      if (!scrape) {
        if (this.progress()?.message.startsWith('Importing provider data')) {
          this.progress.set(undefined);
        }
        return;
      }
      const detail = scrape.currentTeam ? `: ${scrape.currentTeam}` : '';
      this.progress.set({
        operation: 'import',
        message: `Importing provider data ${scrape.completed}/${scrape.total}${detail}`,
      });
    });
  }

  async refreshProjects(): Promise<void> {
    await this.run(async () => this.applyProjects(await this.desktop.listProjects()));
  }

  async refreshDatabases(projectId: string): Promise<void> {
    this.activeProjectId.set(projectId);
    await this.run(() => this.loadDatabases(projectId, true));
  }

  async refreshTables(databaseId: string): Promise<void> {
    this.activeDatabaseId.set(databaseId);
    await this.run(() => this.loadTables(databaseId, true));
  }

  async ensureDatabases(projectId: string, force = false): Promise<void> {
    try {
      await this.loadDatabases(projectId, force);
    } catch {
      // Branch state exposes the error and provides retry context.
    }
  }

  async ensureTables(databaseId: string, force = false): Promise<void> {
    try {
      await this.loadTables(databaseId, force);
    } catch {
      // Branch state exposes the error and provides retry context.
    }
  }

  databasesFor(projectId: string): DatabaseDescriptor[] {
    return this.databaseState().get(projectId) ?? [];
  }

  tablesFor(databaseId: string): TableDescriptor[] {
    return this.tableState().get(databaseId) ?? [];
  }

  databaseLoadState(projectId: string): BranchLoadState {
    return this.databaseBranchState().get(projectId) ?? idleBranchState;
  }

  tableLoadState(databaseId: string): BranchLoadState {
    return this.tableBranchState().get(databaseId) ?? idleBranchState;
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
    const scrape = this.downloader.scrapeProgress();
    if (scrape) {
      await this.downloader.cancelScrape(scrape.jobId);
      return;
    }
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

  private applyProjects(projects: ProjectDescriptor[]): void {
    const projectIds = new Set(projects.map((project) => project.id));
    const databases = new Map(
      [...this.databaseState()].filter(([projectId]) => projectIds.has(projectId)),
    );
    const databaseIds = new Set(
      [...databases.values()].flatMap((items) => items.map((database) => database.id)),
    );

    this.projectState.set(projects);
    this.databaseState.set(databases);
    this.tableState.set(
      new Map([...this.tableState()].filter(([databaseId]) => databaseIds.has(databaseId))),
    );
    this.databaseBranchState.set(
      new Map([...this.databaseBranchState()].filter(([projectId]) => projectIds.has(projectId))),
    );
    this.tableBranchState.set(
      new Map([...this.tableBranchState()].filter(([databaseId]) => databaseIds.has(databaseId))),
    );
    if (this.activeProjectId() && !projectIds.has(this.activeProjectId())) {
      this.activeProjectId.set('');
      this.activeDatabaseId.set('');
    }
  }

  private loadDatabases(projectId: string, force: boolean): Promise<void> {
    if (!force && this.databaseLoadState(projectId).status === 'loaded') return Promise.resolve();
    const pending = this.databaseLoads.get(projectId);
    if (pending) return pending;

    const load = this.fetchDatabases(projectId).finally(() => this.databaseLoads.delete(projectId));
    this.databaseLoads.set(projectId, load);
    return load;
  }

  private async fetchDatabases(projectId: string): Promise<void> {
    this.setDatabaseBranchState(projectId, { status: 'loading', error: '' });
    try {
      const databases = await this.desktop.listDatabases(projectId);
      const previousIds = new Set(
        (this.databaseState().get(projectId) ?? []).map((database) => database.id),
      );
      const nextIds = new Set(databases.map((database) => database.id));
      const nextDatabaseState = new Map(this.databaseState());
      nextDatabaseState.set(projectId, databases);
      this.databaseState.set(nextDatabaseState);

      for (const databaseId of previousIds) {
        if (nextIds.has(databaseId)) continue;
        const nextTableState = new Map(this.tableState());
        nextTableState.delete(databaseId);
        this.tableState.set(nextTableState);
        const nextBranchState = new Map(this.tableBranchState());
        nextBranchState.delete(databaseId);
        this.tableBranchState.set(nextBranchState);
      }
      if (
        this.activeProjectId() === projectId &&
        this.activeDatabaseId() &&
        !nextIds.has(this.activeDatabaseId())
      )
        this.activeDatabaseId.set('');
      this.setDatabaseBranchState(projectId, { status: 'loaded', error: '' });
    } catch (error) {
      this.setDatabaseBranchState(projectId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private loadTables(databaseId: string, force: boolean): Promise<void> {
    if (!force && this.tableLoadState(databaseId).status === 'loaded') return Promise.resolve();
    const pending = this.tableLoads.get(databaseId);
    if (pending) return pending;

    const load = this.fetchTables(databaseId).finally(() => this.tableLoads.delete(databaseId));
    this.tableLoads.set(databaseId, load);
    return load;
  }

  private async fetchTables(databaseId: string): Promise<void> {
    this.setTableBranchState(databaseId, { status: 'loading', error: '' });
    try {
      const tables = await this.desktop.listTables(databaseId);
      const nextTableState = new Map(this.tableState());
      nextTableState.set(databaseId, tables);
      this.tableState.set(nextTableState);
      this.setTableBranchState(databaseId, { status: 'loaded', error: '' });
    } catch (error) {
      this.setTableBranchState(databaseId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private setDatabaseBranchState(projectId: string, state: BranchLoadState): void {
    const next = new Map(this.databaseBranchState());
    next.set(projectId, state);
    this.databaseBranchState.set(next);
  }

  private setTableBranchState(databaseId: string, state: BranchLoadState): void {
    const next = new Map(this.tableBranchState());
    next.set(databaseId, state);
    this.tableBranchState.set(next);
  }
}
