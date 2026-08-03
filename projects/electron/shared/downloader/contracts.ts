import type { CombinedCustomBadge, CombinedCustomBadgeSummary } from './combined-custom-badge.js';
import type { CustomBadge, CustomBadgeColor, CustomBadgeSummary } from './custom-badge.js';
import type { EntityStatus, EntityStatusSettings } from './entity-status.js';

export type EntityKind = 'leagues' | 'teams' | 'players';
export type EditableEntityKind = Exclude<EntityKind, 'players'>;
export type SortDirection = 'asc' | 'desc';
export type ExportDataset = 'source' | 'combined';
export type ExportFormat = 'json' | 'single-json' | 'csv';
export const leagueTiers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const sourceNames = ['transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal'] as const;
export type SourceName = (typeof sourceNames)[number];
export const sourceLabels: Record<SourceName, string> = {
  eurofotbal: 'Eurofotbal',
  soccerway: 'Soccerway',
  transfermarkt: 'Transfermarkt',
  worldfootball: 'WorldFootball',
};
export const sourceSupportsSeason: Record<SourceName, boolean> = {
  eurofotbal: false,
  soccerway: false,
  transfermarkt: true,
  worldfootball: false,
};
export const isSourceName = (value: unknown): value is SourceName =>
  typeof value === 'string' && sourceNames.includes(value as SourceName);

