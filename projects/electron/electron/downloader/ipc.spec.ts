import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  CreateCustomBadgeRequest,
  ExportConfigurationPreference,
  ExportFieldNamePresetPreference,
  ExportVisibilityPresetPreference,
  UpdateCustomBadgeRequest,
} from '../../shared/downloader/contracts.js';
import type { SnapshotDatabase } from './database.js';
import type { SnapshotExporter } from './exporter.js';
import type { SoccerbotScraper } from './scraper.js';
import {
  camelCaseExportFieldNames,
  defaultExportColumns,
} from '../../shared/downloader/export-schema.js';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  send: vi.fn(),
  openPath: vi.fn(() => Promise.resolve('')),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: () => ({ isDestroyed: () => false, webContents: { send: electron.send } }),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      electron.handlers.set(channel, handler),
  },
}));

import { channels, registerIpcHandlers } from './ipc.js';

const invoke = (channel: string, input?: unknown): Promise<unknown> => {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler for ${channel}`);
  return Promise.resolve(handler({ sender: {} }, input));
};

describe('Electron IPC handlers', () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
  });

  test('registers the complete API and forwards progress to the requesting renderer', async () => {
    const listCustomBadges = vi.fn(() => []);
    const createCustomBadge = vi.fn((request: CreateCustomBadgeRequest) => ({
      id: 'badge',
      ...request,
      assignmentCount: 0,
    }));
    const updateCustomBadge = vi.fn((request: UpdateCustomBadgeRequest) => ({
      ...request,
      assignmentCount: 0,
    }));
    const deleteCustomBadge = vi.fn((id) => ({ id, deletedAssignmentCount: 0 }));
    const updateEntityCustomBadges = vi.fn(() => ({ updatedEntityCount: 1 }));
    const listCombinedCustomBadges = vi.fn(() => []);
    const createCombinedCustomBadge = vi.fn((request: CreateCustomBadgeRequest) => ({
      id: 'combined-badge',
      ...request,
      assignmentCount: 0,
    }));
    const updateCombinedCustomBadge = vi.fn((request: UpdateCustomBadgeRequest) => ({
      ...request,
      assignmentCount: 0,
    }));
    const deleteCombinedCustomBadge = vi.fn((id) => ({ id, deletedAssignmentCount: 0 }));
    const updateCombinedEntityCustomBadges = vi.fn(() => ({ updatedEntityCount: 1 }));
    const listProjects = vi.fn(() => []);
    const renameProject = vi.fn(() => ({ id: 'project', name: 'Renamed' }));
    const deleteProject = vi.fn(() => ({ id: 'project' }));
    const deleteAllProjects = vi.fn(() => ['project', 'second-project']);
    const deleteLeague = vi.fn(() => ({ id: 'project', leagueCount: 0 }));
    const deleteLeagues = vi.fn(() => ({ id: 'project', leagueCount: 0 }));
    const updateLeagueCountries = vi.fn(() => ({ id: 'project', leagueCount: 2 }));
    const updateLeagueTiers = vi.fn(() => ({ id: 'project', leagueCount: 2 }));
    const deleteTeam = vi.fn(() => ({ id: 'project', teamCount: 0, playerCount: 0 }));
    const deleteTeams = vi.fn(() => ({ id: 'project', teamCount: 0, playerCount: 0 }));
    const updateTeamCountries = vi.fn(() => ({ id: 'project', teamCount: 2 }));
    const deletePlayer = vi.fn(() => ({ id: 'project', playerCount: 1 }));
    const deletePlayers = vi.fn(() => ({ id: 'project', playerCount: 0 }));
    const deleteCombinedLeagues = vi.fn(() => ({
      id: 'project',
      combinedLeagueCount: 0,
    }));
    const deleteCombinedTeams = vi.fn(() => ({ id: 'project', combinedTeamCount: 0 }));
    const deleteCombinedPlayers = vi.fn(() => ({ id: 'project', combinedPlayerCount: 0 }));
    const deleteSourceData = vi.fn(() => ({
      project: { id: 'project', leagueCount: 0, teamCount: 0, playerCount: 0 },
      deleted: { leagues: 1, teams: 2, players: 3 },
    }));
    const previewSourceDataDeletion = vi.fn(() => ({ leagues: 1, teams: 2, players: 3 }));
    const getEntity = vi.fn(() => ({ id: 'team', name: 'Team' }));
    const updateEntityMetadata = vi.fn(() => ({ id: 'team', name: 'Team' }));
    const listEntityFilterOptions = vi.fn(() => ({
      entity: 'leagues',
      sourceNames: ['transfermarkt', 'soccerway'],
      countries: [],
      seasons: ['2026'],
    }));
    const listCombinedEntityFilterOptions = vi.fn(() => ({
      entity: 'leagues',
      countries: [],
      seasons: ['2026'],
      tiers: [1],
      hasLeaguesWithoutTier: false,
    }));
    const previewImportChanges = vi.fn(() => ({
      changes: {
        leagues: { added: 0, updated: 1, preserved: 0, deleted: 0 },
        teams: { added: 0, updated: 0, preserved: 0, moved: 0, detached: 0, deleted: 0 },
        players: {
          added: 0,
          updated: 0,
          preserved: 0,
          moved: 0,
          deduplicated: 0,
          deleted: 0,
        },
      },
      conflicts: {
        existingRecords: [],
        teamLeagueConflicts: [],
        playerTeamConflicts: [],
      },
    }));
    const getExportConfiguration = vi.fn(() => undefined);
    const updateExportConfiguration = vi.fn((configuration: ExportConfigurationPreference) =>
      structuredClone(configuration),
    );
    const database = {
      getExportVisibilityPresets: vi.fn(() => undefined),
      updateExportVisibilityPresets: vi.fn(
        (presets: ExportVisibilityPresetPreference[]) => presets,
      ),
      getExportFieldNamePresets: vi.fn(() => []),
      updateExportFieldNamePresets: vi.fn((presets: ExportFieldNamePresetPreference[]) => presets),
      getExportConfiguration,
      updateExportConfiguration,
      listCustomBadges,
      createCustomBadge,
      updateCustomBadge,
      deleteCustomBadge,
      updateEntityCustomBadges,
      listCombinedCustomBadges,
      createCombinedCustomBadge,
      updateCombinedCustomBadge,
      deleteCombinedCustomBadge,
      updateCombinedEntityCustomBadges,
      listProjects,
      renameProject,
      deleteProject,
      deleteAllProjects,
      deleteLeague,
      deleteLeagues,
      updateLeagueCountries,
      updateLeagueTiers,
      deleteTeam,
      deleteTeams,
      updateTeamCountries,
      deletePlayer,
      deletePlayers,
      deleteCombinedLeagues,
      deleteCombinedTeams,
      deleteCombinedPlayers,
      previewSourceDataDeletion,
      deleteSourceData,
      getProjectSummary: vi.fn(() => ({ id: 'project' })),
      getEntity,
      updateEntityMetadata,
      listEntities: vi.fn(() => ({ rows: [], total: 0, pageIndex: 0, pageSize: 25 })),
      listEntityFilterOptions,
      listCombinedEntityFilterOptions,
      previewImportChanges,
      commitImport: vi.fn(() => ({ leagueCount: 0, teamCount: 1, playerCount: 0 })),
      getExportDestination: vi.fn(() => undefined),
      setExportDestination: vi.fn(),
    } as unknown as SnapshotDatabase;
    const previewLeague = vi.fn(() => ({ sourceId: 'GB1', sourceUrl: 'url', teams: [] }));
    const previewTeam = vi.fn(() => ({
      sourceId: '281',
      name: 'Team',
      sourceUrl: 'url',
      players: [],
    }));
    const previewTeams = vi.fn((_sourceName, _jobId, _teams, progress) => {
      progress({ jobId: 'job', completed: 1, total: 1, currentTeam: 'Team', canceled: false });
      return [];
    });
    const scraper = {
      previewLeague,
      previewTeam,
      previewTeams,
      cancel: vi.fn(() => true),
    } as unknown as SoccerbotScraper;
    const exporter = {
      chooseDirectory: vi.fn(() => undefined),
      export: vi.fn(() => undefined),
    } as unknown as SnapshotExporter;

    registerIpcHandlers({
      database,
      scraper,
      exporter,
      shell: { openPath: electron.openPath } as never,
      directoryExists: vi.fn(() => Promise.resolve(true)),
      removeExportDirectory: vi.fn(() => Promise.resolve()),
    });

    expect(electron.handlers.size).toBe(Object.keys(channels).length - 1);
    await invoke(channels.listCustomBadges);
    await invoke(channels.createCustomBadge, {
      name: 'Review',
      description: 'Needs review',
      color: 'purple',
    });
    await invoke(channels.updateCustomBadge, {
      id: 'badge',
      name: 'Reviewed',
      description: 'Reviewed manually',
      color: 'green',
    });
    await invoke(channels.deleteCustomBadge, { id: 'badge' });
    await invoke(channels.updateEntityCustomBadges, {
      projectId: 'project',
      entity: 'players',
      ids: ['player'],
      addBadgeIds: ['badge'],
      removeBadgeIds: [],
    });
    await invoke(channels.listCombinedCustomBadges);
    await invoke(channels.createCombinedCustomBadge, {
      name: 'Combined review',
      description: 'Needs combined review',
      color: 'purple',
    });
    await invoke(channels.updateCombinedCustomBadge, {
      id: 'combined-badge',
      name: 'Combined reviewed',
      description: 'Reviewed combined data',
      color: 'green',
    });
    await invoke(channels.deleteCombinedCustomBadge, { id: 'combined-badge' });
    await invoke(channels.updateCombinedEntityCustomBadges, {
      projectId: 'project',
      entity: 'players',
      ids: ['combined-player'],
      addBadgeIds: ['combined-badge'],
      removeBadgeIds: [],
    });
    await invoke(channels.listProjects);
    await invoke(channels.renameProject, { projectId: 'project', name: 'Renamed' });
    await invoke(channels.deleteProject, { projectId: 'project' });
    await invoke(channels.deleteAllProjects);
    await invoke(channels.deleteLeague, {
      projectId: 'project',
      id: 'league',
      mode: 'league-and-teams',
    });
    await invoke(channels.deleteLeagues, {
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      mode: 'league-only',
    });
    await invoke(channels.updateLeagueCountries, {
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      countryCode3: 'CZE',
    });
    await invoke(channels.updateLeagueTiers, {
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      tier: 4,
    });
    await invoke(channels.deleteTeam, { projectId: 'project', id: 'team' });
    await invoke(channels.deleteTeams, {
      projectId: 'project',
      ids: ['team-a', 'team-b'],
    });
    await invoke(channels.updateTeamCountries, {
      projectId: 'project',
      ids: ['team-a', 'team-b'],
      countryCode3: 'CZE',
    });
    await invoke(channels.deletePlayer, { projectId: 'project', id: 'player' });
    await invoke(channels.deletePlayers, {
      projectId: 'project',
      ids: ['player-a', 'player-b'],
    });
    await invoke(channels.deleteCombinedLeagues, {
      projectId: 'project',
      ids: ['combined-league-a', 'combined-league-b'],
      cascade: true,
    });
    await invoke(channels.deleteCombinedTeams, {
      projectId: 'project',
      ids: ['combined-team-a', 'combined-team-b'],
    });
    await invoke(channels.deleteCombinedPlayers, {
      projectId: 'project',
      ids: ['combined-player-a', 'combined-player-b'],
    });
    await invoke(channels.previewSourceDataDeletion, {
      projectId: 'project',
      sourceNames: ['transfermarkt', 'soccerway'],
    });
    await invoke(channels.deleteSourceData, {
      projectId: 'project',
      sourceNames: ['transfermarkt', 'soccerway'],
    });
    await invoke(channels.getEntity, { projectId: 'project', entity: 'teams', id: 'team' });
    await invoke(channels.updateEntityMetadata, {
      projectId: 'project',
      entity: 'teams',
      id: 'team',
      name: 'Team',
      sourceId: '281',
      countryCode3: 'ENG',
    });
    await invoke(channels.listEntityFilterOptions, {
      projectId: 'project',
      entity: 'leagues',
    });
    await invoke(channels.listCombinedEntityFilterOptions, {
      projectId: 'project',
      entity: 'leagues',
    });
    const importRequest = {
      projectId: 'project',
      sourceName: 'soccerway',
      operation: {
        kind: 'synchronize',
        target: { entity: 'leagues', id: 'league' },
        options: {
          absentTeams: 'keep',
          absentPlayers: 'keep',
          overrideTeamNames: false,
          overridePlayerNames: false,
          teamLeagueConflicts: 'move',
          playerTeamConflicts: 'move',
        },
      },
      teams: [],
    };
    const previewLeagueRequest = {
      sourceName: 'soccerway',
      identifierOrUrl: 'czech-republic/chance-liga/standings/bNFMkskm',
    };
    const previewTeamRequest = {
      sourceName: 'soccerway',
      identifierOrUrl: 'slavia-prague/viXGgnyB',
      name: 'Slavia Prague',
    };
    await invoke(channels.previewLeague, previewLeagueRequest);
    await invoke(channels.previewTeam, previewTeamRequest);
    await invoke(channels.previewImportChanges, importRequest);
    await invoke(channels.previewTeams, { sourceName: 'soccerway', jobId: 'job', teams: [] });
    await invoke(channels.getExportVisibilityPresets);
    await invoke(channels.updateExportVisibilityPresets, { presets: [] });
    await invoke(channels.getExportFieldNamePresets);
    await invoke(channels.updateExportFieldNamePresets, { presets: [] });
    const exportConfiguration = {
      dataset: 'combined' as const,
      format: 'csv' as const,
      columns: defaultExportColumns(),
      fieldNames: camelCaseExportFieldNames(),
    };
    await invoke(channels.getExportConfiguration);
    await invoke(channels.updateExportConfiguration, { configuration: exportConfiguration });
    await invoke(channels.getExportDestination);
    expect(getExportConfiguration).toHaveBeenCalledOnce();
    expect(updateExportConfiguration).toHaveBeenCalledWith(exportConfiguration);
    expect(listProjects).toHaveBeenCalledOnce();
    expect(listCustomBadges).toHaveBeenCalledOnce();
    expect(listCombinedCustomBadges).toHaveBeenCalledOnce();
    expect(deleteCustomBadge).toHaveBeenCalledWith('badge');
    expect(deleteCombinedCustomBadge).toHaveBeenCalledWith('combined-badge');
    expect(renameProject).toHaveBeenCalledWith({ projectId: 'project', name: 'Renamed' });
    expect(deleteProject).toHaveBeenCalledWith('project');
    expect(deleteAllProjects).toHaveBeenCalledOnce();
    expect(deleteLeague).toHaveBeenCalledWith({
      projectId: 'project',
      id: 'league',
      mode: 'league-and-teams',
    });
    expect(deleteLeagues).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      mode: 'league-only',
    });
    expect(updateLeagueCountries).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      countryCode3: 'CZE',
    });
    expect(updateLeagueTiers).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['league-a', 'league-b'],
      tier: 4,
    });
    expect(deleteTeam).toHaveBeenCalledWith({ projectId: 'project', id: 'team' });
    expect(deleteTeams).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['team-a', 'team-b'],
    });
    expect(updateTeamCountries).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['team-a', 'team-b'],
      countryCode3: 'CZE',
    });
    expect(deletePlayer).toHaveBeenCalledWith({ projectId: 'project', id: 'player' });
    expect(deletePlayers).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['player-a', 'player-b'],
    });
    expect(deleteCombinedLeagues).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['combined-league-a', 'combined-league-b'],
      cascade: true,
    });
    expect(deleteCombinedTeams).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['combined-team-a', 'combined-team-b'],
    });
    expect(deleteCombinedPlayers).toHaveBeenCalledWith({
      projectId: 'project',
      ids: ['combined-player-a', 'combined-player-b'],
    });
    expect(previewSourceDataDeletion).toHaveBeenCalledWith({
      projectId: 'project',
      sourceNames: ['transfermarkt', 'soccerway'],
    });
    expect(deleteSourceData).toHaveBeenCalledWith({
      projectId: 'project',
      sourceNames: ['transfermarkt', 'soccerway'],
    });
    expect(getEntity).toHaveBeenCalledWith({
      projectId: 'project',
      entity: 'teams',
      id: 'team',
    });
    expect(updateEntityMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team', sourceId: '281', countryCode3: 'ENG' }),
    );
    expect(listEntityFilterOptions).toHaveBeenCalledWith({
      projectId: 'project',
      entity: 'leagues',
    });
    expect(listCombinedEntityFilterOptions).toHaveBeenCalledWith({
      projectId: 'project',
      entity: 'leagues',
    });
    expect(previewImportChanges).toHaveBeenCalledWith(importRequest);
    expect(previewLeague).toHaveBeenCalledWith(previewLeagueRequest);
    expect(previewTeam).toHaveBeenCalledWith(previewTeamRequest);
    expect(previewTeams).toHaveBeenCalledWith('soccerway', 'job', [], expect.any(Function));
    expect(electron.send).toHaveBeenCalledWith(
      channels.scrapeProgress,
      expect.objectContaining({ jobId: 'job', completed: 1 }),
    );
  });

  test('restores, approves, and updates an available export destination', async () => {
    const getExportDestination = vi.fn(() => '/tmp/remembered');
    const setExportDestination = vi.fn();
    const database = {
      getExportDestination,
      setExportDestination,
      getProjectSummary: vi.fn(() => ({ id: 'project' })),
    } as unknown as SnapshotDatabase;
    const chooseDirectory = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('/tmp/new-destination');
    const exportProject = vi.fn(() => ({
      directory: '/tmp/remembered/snapshot',
      files: ['/tmp/remembered/snapshot/leagues.json'],
    }));
    registerIpcHandlers({
      database,
      scraper: {} as SoccerbotScraper,
      exporter: { chooseDirectory, export: exportProject } as unknown as SnapshotExporter,
      shell: { openPath: electron.openPath } as never,
      directoryExists: vi.fn(() => Promise.resolve(true)),
      removeExportDirectory: vi.fn(() => Promise.resolve()),
    });
    const request = {
      projectId: 'project',
      format: 'json' as const,
      columns: defaultExportColumns(),
      fieldNames: camelCaseExportFieldNames(),
      destination: '/tmp/remembered',
      includeTeamsWithoutLeague: true,
      leagueIds: ['league'],
    };

    await expect(invoke(channels.getExportDestination)).resolves.toEqual({
      ok: true,
      value: '/tmp/remembered',
    });
    await expect(invoke(channels.exportProject, request)).resolves.toMatchObject({ ok: true });
    await expect(invoke(channels.chooseExportDirectory)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(invoke(channels.chooseExportDirectory)).resolves.toEqual({
      ok: true,
      value: '/tmp/new-destination',
    });

    expect(chooseDirectory).toHaveBeenNthCalledWith(1, '/tmp/remembered');
    expect(chooseDirectory).toHaveBeenNthCalledWith(2, '/tmp/remembered');
    expect(setExportDestination).toHaveBeenCalledOnce();
    expect(setExportDestination).toHaveBeenCalledWith('/tmp/new-destination');
    expect(exportProject).toHaveBeenCalledOnce();
  });

  test('does not restore or approve an unavailable export destination', async () => {
    const setExportDestination = vi.fn();
    const database = {
      getExportDestination: vi.fn(() => '/tmp/unavailable'),
      setExportDestination,
      getProjectSummary: vi.fn(() => ({ id: 'project' })),
    } as unknown as SnapshotDatabase;
    const chooseDirectory = vi.fn(() => undefined);
    registerIpcHandlers({
      database,
      scraper: {} as SoccerbotScraper,
      exporter: { chooseDirectory, export: vi.fn() } as unknown as SnapshotExporter,
      shell: { openPath: electron.openPath } as never,
      directoryExists: vi.fn(() => Promise.resolve(false)),
      removeExportDirectory: vi.fn(() => Promise.resolve()),
    });
    const request = {
      projectId: 'project',
      format: 'json' as const,
      columns: defaultExportColumns(),
      fieldNames: camelCaseExportFieldNames(),
      destination: '/tmp/unavailable',
      includeTeamsWithoutLeague: true,
      leagueIds: ['league'],
    };

    await expect(invoke(channels.getExportDestination)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(invoke(channels.exportProject, request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await invoke(channels.chooseExportDirectory);

    expect(chooseDirectory).toHaveBeenCalledWith(undefined);
    expect(setExportDestination).not.toHaveBeenCalled();
  });

  test('cleans known project exports, reports failures, and keeps failed folders accessible', async () => {
    const deleteProject = vi.fn(() => ({ id: 'project' }));
    const deleteAllProjects = vi.fn(() => ['other-project', 'bulk-failed-project']);
    const database = {
      listProjects: vi.fn(() => {
        throw new Error('database failed');
      }),
      getProjectSummary: vi.fn(() => ({ id: 'project' })),
      getExportDestination: vi.fn(() => undefined),
      setExportDestination: vi.fn(),
      deleteProject,
      deleteAllProjects,
    } as unknown as SnapshotDatabase;
    const scraper = {} as SoccerbotScraper;
    const exportProject = vi
      .fn()
      .mockResolvedValueOnce({
        directory: '/tmp/export',
        files: ['/tmp/export/leagues.json'],
      })
      .mockResolvedValueOnce({
        directory: '/tmp/export',
        files: ['/tmp/export/snapshot.json'],
      })
      .mockResolvedValueOnce({
        directory: '/tmp/export-failed',
        files: ['/tmp/export-failed/leagues.json'],
      })
      .mockResolvedValueOnce({
        directory: '/tmp/other-export',
        files: ['/tmp/other-export/leagues.json'],
      })
      .mockResolvedValueOnce({
        directory: '/tmp/bulk-failed',
        files: ['/tmp/bulk-failed/leagues.json'],
      });
    const exporter = {
      chooseDirectory: vi.fn(() => '/tmp/destination'),
      export: exportProject,
    } as unknown as SnapshotExporter;
    const removeExportDirectory = vi.fn((directory: string) =>
      directory.endsWith('failed')
        ? Promise.reject(new Error('folder is locked'))
        : Promise.resolve(),
    );
    registerIpcHandlers({
      database,
      scraper,
      exporter,
      shell: { openPath: electron.openPath } as never,
      directoryExists: vi.fn(() => Promise.resolve(true)),
      removeExportDirectory,
    });

    await expect(invoke(channels.listProjects)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATABASE' },
    });
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/not-exported' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const exportRequest = {
      projectId: 'project',
      format: 'json' as const,
      columns: defaultExportColumns(),
      fieldNames: camelCaseExportFieldNames(),
      destination: '/tmp/destination',
      includeTeamsWithoutLeague: true,
      leagueIds: ['league'],
    };
    await expect(invoke(channels.exportProject, exportRequest)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await invoke(channels.chooseExportDirectory);
    await invoke(channels.exportProject, exportRequest);
    await invoke(channels.exportProject, { ...exportRequest, format: 'single-json' });
    await invoke(channels.exportProject, { ...exportRequest, format: 'csv' });
    await invoke(channels.exportProject, {
      ...exportRequest,
      projectId: 'other-project',
      format: 'json',
    });
    await invoke(channels.exportProject, {
      ...exportRequest,
      projectId: 'bulk-failed-project',
      format: 'single-json',
    });
    await expect(
      invoke(channels.exportProject, { ...exportRequest, format: 'xml' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Choose a valid export format.' },
    });
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/export' }),
    ).resolves.toEqual({ ok: true, value: true });
    await expect(invoke(channels.deleteProject, { projectId: 'project' })).resolves.toEqual({
      ok: true,
      value: {
        projectId: 'project',
        deletedExportCount: 1,
        failedExportDirectories: ['/tmp/export-failed'],
      },
    });
    expect(deleteProject).toHaveBeenCalledWith('project');
    expect(exportProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project' }),
      expect.objectContaining({ format: 'single-json' }),
    );
    expect(exportProject).toHaveBeenCalledTimes(5);
    expect(removeExportDirectory).toHaveBeenCalledWith('/tmp/export');
    expect(removeExportDirectory).toHaveBeenCalledWith('/tmp/export-failed');
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/export' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/export-failed' }),
    ).resolves.toEqual({ ok: true, value: true });
    await expect(invoke(channels.deleteAllProjects)).resolves.toEqual({
      ok: true,
      value: {
        deletedProjectCount: 2,
        deletedExportCount: 1,
        failedExportDirectories: ['/tmp/bulk-failed'],
      },
    });
    expect(deleteAllProjects).toHaveBeenCalledOnce();
    expect(removeExportDirectory).toHaveBeenCalledWith('/tmp/other-export');
    expect(removeExportDirectory).toHaveBeenCalledWith('/tmp/bulk-failed');
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/other-export' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/export-failed' }),
    ).resolves.toEqual({ ok: true, value: true });
    await expect(
      invoke(channels.openExportDirectory, { directory: '/tmp/bulk-failed' }),
    ).resolves.toEqual({ ok: true, value: true });
  });
});
