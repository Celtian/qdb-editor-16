import { Service, signal } from '@angular/core';
import type {
  CommitImportRequest,
  CommitTeamCombinationRequest,
  CombineTeamCandidate,
  CombinedEntity,
  CombinedEntityFilterOptions,
  CombinedEntityFilterOptionsRequest,
  CombinedEntityKind,
  CombinedPageRequest,
  CreateCombinedCustomBadgeRequest,
  CreateCustomBadgeRequest,
  DeleteCombinedCustomBadgeResult,
  DeleteCombinedLeaguesRequest,
  DeleteCombinedPlayersRequest,
  DeleteCombinedTeamsRequest,
  DeleteCustomBadgeResult,
  DeleteAllProjectsResult,
  DeleteLeagueMode,
  DeleteLeaguesRequest,
  DeletePlayersRequest,
  DeleteProjectResult,
  DeleteSourceDataResult,
  DeleteTeamsRequest,
  EditableEntity,
  EditableEntityKind,
  Entity,
  EntityFilterOptions,
  EntityFilterOptionsRequest,
  ExportConfigurationPreference,
  ExportFieldNamePresetPreference,
  ExportRequest,
  ExportResult,
  ExportVisibilityPresetPreference,
  ImportResult,
  ImportPreview,
  LeaguePreview,
  Page,
  PageRequest,
  PreviewLeagueRequest,
  PreviewTeamRequest,
  PreviewTeamsRequest,
  ProjectSummary,
  QdbDesktopApi,
  Result,
  ScrapeProgress,
  SourceDataDeletionCounts,
  SourceName,
  TeamPreview,
  TeamCombinationPreview,
  TeamCombinationResult,
  UpdateEntityMetadataRequest,
  UpdateCombinedCustomBadgeRequest,
  UpdateCombinedEntityCustomBadgesRequest,
  UpdateCombinedEntityCustomBadgesResult,
  UpdateCustomBadgeRequest,
  UpdateEntityCustomBadgesRequest,
  UpdateEntityCustomBadgesResult,
  UpdateLeagueCountriesRequest,
  UpdateLeagueTiersRequest,
  UpdateTeamCountriesRequest,
} from '../../../shared/downloader/contracts';
import type { CustomBadgeSummary } from '../../../shared/downloader/custom-badge';
import type { CombinedCustomBadgeSummary } from '../../../shared/downloader/combined-custom-badge';

@Service()
export class DesktopApi {
  private readonly progressState = signal<ScrapeProgress | undefined>(undefined);
  private readonly projectUpdatedState = signal<ProjectSummary | undefined>(undefined);
  private readonly desktop: QdbDesktopApi | undefined = window.qdbEditor?.downloader;
  readonly scrapeProgress = this.progressState.asReadonly();
  readonly projectUpdated = this.projectUpdatedState.asReadonly();

  constructor() {
    this.desktop?.onScrapeProgress?.((progress) => this.progressState.set(progress));
  }

  getSourcePriority(): Promise<Result<SourceName[]>> {
    return this.request((desktop) => desktop.getSourcePriority());
  }

  updateSourcePriority(sourceNames: SourceName[]): Promise<Result<SourceName[]>> {
    return this.request((desktop) => desktop.updateSourcePriority({ sourceNames }));
  }

  getExportVisibilityPresets(): Promise<Result<ExportVisibilityPresetPreference[] | undefined>> {
    return this.request((desktop) => desktop.getExportVisibilityPresets());
  }

  updateExportVisibilityPresets(
    presets: ExportVisibilityPresetPreference[],
  ): Promise<Result<ExportVisibilityPresetPreference[]>> {
    return this.request((desktop) => desktop.updateExportVisibilityPresets({ presets }));
  }

  getExportFieldNamePresets(): Promise<Result<ExportFieldNamePresetPreference[] | undefined>> {
    return this.request((desktop) => desktop.getExportFieldNamePresets());
  }

