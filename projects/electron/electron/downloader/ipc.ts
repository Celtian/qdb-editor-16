import { BrowserWindow, type IpcMainInvokeEvent, ipcMain, type shell } from 'electron';

import type {
  ExportFormat,
  ExportResult,
  QdbDesktopApi,
  Result,
  ScrapeProgress,
} from '../../shared/downloader/contracts.js';
import type { SnapshotDatabase } from './database.js';
import { success, wrap } from './errors.js';
import type { SnapshotExporter } from './exporter.js';
import type { SoccerbotScraper } from './scraper.js';

interface IpcDependencies {
  database: SnapshotDatabase;
  scraper: SoccerbotScraper;
  exporter: SnapshotExporter;
  shell: typeof shell;
  directoryExists: (directory: string) => Promise<boolean>;
  removeExportDirectory: (directory: string) => Promise<void>;
  exportedDirectories?: Map<string, string>;
  projectLifecycle?: {
    createProject: (
      input: Parameters<QdbDesktopApi['createProject']>[0],
    ) => ReturnType<SnapshotDatabase['createProject']>;
    renameProject: (
      request: Parameters<QdbDesktopApi['renameProject']>[0],
    ) => ReturnType<SnapshotDatabase['renameProject']>;
    deleteProject: (projectId: string) => void;
    deleteAllProjects: () => string[];
  };
}

const channels = {
  getSourcePriority: 'qdb:preferences:source-priority:get',
  updateSourcePriority: 'qdb:preferences:source-priority:update',
  getExportVisibilityPresets: 'qdb:preferences:export-visibility-presets:get',
  updateExportVisibilityPresets: 'qdb:preferences:export-visibility-presets:update',
  getExportFieldNamePresets: 'qdb:preferences:export-field-name-presets:get',
  updateExportFieldNamePresets: 'qdb:preferences:export-field-name-presets:update',
  getExportConfiguration: 'qdb:preferences:export-configuration:get',
  updateExportConfiguration: 'qdb:preferences:export-configuration:update',
  listCustomBadges: 'qdb:custom-badges:list',
  createCustomBadge: 'qdb:custom-badges:create',
  updateCustomBadge: 'qdb:custom-badges:update',
  deleteCustomBadge: 'qdb:custom-badges:delete',
  updateEntityCustomBadges: 'qdb:custom-badges:update-entities',
  listCombinedCustomBadges: 'qdb:combined-custom-badges:list',
  createCombinedCustomBadge: 'qdb:combined-custom-badges:create',
  updateCombinedCustomBadge: 'qdb:combined-custom-badges:update',
  deleteCombinedCustomBadge: 'qdb:combined-custom-badges:delete',
  updateCombinedEntityCustomBadges: 'qdb:combined-custom-badges:update-entities',
  listProjects: 'qdb:projects:list',
  createProject: 'qdb:projects:create',
  renameProject: 'qdb:projects:rename',
  deleteProject: 'qdb:projects:delete',
  deleteAllProjects: 'qdb:projects:delete-all',
  deleteLeague: 'qdb:leagues:delete',
  deleteLeagues: 'qdb:leagues:delete-many',
  updateLeagueCountries: 'qdb:leagues:update-country-many',
  updateLeagueTiers: 'qdb:leagues:update-tier-many',
  deleteTeam: 'qdb:teams:delete',
  deleteTeams: 'qdb:teams:delete-many',
  updateTeamCountries: 'qdb:teams:update-country-many',
  deletePlayer: 'qdb:players:delete',
  deletePlayers: 'qdb:players:delete-many',
  previewSourceDataDeletion: 'qdb:data:preview-delete-sources',
  deleteSourceData: 'qdb:data:delete-sources',
  getProjectSummary: 'qdb:projects:summary',
  getEntity: 'qdb:entities:get',
  updateEntityMetadata: 'qdb:entities:update-metadata',
  listEntities: 'qdb:entities:list',
  listEntityFilterOptions: 'qdb:entities:filter-options',
  listCombinedEntityFilterOptions: 'qdb:combined:filter-options',
  listCombinedEntities: 'qdb:combined:list',
  listCombineTeamCandidates: 'qdb:combined:team-candidates',
  previewTeamCombination: 'qdb:combined:preview-team',
  commitTeamCombination: 'qdb:combined:commit-team',
  deleteCombinedEntity: 'qdb:combined:delete',
  deleteCombinedLeagues: 'qdb:combined:leagues:delete-many',
  deleteCombinedTeams: 'qdb:combined:teams:delete-many',
  deleteCombinedPlayers: 'qdb:combined:players:delete-many',
  previewLeague: 'qdb:scrape:league',
  previewTeam: 'qdb:scrape:team',
  previewTeams: 'qdb:scrape:teams',
  cancelScrape: 'qdb:scrape:cancel',
  previewImportChanges: 'qdb:import:preview-changes',
  commitImport: 'qdb:import:commit',
  getExportDestination: 'qdb:export:get-destination',
  chooseExportDirectory: 'qdb:export:choose-directory',
  exportProject: 'qdb:export:project',
  openExportDirectory: 'qdb:export:open-directory',
  scrapeProgress: 'qdb:scrape:progress',
} as const;
const exportFormats = new Set<ExportFormat>(['json', 'single-json', 'csv']);