export interface AppError {
  code:
    | 'CONFLICT'
    | 'DATABASE'
    | 'EXPORT'
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'SCRAPE_FAILED'
    | 'UNAVAILABLE';
  message: string;
  details?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export interface Project {
  id: string;
  name: string;
  referenceDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  databaseCount?: number;
  leagueCount: number;
  teamCount: number;
  playerCount: number;
  combinedLeagueCount?: number;
  combinedTeamCount?: number;
  combinedPlayerCount?: number;
  sourceNames: SourceName[];
}

export interface DeleteProjectResult {
  projectId: string;
  deletedExportCount: number;
  failedExportDirectories: string[];
}

export interface DeleteAllProjectsResult {
  deletedProjectCount: number;
  deletedExportCount: number;
  failedExportDirectories: string[];
}

export type DeleteLeagueMode = 'league-only' | 'league-and-teams';

export interface DeleteLeagueRequest {
  projectId: string;
  id: string;
  mode: DeleteLeagueMode;
}

export interface DeleteLeaguesRequest {
  projectId: string;
  ids: string[];
  mode: DeleteLeagueMode;
}

export interface UpdateLeagueCountriesRequest {
  projectId: string;
  ids: string[];
  countryCode3?: string;
}

export interface UpdateLeagueTiersRequest {
  projectId: string;
  ids: string[];
  tier?: number;
}

export interface DeleteTeamsRequest {
  projectId: string;
  ids: string[];
}

export interface DeletePlayersRequest {
  projectId: string;
  ids: string[];
}

export interface DeleteCombinedPlayersRequest {
  projectId: string;
  ids: string[];
}

export interface DeleteCombinedLeaguesRequest {
  projectId: string;
  ids: string[];
  cascade: boolean;
}

export interface DeleteCombinedTeamsRequest {
  projectId: string;
  ids: string[];
}

export interface UpdateTeamCountriesRequest {
  projectId: string;
  ids: string[];
  countryCode3?: string;
}

export interface DeleteSourceDataRequest {
  projectId: string;
  sourceNames: SourceName[];
}

export interface SourceDataDeletionCounts {
  leagues: number;
  teams: number;
  players: number;
}

export interface DeleteSourceDataResult {
  project: ProjectSummary;
  deleted: SourceDataDeletionCounts;
}

export interface League {
  id: string;
  projectId: string;
  sourceName: SourceName;
  sourceId: string;
  name: string;
  tier?: number;
  countryName?: string;
  countryCode2?: string;
  countryCode3?: string;
  season?: string;
  sourceUrl: string;
  teamCount?: number;
  playerCount?: number;
  createdAt: string;
  updatedAt: string;
  customBadges?: CustomBadge[];
}

export interface Team {
  id: string;
  projectId: string;
  leagueId?: string;
  leagueName?: string;
  sourceName: SourceName;
  sourceId: string;
  name: string;
  countryName?: string;
  countryCode2?: string;
  countryCode3?: string;
  season?: string;
  sourceUrl: string;
  playerCount?: number;
  createdAt: string;
  updatedAt: string;
  customBadges?: CustomBadge[];
}

export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'ATTACKER';
export const playerPositionDetails = [
  'GK',
  'SW',
  'LWB',
  'LB',
  'LCB',
  'CB',
  'RCB',
  'RB',
  'RWB',
  'LDM',
  'CDM',
  'RDM',
  'LM',
  'LCM',
  'CM',
  'RCM',
  'RM',
  'LAM',
  'CAM',
  'RAM',
  'LW',
  'LF',
  'CF',
  'RF',
  'RW',
  'LS',
  'ST',
  'RS',
] as const;
export type PlayerPositionDetail = (typeof playerPositionDetails)[number];
export type PlayerFoot = 'LEFT' | 'RIGHT';

export interface PlayerInput {
  sourceId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number;
  position?: PlayerPosition;
  positionDetail?: PlayerPositionDetail;
  birthdate?: string;
  height?: number;
  weight?: number;
  foot?: PlayerFoot;
  joined?: string;
  contractExpires?: string;
  marketValue?: number;
  countryName?: string;
  countryCode2?: string;
  countryCode3?: string;
  minutesPlayed?: number;
}

export interface Player extends PlayerInput {
  id: string;
  projectId: string;
  teamId: string;
  teamName?: string;
  leagueName?: string;
  sourceName: SourceName;
  sourceId: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  customBadges?: CustomBadge[];
}

export type Entity = League | Team | Player;
export type EditableEntity = League | Team;

export type CombinedEntityKind = EntityKind;

export interface CombinedSourceRef {
  recordId?: string;
  sourceName: SourceName;
  sourceId: string;
  sourceUrl?: string;
  season?: string;
  name: string;
  available: boolean;
}

export type FieldResolution =
  | { mode: 'source'; sourceName: SourceName }
  | { mode: 'custom'; value: string | number | undefined };

export type FieldResolutions = Partial<Record<string, FieldResolution>>;

export interface CombinedLeague {
  id: string;
  projectId: string;
  name: string;
  tier?: number;
  countryName?: string;
  countryCode2?: string;
  countryCode3?: string;
  season?: string;
  teamCount?: number;
  playerCount?: number;
  sources: CombinedSourceRef[];
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  customBadges?: CombinedCustomBadge[];
}

export interface CombinedTeam {
  id: string;
  projectId: string;
  leagueId?: string;
  leagueName?: string;
  name: string;
  countryName?: string;
  countryCode2?: string;
  countryCode3?: string;
  season?: string;
  playerCount?: number;
  sources: CombinedSourceRef[];
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  customBadges?: CombinedCustomBadge[];
}

export interface CombinedPlayer extends PlayerInput {
  id: string;
  projectId: string;
  teamId: string;
  teamName?: string;
  leagueName?: string;
  sources: CombinedSourceRef[];
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  customBadges?: CombinedCustomBadge[];
}

export type CombinedEntity = CombinedLeague | CombinedTeam | CombinedPlayer;

export interface CombinedPageRequest {
  projectId: string;
  entity: CombinedEntityKind;
  pageIndex: number;
  pageSize: number;
  search: string;
  sort: string;
  direction: SortDirection;
  sourceNames?: SourceName[];
  leagueId?: string;
  leagueIds?: string[];
  includeTeamsWithoutLeague?: boolean;
  teamId?: string;
  teamIds?: string[];
  tiers?: number[];
  includeLeaguesWithoutTier?: boolean;
  countries?: string[];
  nationalities?: string[];
  positions?: PlayerPosition[];
  positionDetails?: PlayerPositionDetail[];
  feet?: PlayerFoot[];
  needsReview?: boolean;
  customBadgeIds?: string[];
}

export type CombinedEntityFilterOptions =
  | {
      entity: 'leagues';
      countries: CountryFilterOption[];
      tiers: number[];
      hasLeaguesWithoutTier: boolean;
      customBadges?: CombinedCustomBadge[];
    }
  | {
      entity: 'teams';
      leagues: EntityFilterOption[];
      hasTeamsWithoutLeague: boolean;
      countries: CountryFilterOption[];
      customBadges?: CombinedCustomBadge[];
    }
  | {
      entity: 'players';
      teams: EntityFilterOption[];
      nationalities: NationalityFilterOption[];
      positions: PlayerPosition[];
      positionDetails: PlayerPositionDetail[];
      feet: PlayerFoot[];
      customBadges?: CombinedCustomBadge[];
    };

export interface CombinedEntityFilterOptionsRequest {
  projectId: string;
  entity: CombinedEntityKind;
}

export interface CombineTeamCandidate extends Team {
  combinedTeamId?: string;
  combinedTeamName?: string;
}

export interface PlayerSourceRecord extends PlayerInput {
  id: string;
  sourceName: SourceName;
  sourceUrl?: string;
  teamId: string;
  teamName: string;
}

export interface PlayerMatchGroup {
  id: string;
  players: PlayerSourceRecord[];
  automatic: boolean;
  ambiguous: boolean;
}

export interface FieldConflictValue {
  sourceName: SourceName;
  value: string | number | undefined;
}

export interface FieldConflict {
  entity: 'league' | 'team' | 'player';
  entityId: string;
  field: string;
  values: FieldConflictValue[];
  resolvedValue: string | number | undefined;
  resolution?: FieldResolution;
}

export type CombinedLeagueSelection =
  | { kind: 'none' }
  | { kind: 'existing'; combinedLeagueId: string }
  | { kind: 'create'; sourceLeagueIds: string[]; resolutions: FieldResolutions };

export interface PreviewTeamCombinationRequest {
  projectId: string;
  sourceTeamIds: string[];
  combinedTeamId?: string;
}

export interface TeamCombinationPreview {
  sourceTeams: CombineTeamCandidate[];
  matchGroups: PlayerMatchGroup[];
  conflicts: FieldConflict[];
  sourceLeagues: League[];
  combinedLeagues: CombinedLeague[];
  detectedCombinedLeagueId?: string;
  existingResolutions: FieldResolutions;
  existingPlayerResolutions: Record<string, FieldResolutions>;
}

export interface CommitTeamCombinationRequest {
  projectId: string;
  sourceTeamIds: string[];
  combinedTeamId?: string;
  league: CombinedLeagueSelection;
  matchGroups: PlayerMatchGroup[];
  selectedPlayerGroupIds: string[];
  teamResolutions: FieldResolutions;
  playerResolutions: Record<string, FieldResolutions>;
}

export interface TeamCombinationResult {
  team: CombinedTeam;
  league?: CombinedLeague;
  players: CombinedPlayer[];
  addedPlayers: number;
  updatedPlayers: number;
  deletedPlayers: number;
}

export interface PageRequest {
  projectId: string;
  entity: EntityKind;
  pageIndex: number;
  pageSize: number;
  search: string;
  sort: string;
  direction: SortDirection;
  leagueId?: string;
  leagueIds?: string[];
  teamId?: string;
  teamIds?: string[];
  includeTeamsWithoutLeague?: boolean;
  tiers?: number[];
  includeLeaguesWithoutTier?: boolean;
  sourceNames?: SourceName[];
  seasons?: string[];
  countries?: string[];
  nationalities?: string[];
  positions?: PlayerPosition[];
  positionDetails?: PlayerPositionDetail[];
  feet?: PlayerFoot[];
  statuses?: EntityStatus[];
  customBadgeIds?: string[];
  statusAsOf?: string;
  statusSettings?: EntityStatusSettings;
}

export interface EntityFilterOption {
  id: string;
  name: string;
  sourceName?: SourceName;
  sourceId?: string;
  countryName?: string;
  countryCode?: string;
  tier?: number;
}

export interface CountryFilterOption {
  name: string;
  code?: string;
}

export type NationalityFilterOption = CountryFilterOption;

export type EntityFilterOptions =
  | {
      entity: 'leagues';
      sourceNames?: SourceName[];
      countries: CountryFilterOption[];
      seasons: string[];
      tiers?: number[];
      hasLeaguesWithoutTier?: boolean;
      customBadges?: CustomBadge[];
    }
  | {
      entity: 'teams';
      sourceNames?: SourceName[];
      leagues: EntityFilterOption[];
      hasTeamsWithoutLeague: boolean;
      countries: CountryFilterOption[];
      seasons: string[];
      customBadges?: CustomBadge[];
    }
  | {
      entity: 'players';
      sourceNames?: SourceName[];
      teams: EntityFilterOption[];
      nationalities: NationalityFilterOption[];
      positions: PlayerPosition[];
      positionDetails: PlayerPositionDetail[];
      feet: PlayerFoot[];
      customBadges?: CustomBadge[];
    };

export interface EntityFilterOptionsRequest {
  projectId: string;
  entity: EntityKind;
}

export interface CreateCustomBadgeRequest {
  name: string;
  description: string;
  color: CustomBadgeColor;
}

export interface UpdateCustomBadgeRequest extends CreateCustomBadgeRequest {
  id: string;
}

export interface DeleteCustomBadgeResult {
  id: string;
  deletedAssignmentCount: number;
}

export interface UpdateEntityCustomBadgesRequest {
  projectId: string;
  entity: EntityKind;
  ids: string[];
  addBadgeIds: string[];
  removeBadgeIds: string[];
}

export interface UpdateEntityCustomBadgesResult {
  updatedEntityCount: number;
}

export type CreateCombinedCustomBadgeRequest = CreateCustomBadgeRequest;

export interface UpdateCombinedCustomBadgeRequest extends CreateCombinedCustomBadgeRequest {
  id: string;
}

export interface DeleteCombinedCustomBadgeResult {
  id: string;
  deletedAssignmentCount: number;
}

export interface UpdateCombinedEntityCustomBadgesRequest {
  projectId: string;
  entity: CombinedEntityKind;
  ids: string[];
  addBadgeIds: string[];
  removeBadgeIds: string[];
}

export interface UpdateCombinedEntityCustomBadgesResult {
  updatedEntityCount: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
}

export interface ExternalTeam {
  sourceId: string;
  name: string;
  season?: string;
  sourceUrl: string;
}

export interface LeaguePreview {
  sourceId: string;
  name?: string;
  season?: string;
  sourceUrl: string;
  teams: ExternalTeam[];
}

export interface TeamPreview extends ExternalTeam {
  players: PlayerInput[];
}

export interface PreviewLeagueRequest {
  sourceName: SourceName;
  identifierOrUrl: string;
  season?: string;
}

export interface PreviewTeamRequest {
  sourceName: SourceName;
  identifierOrUrl: string;
  name: string;
  season?: string;
}

export interface PreviewTeamsRequest {
  sourceName: SourceName;
  jobId: string;
  teams: ExternalTeam[];
}

export interface ImportLeague {
  sourceId: string;
  name: string;
  season?: string;
  sourceUrl: string;
}

export interface ImportTeam extends ExternalTeam {
  players: PlayerInput[];
}

export type AbsentTeamPolicy = 'keep' | 'detach' | 'delete';
export type AbsentPlayerPolicy = 'keep' | 'delete';
export type ExistingRecordPolicy = 'keep' | 'refresh';
export type OwnershipConflictPolicy = 'keep' | 'move';

export interface MergeImportOptions {
  existingRecords: ExistingRecordPolicy;
  teamLeagueConflicts: OwnershipConflictPolicy;
  playerTeamConflicts: OwnershipConflictPolicy;
}

export interface LeagueSynchronizationOptions {
  absentTeams: AbsentTeamPolicy;
  absentPlayers: AbsentPlayerPolicy;
  overrideTeamNames: boolean;
  overridePlayerNames: boolean;
  teamLeagueConflicts: OwnershipConflictPolicy;
  playerTeamConflicts: OwnershipConflictPolicy;
}

export interface TeamSynchronizationOptions {
  absentPlayers: AbsentPlayerPolicy;
  overridePlayerNames: boolean;
  playerTeamConflicts: OwnershipConflictPolicy;
}

export interface LeagueSynchronizeImportOperation {
  kind: 'synchronize';
  target: { entity: 'leagues'; id: string };
  options: LeagueSynchronizationOptions;
}

export interface TeamSynchronizeImportOperation {
  kind: 'synchronize';
  target: { entity: 'teams'; id: string };
  options: TeamSynchronizationOptions;
}

export type SynchronizeImportOperation =
  LeagueSynchronizeImportOperation | TeamSynchronizeImportOperation;

export type ImportOperation =
  { kind: 'merge'; options: MergeImportOptions } | SynchronizeImportOperation;

export interface CommitImportRequest {
  projectId: string;
  sourceName: SourceName;
  operation: ImportOperation;
  league?: ImportLeague;
  teams: ImportTeam[];
}

export interface EntityChangeCounts {
  added: number;
  updated: number;
  preserved: number;
  deleted: number;
}

export interface TeamChangeCounts extends EntityChangeCounts {
  moved: number;
  detached: number;
}

export interface PlayerChangeCounts extends EntityChangeCounts {
  moved: number;
  deduplicated: number;
}

export interface ImportChangeSummary {
  leagues: EntityChangeCounts;
  teams: TeamChangeCounts;
  players: PlayerChangeCounts;
}

export interface ExistingRecordConflict {
  entity: EntityKind;
  sourceName: SourceName;
  sourceId: string;
  season?: string;
  storedName: string;
  incomingName: string;
}

export interface OwnershipConflict {
  entity: 'teams' | 'players';
  sourceName: SourceName;
  sourceId: string;
  name: string;
  currentParents: string[];
  incomingParent: string;
  legacyCopyCount: number;
}

export interface ImportConflictSummary {
  existingRecords: ExistingRecordConflict[];
  teamLeagueConflicts: OwnershipConflict[];
  playerTeamConflicts: OwnershipConflict[];
}

export interface ImportPreview {
  changes: ImportChangeSummary;
  conflicts: ImportConflictSummary;
}

export interface ImportResult {
  leagueCount: number;
  teamCount: number;
  playerCount: number;
  changes: ImportChangeSummary;
}

export type UpdateEntityMetadataRequest =
  | {
      projectId: string;
      entity: 'leagues';
      id: string;
      name: string;
      sourceId: string;
      countryCode3?: string;
      season?: string;
      tier?: number;
    }
  | {
      projectId: string;
      entity: 'teams';
      id: string;
      name: string;
      sourceId: string;
      countryCode3?: string;
      season?: string;
      leagueId?: string;
    };

export interface ScrapeProgress {
  jobId: string;
  completed: number;
  total: number;
  currentTeam: string;
  canceled: boolean;
}

export type ExportFieldNameStyle = 'camelCase' | 'snake_case';

export interface ExportColumnMapping<Key extends string = string> {
  sourceKey: Key;
  outputName: string;
}

export interface ExportColumnSelection {
  leagues: (keyof League)[];
  teams: (keyof Team)[];
  players: (keyof Player)[];
}

export interface ExportFieldNameConfiguration {
  nameStyle: ExportFieldNameStyle;
  leagues: ExportColumnMapping<keyof League>[];
  teams: ExportColumnMapping<keyof Team>[];
  players: ExportColumnMapping<keyof Player>[];
}

export interface ExportVisibilityPresetPreference {
  id: string;
  name: string;
  columns: ExportColumnSelection;
}

export interface ExportFieldNamePresetPreference {
  id: string;
  name: string;
  fieldNames: ExportFieldNameConfiguration;
}

export interface ExportConfigurationPreference {
  dataset: ExportDataset;
  format: ExportFormat;
  columns: ExportColumnSelection;
  fieldNames: ExportFieldNameConfiguration;
}

export interface ExportRequest {
  projectId: string;
  dataset?: ExportDataset;
  format: ExportFormat;
  columns: ExportColumnSelection;
  fieldNames: ExportFieldNameConfiguration;
  destination: string;
  includeTeamsWithoutLeague: boolean;
  leagueIds: string[];
}

export interface ExportResult {
  directory: string;
  files: string[];
}

export interface QdbDesktopApi {
  getSourcePriority(): Promise<Result<SourceName[]>>;
  updateSourcePriority(request: { sourceNames: SourceName[] }): Promise<Result<SourceName[]>>;
  getExportVisibilityPresets(): Promise<Result<ExportVisibilityPresetPreference[] | undefined>>;
  updateExportVisibilityPresets(request: {
    presets: ExportVisibilityPresetPreference[];
  }): Promise<Result<ExportVisibilityPresetPreference[]>>;
  getExportFieldNamePresets(): Promise<Result<ExportFieldNamePresetPreference[] | undefined>>;
  updateExportFieldNamePresets(request: {
    presets: ExportFieldNamePresetPreference[];
  }): Promise<Result<ExportFieldNamePresetPreference[]>>;
  getExportConfiguration(): Promise<Result<ExportConfigurationPreference | undefined>>;
  updateExportConfiguration(request: {
    configuration: ExportConfigurationPreference;
  }): Promise<Result<ExportConfigurationPreference>>;
  listCustomBadges(): Promise<Result<CustomBadgeSummary[]>>;
  createCustomBadge(request: CreateCustomBadgeRequest): Promise<Result<CustomBadgeSummary>>;
  updateCustomBadge(request: UpdateCustomBadgeRequest): Promise<Result<CustomBadgeSummary>>;
  deleteCustomBadge(request: { id: string }): Promise<Result<DeleteCustomBadgeResult>>;
  updateEntityCustomBadges(
    request: UpdateEntityCustomBadgesRequest,
  ): Promise<Result<UpdateEntityCustomBadgesResult>>;
  listCombinedCustomBadges(): Promise<Result<CombinedCustomBadgeSummary[]>>;
  createCombinedCustomBadge(
    request: CreateCombinedCustomBadgeRequest,
  ): Promise<Result<CombinedCustomBadgeSummary>>;
  updateCombinedCustomBadge(
    request: UpdateCombinedCustomBadgeRequest,
  ): Promise<Result<CombinedCustomBadgeSummary>>;
  deleteCombinedCustomBadge(request: {
    id: string;
  }): Promise<Result<DeleteCombinedCustomBadgeResult>>;
  updateCombinedEntityCustomBadges(
    request: UpdateCombinedEntityCustomBadgesRequest,
  ): Promise<Result<UpdateCombinedEntityCustomBadgesResult>>;
  listProjects(): Promise<Result<ProjectSummary[]>>;
  createProject(input: { name: string; referenceDate: string }): Promise<Result<ProjectSummary>>;
  renameProject(request: { projectId: string; name: string }): Promise<Result<ProjectSummary>>;
  deleteProject(request: { projectId: string }): Promise<Result<DeleteProjectResult>>;
  deleteAllProjects(): Promise<Result<DeleteAllProjectsResult>>;
  deleteLeague(request: DeleteLeagueRequest): Promise<Result<ProjectSummary>>;
  deleteLeagues(request: DeleteLeaguesRequest): Promise<Result<ProjectSummary>>;
  updateLeagueCountries(request: UpdateLeagueCountriesRequest): Promise<Result<ProjectSummary>>;
  updateLeagueTiers(request: UpdateLeagueTiersRequest): Promise<Result<ProjectSummary>>;
  deleteTeam(request: { projectId: string; id: string }): Promise<Result<ProjectSummary>>;
  deleteTeams(request: DeleteTeamsRequest): Promise<Result<ProjectSummary>>;
  updateTeamCountries(request: UpdateTeamCountriesRequest): Promise<Result<ProjectSummary>>;
  deletePlayer(request: { projectId: string; id: string }): Promise<Result<ProjectSummary>>;
  deletePlayers(request: DeletePlayersRequest): Promise<Result<ProjectSummary>>;
  previewSourceDataDeletion(
    request: DeleteSourceDataRequest,
  ): Promise<Result<SourceDataDeletionCounts>>;
  deleteSourceData(request: DeleteSourceDataRequest): Promise<Result<DeleteSourceDataResult>>;
  getProjectSummary(request: { projectId: string }): Promise<Result<ProjectSummary>>;
  getEntity(request: {
    projectId: string;
    entity: EditableEntityKind;
    id: string;
  }): Promise<Result<EditableEntity>>;
  updateEntityMetadata(request: UpdateEntityMetadataRequest): Promise<Result<EditableEntity>>;
  listEntities(request: PageRequest): Promise<Result<Page<Entity>>>;
  listEntityFilterOptions(
    request: EntityFilterOptionsRequest,
  ): Promise<Result<EntityFilterOptions>>;
  listCombinedEntityFilterOptions(
    request: CombinedEntityFilterOptionsRequest,
  ): Promise<Result<CombinedEntityFilterOptions>>;
  listCombinedEntities(request: CombinedPageRequest): Promise<Result<Page<CombinedEntity>>>;
  listCombineTeamCandidates(request: {
    projectId: string;
    sourceName?: SourceName;
    leagueId?: string;
    search: string;
    combinedTeamId?: string;
  }): Promise<Result<CombineTeamCandidate[]>>;
  previewTeamCombination(
    request: PreviewTeamCombinationRequest,
  ): Promise<Result<TeamCombinationPreview>>;
  commitTeamCombination(
    request: CommitTeamCombinationRequest,
  ): Promise<Result<TeamCombinationResult>>;
  deleteCombinedEntity(request: {
    projectId: string;
    entity: CombinedEntityKind;
    id: string;
    cascade?: boolean;
  }): Promise<Result<ProjectSummary>>;
  deleteCombinedLeagues(request: DeleteCombinedLeaguesRequest): Promise<Result<ProjectSummary>>;
  deleteCombinedTeams(request: DeleteCombinedTeamsRequest): Promise<Result<ProjectSummary>>;
  deleteCombinedPlayers(request: DeleteCombinedPlayersRequest): Promise<Result<ProjectSummary>>;
  previewLeague(request: PreviewLeagueRequest): Promise<Result<LeaguePreview>>;
  previewTeam(request: PreviewTeamRequest): Promise<Result<TeamPreview>>;
  previewTeams(request: PreviewTeamsRequest): Promise<Result<TeamPreview[]>>;
  cancelScrape(request: { jobId: string }): Promise<Result<boolean>>;
  previewImportChanges(request: CommitImportRequest): Promise<Result<ImportPreview>>;
  commitImport(request: CommitImportRequest): Promise<Result<ImportResult>>;
  getExportDestination(): Promise<Result<string | undefined>>;
  chooseExportDirectory(): Promise<Result<string | undefined>>;
  exportProject(request: ExportRequest): Promise<Result<ExportResult>>;
  openExportDirectory(request: { directory: string }): Promise<Result<boolean>>;
  onScrapeProgress(listener: (progress: ScrapeProgress) => void): () => void;
}