  updateExportFieldNamePresets(
    presets: ExportFieldNamePresetPreference[],
  ): Promise<Result<ExportFieldNamePresetPreference[]>> {
    return this.request((desktop) => desktop.updateExportFieldNamePresets({ presets }));
  }

  getExportConfiguration(): Promise<Result<ExportConfigurationPreference | undefined>> {
    return this.request((desktop) => desktop.getExportConfiguration());
  }

  updateExportConfiguration(
    configuration: ExportConfigurationPreference,
  ): Promise<Result<ExportConfigurationPreference>> {
    return this.request((desktop) => desktop.updateExportConfiguration({ configuration }));
  }

  listCustomBadges(): Promise<Result<CustomBadgeSummary[]>> {
    return this.request((desktop) => desktop.listCustomBadges());
  }

  createCustomBadge(request: CreateCustomBadgeRequest): Promise<Result<CustomBadgeSummary>> {
    return this.request((desktop) => desktop.createCustomBadge(request));
  }

  updateCustomBadge(request: UpdateCustomBadgeRequest): Promise<Result<CustomBadgeSummary>> {
    return this.request((desktop) => desktop.updateCustomBadge(request));
  }

  deleteCustomBadge(id: string): Promise<Result<DeleteCustomBadgeResult>> {
    return this.request((desktop) => desktop.deleteCustomBadge({ id }));
  }

  updateEntityCustomBadges(
    request: UpdateEntityCustomBadgesRequest,
  ): Promise<Result<UpdateEntityCustomBadgesResult>> {
    return this.request((desktop) => desktop.updateEntityCustomBadges(request));
  }

  listCombinedCustomBadges(): Promise<Result<CombinedCustomBadgeSummary[]>> {
    return this.request((desktop) => desktop.listCombinedCustomBadges());
  }

  createCombinedCustomBadge(
    request: CreateCombinedCustomBadgeRequest,
  ): Promise<Result<CombinedCustomBadgeSummary>> {
    return this.request((desktop) => desktop.createCombinedCustomBadge(request));
  }

  updateCombinedCustomBadge(
    request: UpdateCombinedCustomBadgeRequest,
  ): Promise<Result<CombinedCustomBadgeSummary>> {
    return this.request((desktop) => desktop.updateCombinedCustomBadge(request));
  }

  deleteCombinedCustomBadge(id: string): Promise<Result<DeleteCombinedCustomBadgeResult>> {
    return this.request((desktop) => desktop.deleteCombinedCustomBadge({ id }));
  }

  updateCombinedEntityCustomBadges(
    request: UpdateCombinedEntityCustomBadgesRequest,
  ): Promise<Result<UpdateCombinedEntityCustomBadgesResult>> {
    return this.request((desktop) => desktop.updateCombinedEntityCustomBadges(request));
  }

  listProjects(): Promise<Result<ProjectSummary[]>> {
    return this.request((desktop) => desktop.listProjects());
  }

  createProject(name: string, referenceDate: string): Promise<Result<ProjectSummary>> {
    return this.request((desktop) => desktop.createProject({ name, referenceDate }));
  }