const sendProgress = (event: IpcMainInvokeEvent, progress: ScrapeProgress): void => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) window.webContents.send(channels.scrapeProgress, progress);
};

export const registerIpcHandlers = ({
  database,
  scraper,
  exporter,
  shell,
  directoryExists,
  removeExportDirectory,
  exportedDirectories: sharedExportedDirectories,
  projectLifecycle,
}: IpcDependencies): void => {
  const exportedDirectories = sharedExportedDirectories ?? new Map<string, string>();
  const approvedExportDestinations = new Set<string>();
  const getAvailableExportDestination = async (): Promise<string | undefined> => {
    const destination = database.getExportDestination();
    if (!destination) return undefined;
    try {
      return (await directoryExists(destination)) ? destination : undefined;
    } catch {
      return undefined;
    }
  };
  ipcMain.handle(channels.getSourcePriority, () => wrap(() => database.getSourcePriority()));
  ipcMain.handle(
    channels.updateSourcePriority,
    (_event, { sourceNames }: Parameters<QdbDesktopApi['updateSourcePriority']>[0]) =>
      wrap(() => database.updateSourcePriority(sourceNames)),
  );
  ipcMain.handle(channels.getExportVisibilityPresets, () =>
    wrap(() => database.getExportVisibilityPresets()),
  );
  ipcMain.handle(
    channels.updateExportVisibilityPresets,
    (_event, { presets }: Parameters<QdbDesktopApi['updateExportVisibilityPresets']>[0]) =>
      wrap(() => database.updateExportVisibilityPresets(presets)),
  );
  ipcMain.handle(channels.getExportFieldNamePresets, () =>
    wrap(() => database.getExportFieldNamePresets()),
  );
  ipcMain.handle(
    channels.updateExportFieldNamePresets,
    (_event, { presets }: Parameters<QdbDesktopApi['updateExportFieldNamePresets']>[0]) =>
      wrap(() => database.updateExportFieldNamePresets(presets)),
  );
  ipcMain.handle(channels.getExportConfiguration, () =>
    wrap(() => database.getExportConfiguration()),
  );
  ipcMain.handle(
    channels.updateExportConfiguration,
    (_event, { configuration }: Parameters<QdbDesktopApi['updateExportConfiguration']>[0]) =>
      wrap(() => database.updateExportConfiguration(configuration)),
  );
  const removeProjectExports = async (
    projectIds: ReadonlySet<string>,
  ): Promise<{ deletedExportCount: number; failedExportDirectories: string[] }> => {
    const directories = [...exportedDirectories.entries()]
      .filter(([, projectId]) => projectIds.has(projectId))
      .map(([directory]) => directory);
    const cleanup = await Promise.all(
      directories.map(async (directory) => {
        try {
          await removeExportDirectory(directory);
          exportedDirectories.delete(directory);
          return undefined;
        } catch {
          return directory;
        }
      }),
    );
    return {
      deletedExportCount: cleanup.filter((directory) => !directory).length,
      failedExportDirectories: cleanup.filter((directory): directory is string =>
        Boolean(directory),
      ),
    };
  };
  ipcMain.handle(channels.listCustomBadges, () => wrap(() => database.listCustomBadges()));
  ipcMain.handle(
    channels.createCustomBadge,
    (_event, request: Parameters<QdbDesktopApi['createCustomBadge']>[0]) =>
      wrap(() => database.createCustomBadge(request)),
  );
  ipcMain.handle(
    channels.updateCustomBadge,
    (_event, request: Parameters<QdbDesktopApi['updateCustomBadge']>[0]) =>
      wrap(() => database.updateCustomBadge(request)),
  );
  ipcMain.handle(
    channels.deleteCustomBadge,
    (_event, { id }: Parameters<QdbDesktopApi['deleteCustomBadge']>[0]) =>
      wrap(() => database.deleteCustomBadge(id)),
  );
  ipcMain.handle(
    channels.updateEntityCustomBadges,
    (_event, request: Parameters<QdbDesktopApi['updateEntityCustomBadges']>[0]) =>
      wrap(() => database.updateEntityCustomBadges(request)),
  );
  ipcMain.handle(channels.listCombinedCustomBadges, () =>
    wrap(() => database.listCombinedCustomBadges()),
  );
  ipcMain.handle(
    channels.createCombinedCustomBadge,
    (_event, request: Parameters<QdbDesktopApi['createCombinedCustomBadge']>[0]) =>
      wrap(() => database.createCombinedCustomBadge(request)),
  );
  ipcMain.handle(
    channels.updateCombinedCustomBadge,
    (_event, request: Parameters<QdbDesktopApi['updateCombinedCustomBadge']>[0]) =>
      wrap(() => database.updateCombinedCustomBadge(request)),
  );
  ipcMain.handle(
    channels.deleteCombinedCustomBadge,
    (_event, { id }: Parameters<QdbDesktopApi['deleteCombinedCustomBadge']>[0]) =>
      wrap(() => database.deleteCombinedCustomBadge(id)),
  );
  ipcMain.handle(
    channels.updateCombinedEntityCustomBadges,
    (_event, request: Parameters<QdbDesktopApi['updateCombinedEntityCustomBadges']>[0]) =>
      wrap(() => database.updateCombinedEntityCustomBadges(request)),
  );
  ipcMain.handle(channels.listProjects, () => wrap(() => database.listProjects()));
  ipcMain.handle(
    channels.createProject,
    (_event, input: Parameters<QdbDesktopApi['createProject']>[0]) =>
      wrap(() =>
        projectLifecycle ? projectLifecycle.createProject(input) : database.createProject(input),
      ),
  );
  ipcMain.handle(
    channels.renameProject,
    (_event, request: Parameters<QdbDesktopApi['renameProject']>[0]) =>
      wrap(() =>
        projectLifecycle
          ? projectLifecycle.renameProject(request)
          : database.renameProject(request),
      ),
  );
  ipcMain.handle(
    channels.deleteProject,
    async (_event, { projectId }: Parameters<QdbDesktopApi['deleteProject']>[0]) =>
      wrap(async () => {
        if (projectLifecycle) projectLifecycle.deleteProject(projectId);
        else database.deleteProject(projectId);
        const cleanup = await removeProjectExports(new Set([projectId]));
        return {
          projectId,
          ...cleanup,
        };
      }),
  );
  ipcMain.handle(channels.deleteAllProjects, () =>
    wrap(async () => {
      const projectIds = projectLifecycle
        ? projectLifecycle.deleteAllProjects()
        : database.deleteAllProjects();
      const cleanup = await removeProjectExports(new Set(projectIds));
      return {
        deletedProjectCount: projectIds.length,
        ...cleanup,
      };
    }),
  );
  ipcMain.handle(
    channels.deleteLeague,
    (_event, request: Parameters<QdbDesktopApi['deleteLeague']>[0]) =>
      wrap(() => database.deleteLeague(request)),
  );
  ipcMain.handle(
    channels.deleteLeagues,
    (_event, request: Parameters<QdbDesktopApi['deleteLeagues']>[0]) =>
      wrap(() => database.deleteLeagues(request)),
  );
  ipcMain.handle(
    channels.updateLeagueCountries,
    (_event, request: Parameters<QdbDesktopApi['updateLeagueCountries']>[0]) =>
      wrap(() => database.updateLeagueCountries(request)),
  );
  ipcMain.handle(
    channels.updateLeagueTiers,
    (_event, request: Parameters<QdbDesktopApi['updateLeagueTiers']>[0]) =>
      wrap(() => database.updateLeagueTiers(request)),
  );
  ipcMain.handle(
    channels.deleteTeam,
    (_event, request: Parameters<QdbDesktopApi['deleteTeam']>[0]) =>
      wrap(() => database.deleteTeam(request)),
  );
  ipcMain.handle(
    channels.deleteTeams,
    (_event, request: Parameters<QdbDesktopApi['deleteTeams']>[0]) =>
      wrap(() => database.deleteTeams(request)),
  );
  ipcMain.handle(
    channels.updateTeamCountries,
    (_event, request: Parameters<QdbDesktopApi['updateTeamCountries']>[0]) =>
      wrap(() => database.updateTeamCountries(request)),
  );
  ipcMain.handle(
    channels.deletePlayer,
    (_event, request: Parameters<QdbDesktopApi['deletePlayer']>[0]) =>
      wrap(() => database.deletePlayer(request)),
  );
  ipcMain.handle(
    channels.deletePlayers,
    (_event, request: Parameters<QdbDesktopApi['deletePlayers']>[0]) =>
      wrap(() => database.deletePlayers(request)),
  );
  ipcMain.handle(
    channels.getProjectSummary,
    (_event, { projectId }: Parameters<QdbDesktopApi['getProjectSummary']>[0]) =>
      wrap(() => database.getProjectSummary(projectId)),
  );
  ipcMain.handle(channels.getEntity, (_event, request: Parameters<QdbDesktopApi['getEntity']>[0]) =>
    wrap(() => database.getEntity(request)),
  );
  ipcMain.handle(
    channels.updateEntityMetadata,
    (_event, request: Parameters<QdbDesktopApi['updateEntityMetadata']>[0]) =>
      wrap(() => database.updateEntityMetadata(request)),
  );
  ipcMain.handle(
    channels.listEntities,
    (_event, request: Parameters<QdbDesktopApi['listEntities']>[0]) =>
      wrap(() => database.listEntities(request)),
  );
  ipcMain.handle(
    channels.listEntityFilterOptions,
    (_event, request: Parameters<QdbDesktopApi['listEntityFilterOptions']>[0]) =>
      wrap(() => database.listEntityFilterOptions(request)),
  );
  ipcMain.handle(
    channels.listCombinedEntityFilterOptions,
    (_event, request: Parameters<QdbDesktopApi['listCombinedEntityFilterOptions']>[0]) =>
      wrap(() => database.listCombinedEntityFilterOptions(request)),
  );
  ipcMain.handle(
    channels.listCombinedEntities,
    (_event, request: Parameters<QdbDesktopApi['listCombinedEntities']>[0]) =>
      wrap(() => database.listCombinedEntities(request)),
  );
  ipcMain.handle(
    channels.listCombineTeamCandidates,
    (_event, request: Parameters<QdbDesktopApi['listCombineTeamCandidates']>[0]) =>
      wrap(() => database.listCombineTeamCandidates(request)),
  );
  ipcMain.handle(
    channels.previewTeamCombination,
    (_event, request: Parameters<QdbDesktopApi['previewTeamCombination']>[0]) =>
      wrap(() => database.previewTeamCombination(request)),
  );
  ipcMain.handle(
    channels.commitTeamCombination,
    (_event, request: Parameters<QdbDesktopApi['commitTeamCombination']>[0]) =>
      wrap(() => database.commitTeamCombination(request)),
  );
  ipcMain.handle(
    channels.deleteCombinedEntity,
    (_event, request: Parameters<QdbDesktopApi['deleteCombinedEntity']>[0]) =>
      wrap(() => database.deleteCombinedEntity(request)),
  );
  ipcMain.handle(
    channels.deleteCombinedLeagues,
    (_event, request: Parameters<QdbDesktopApi['deleteCombinedLeagues']>[0]) =>
      wrap(() => database.deleteCombinedLeagues(request)),
  );
  ipcMain.handle(
    channels.deleteCombinedTeams,
    (_event, request: Parameters<QdbDesktopApi['deleteCombinedTeams']>[0]) =>
      wrap(() => database.deleteCombinedTeams(request)),
  );
  ipcMain.handle(
    channels.deleteCombinedPlayers,
    (_event, request: Parameters<QdbDesktopApi['deleteCombinedPlayers']>[0]) =>
      wrap(() => database.deleteCombinedPlayers(request)),
  );
  ipcMain.handle(
    channels.previewLeague,
    (_event, request: Parameters<QdbDesktopApi['previewLeague']>[0]) =>
      wrap(() => scraper.previewLeague(request)),
  );
  ipcMain.handle(
    channels.previewTeam,
    (_event, request: Parameters<QdbDesktopApi['previewTeam']>[0]) =>
      wrap(() => scraper.previewTeam(request)),
  );
  ipcMain.handle(
    channels.previewTeams,
    (event, { sourceName, jobId, teams }: Parameters<QdbDesktopApi['previewTeams']>[0]) =>
      wrap(() =>
        scraper.previewTeams(sourceName, jobId, teams, (progress) => sendProgress(event, progress)),
      ),
  );
  ipcMain.handle(
    channels.previewSourceDataDeletion,
    (_event, request: Parameters<QdbDesktopApi['previewSourceDataDeletion']>[0]) =>
      wrap(() => database.previewSourceDataDeletion(request)),
  );
  ipcMain.handle(
    channels.deleteSourceData,
    (_event, request: Parameters<QdbDesktopApi['deleteSourceData']>[0]) =>
      wrap(() => database.deleteSourceData(request)),
  );
  ipcMain.handle(
    channels.cancelScrape,
    (_event, { jobId }: Parameters<QdbDesktopApi['cancelScrape']>[0]) =>
      Promise.resolve(success(scraper.cancel(jobId))),
  );
  ipcMain.handle(
    channels.previewImportChanges,
    (_event, request: Parameters<QdbDesktopApi['previewImportChanges']>[0]) =>
      wrap(() => database.previewImportChanges(request)),
  );
  ipcMain.handle(
    channels.commitImport,
    (_event, request: Parameters<QdbDesktopApi['commitImport']>[0]) =>
      wrap(() => database.commitImport(request)),
  );
  ipcMain.handle(channels.getExportDestination, () =>
    wrap(async () => {
      const destination = await getAvailableExportDestination();
      if (destination) approvedExportDestinations.add(destination);
      return destination;
    }),
  );
  ipcMain.handle(channels.chooseExportDirectory, () =>
    wrap(async () => {
      const defaultPath = await getAvailableExportDestination();
      const destination = await exporter.chooseDirectory(defaultPath);
      if (destination) {
        database.setExportDestination(destination);
        approvedExportDestinations.add(destination);
      }
      return destination;
    }),
  );
  ipcMain.handle(
    channels.exportProject,
    async (_event, request: Parameters<QdbDesktopApi['exportProject']>[0]) => {
      if (!exportFormats.has(request.format)) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'Choose a valid export format.' },
        } satisfies Result<ExportResult>;
      }
      if (!approvedExportDestinations.has(request.destination)) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'Choose an export folder first.' },
        } satisfies Result<ExportResult>;
      }
      const result = await wrap(() =>
        exporter.export(database.getProjectSummary(request.projectId), request),
      );
      if (result.ok) exportedDirectories.set(result.value.directory, request.projectId);
      return result;
    },
  );
  ipcMain.handle(
    channels.openExportDirectory,
    async (_event, { directory }: Parameters<QdbDesktopApi['openExportDirectory']>[0]) => {
      if (!exportedDirectories.has(directory)) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'Only an exported directory can be opened.' },
        } satisfies Result<boolean>;
      }
      return success((await shell.openPath(directory)) === '');
    },
  );
};

export { channels };