  async renameProject(projectId: string, name: string): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) => desktop.renameProject({ projectId, name }));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteProject(projectId: string): Promise<Result<DeleteProjectResult>> {
    const result = await this.request((desktop) => desktop.deleteProject({ projectId }));
    if (result.ok && this.projectUpdatedState()?.id === projectId) {
      this.projectUpdatedState.set(undefined);
    }
    return result;
  }

  async deleteAllProjects(): Promise<Result<DeleteAllProjectsResult>> {
    const result = await this.request((desktop) => desktop.deleteAllProjects());
    if (result.ok) this.projectUpdatedState.set(undefined);
    return result;
  }

  async deleteLeague(
    projectId: string,
    id: string,
    mode: DeleteLeagueMode,
  ): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) => desktop.deleteLeague({ projectId, id, mode }));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteLeagues(
    projectId: string,
    ids: string[],
    mode: DeleteLeagueMode,
  ): Promise<Result<ProjectSummary>> {
    const request: DeleteLeaguesRequest = { projectId, ids, mode };
    const result = await this.request((desktop) => desktop.deleteLeagues(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async updateLeagueCountries(
    projectId: string,
    ids: string[],
    countryCode3?: string,
  ): Promise<Result<ProjectSummary>> {
    const request: UpdateLeagueCountriesRequest = { projectId, ids, countryCode3 };
    const result = await this.request((desktop) => desktop.updateLeagueCountries(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async updateLeagueTiers(
    projectId: string,
    ids: string[],
    tier?: number,
  ): Promise<Result<ProjectSummary>> {
    const request: UpdateLeagueTiersRequest = { projectId, ids, tier };
    const result = await this.request((desktop) => desktop.updateLeagueTiers(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteTeam(projectId: string, id: string): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) => desktop.deleteTeam({ projectId, id }));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteTeams(projectId: string, ids: string[]): Promise<Result<ProjectSummary>> {
    const request: DeleteTeamsRequest = { projectId, ids };
    const result = await this.request((desktop) => desktop.deleteTeams(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async updateTeamCountries(
    projectId: string,
    ids: string[],
    countryCode3?: string,
  ): Promise<Result<ProjectSummary>> {
    const request: UpdateTeamCountriesRequest = { projectId, ids, countryCode3 };
    const result = await this.request((desktop) => desktop.updateTeamCountries(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deletePlayer(projectId: string, id: string): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) => desktop.deletePlayer({ projectId, id }));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deletePlayers(projectId: string, ids: string[]): Promise<Result<ProjectSummary>> {
    const request: DeletePlayersRequest = { projectId, ids };
    const result = await this.request((desktop) => desktop.deletePlayers(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteSourceData(
    projectId: string,
    sourceNames: SourceName[],
  ): Promise<Result<DeleteSourceDataResult>> {
    const result = await this.request((desktop) =>
      desktop.deleteSourceData({ projectId, sourceNames }),
    );
    if (result.ok) this.projectUpdatedState.set(result.value.project);
    return result;
  }

  previewSourceDataDeletion(
    projectId: string,
    sourceNames: SourceName[],
  ): Promise<Result<SourceDataDeletionCounts>> {
    return this.request((desktop) => desktop.previewSourceDataDeletion({ projectId, sourceNames }));
  }

  async getProjectSummary(projectId: string): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) => desktop.getProjectSummary({ projectId }));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  getEntity(
    projectId: string,
    entity: EditableEntityKind,
    id: string,
  ): Promise<Result<EditableEntity>> {
    return this.request((desktop) => desktop.getEntity({ projectId, entity, id }));
  }

  updateEntityMetadata(request: UpdateEntityMetadataRequest): Promise<Result<EditableEntity>> {
    return this.request((desktop) => desktop.updateEntityMetadata(request));
  }

  listEntities(request: PageRequest): Promise<Result<Page<Entity>>> {
    return this.request((desktop) => desktop.listEntities(request));
  }

  listEntityFilterOptions(
    request: EntityFilterOptionsRequest,
  ): Promise<Result<EntityFilterOptions>> {
    return this.request((desktop) => desktop.listEntityFilterOptions(request));
  }

  listCombinedEntityFilterOptions(
    request: CombinedEntityFilterOptionsRequest,
  ): Promise<Result<CombinedEntityFilterOptions>> {
    return this.request((desktop) => desktop.listCombinedEntityFilterOptions(request));
  }

  listCombinedEntities(request: CombinedPageRequest): Promise<Result<Page<CombinedEntity>>> {
    return this.request((desktop) => desktop.listCombinedEntities(request));
  }

  listCombineTeamCandidates(
    projectId: string,
    search: string,
    sourceName?: SourceName,
    combinedTeamId?: string,
    leagueId?: string,
  ): Promise<Result<CombineTeamCandidate[]>> {
    return this.request((desktop) =>
      desktop.listCombineTeamCandidates({
        projectId,
        search,
        sourceName,
        combinedTeamId,
        leagueId,
      }),
    );
  }

  previewTeamCombination(
    request: Parameters<QdbDesktopApi['previewTeamCombination']>[0],
  ): Promise<Result<TeamCombinationPreview>> {
    return this.request((desktop) => desktop.previewTeamCombination(request));
  }

  async commitTeamCombination(
    request: CommitTeamCombinationRequest,
  ): Promise<Result<TeamCombinationResult>> {
    const result = await this.request((desktop) => desktop.commitTeamCombination(request));
    if (result.ok) await this.getProjectSummary(request.projectId);
    return result;
  }

  async deleteCombinedEntity(
    projectId: string,
    entity: CombinedEntityKind,
    id: string,
    cascade = false,
  ): Promise<Result<ProjectSummary>> {
    const result = await this.request((desktop) =>
      desktop.deleteCombinedEntity({ projectId, entity, id, cascade }),
    );
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteCombinedLeagues(
    projectId: string,
    ids: string[],
    cascade: boolean,
  ): Promise<Result<ProjectSummary>> {
    const request: DeleteCombinedLeaguesRequest = { projectId, ids, cascade };
    const result = await this.request((desktop) => desktop.deleteCombinedLeagues(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteCombinedTeams(projectId: string, ids: string[]): Promise<Result<ProjectSummary>> {
    const request: DeleteCombinedTeamsRequest = { projectId, ids };
    const result = await this.request((desktop) => desktop.deleteCombinedTeams(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  async deleteCombinedPlayers(projectId: string, ids: string[]): Promise<Result<ProjectSummary>> {
    const request: DeleteCombinedPlayersRequest = { projectId, ids };
    const result = await this.request((desktop) => desktop.deleteCombinedPlayers(request));
    if (result.ok) this.projectUpdatedState.set(result.value);
    return result;
  }

  previewLeague(request: PreviewLeagueRequest): Promise<Result<LeaguePreview>> {
    return this.request((desktop) => desktop.previewLeague(request));
  }

  previewTeam(request: PreviewTeamRequest): Promise<Result<TeamPreview>> {
    return this.request((desktop) => desktop.previewTeam(request));
  }

  async previewTeams(request: PreviewTeamsRequest): Promise<Result<TeamPreview[]>> {
    this.progressState.set(undefined);
    const result = await this.request((desktop) => desktop.previewTeams(request));
    this.progressState.set(undefined);
    return result;
  }

  async cancelScrape(jobId: string): Promise<Result<boolean>> {
    const result = await this.request((desktop) => desktop.cancelScrape({ jobId }));
    if (result.ok && result.value) this.progressState.set(undefined);
    return result;
  }

  previewImportChanges(request: CommitImportRequest): Promise<Result<ImportPreview>> {
    return this.request((desktop) => desktop.previewImportChanges(request));
  }

  commitImport(request: CommitImportRequest): Promise<Result<ImportResult>> {
    return this.request((desktop) => desktop.commitImport(request));
  }

  getExportDestination(): Promise<Result<string | undefined>> {
    return this.request((desktop) => desktop.getExportDestination());
  }

  chooseExportDirectory(): Promise<Result<string | undefined>> {
    return this.request((desktop) => desktop.chooseExportDirectory());
  }

  exportProject(request: ExportRequest): Promise<Result<ExportResult>> {
    return this.request((desktop) => desktop.exportProject(request));
  }

  openExportDirectory(directory: string): Promise<Result<boolean>> {
    return this.request((desktop) => desktop.openExportDirectory({ directory }));
  }

  private request<T>(
    operation: (desktop: QdbDesktopApi) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    if (!this.desktop) return Promise.resolve(this.unavailable());
    return operation(this.desktop).catch((error: unknown) => this.unavailable(error));
  }

  private unavailable<T>(error?: unknown): Result<T> {
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message:
          error instanceof Error
            ? error.message
            : 'The QDB desktop service is unavailable. Start the application with bun run start.',
      },
    };
  }
}
