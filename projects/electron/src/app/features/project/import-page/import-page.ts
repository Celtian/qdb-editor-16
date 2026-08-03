import { SelectionModel } from '@angular/cdk/collections';
import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormField,
  form,
  pattern,
  readonly as readonlyField,
  required,
  validate,
} from '@angular/forms/signals';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';

import {
  type AbsentPlayerPolicy,
  type AbsentTeamPolicy,
  type CommitImportRequest,
  type EditableEntity,
  type EditableEntityKind,
  type ExternalTeam,
  type ImportLeague,
  type ImportPreview,
  type LeaguePreview,
  type MergeImportOptions,
  type OwnershipConflictPolicy,
  type PlayerInput,
  type SourceName,
  type SynchronizeImportOperation,
  type TeamPreview,
  sourceLabels,
  sourceSupportsSeason,
} from '../../../../../shared/downloader/contracts';
import { DesktopApi } from '../../../core/downloader-api';
import { ConfettiService } from '../../../shared/confetti/confetti.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { PositionBadge } from '../../../shared/position-badge/position-badge';
import { ImportSummary, type ImportSummaryDetails } from '../import-summary/import-summary';

interface SelectablePlayer {
  key: string;
  player: PlayerInput;
  selected: boolean;
}

interface SelectableSquad {
  team: TeamPreview;
  players: SelectablePlayer[];
  allSelected: boolean;
}

interface UpdateBehaviorModel {
  absentTeams: AbsentTeamPolicy;
  absentPlayers: AbsentPlayerPolicy;
  overrideTeamNames: boolean;
  overridePlayerNames: boolean;
  teamLeagueConflicts: OwnershipConflictPolicy;
  playerTeamConflicts: OwnershipConflictPolicy;
}

interface SourceDetailsModel {
  name: string;
  identifier: string;
  season: string;
}

type ImportErrorLocation = 'page' | 'target' | 'name' | 'identifier';

const defaultUpdateBehavior = (): UpdateBehaviorModel => ({
  absentTeams: 'keep',
  absentPlayers: 'keep',
  overrideTeamNames: false,
  overridePlayerNames: false,
  teamLeagueConflicts: 'move',
  playerTeamConflicts: 'move',
});

const defaultMergeOptions = (): MergeImportOptions => ({
  existingRecords: 'refresh',
  teamLeagueConflicts: 'move',
  playerTeamConflicts: 'move',
});

const sourceIdPatterns = {
  transfermarkt: /^[a-zA-Z0-9_-]+$/,
  soccerwayLeague: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/standings\/[a-zA-Z0-9_-]+$/,
  soccerwayTeam: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
  worldFootballLeague: /^co\d+\/[a-zA-Z0-9_-]+$/,
  worldFootballTeam: /^te\d+\/[a-zA-Z0-9_-]+$/,
  eurofotbal: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/,
};

const validSourceIdentifier = (
  value: string,
  sourceName: SourceName,
  mode: 'league' | 'team',
): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  let identifier = trimmed.replace(/^\/+|\/+$/g, '');
  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      if (sourceName === 'transfermarkt') {
        if (!/(^|\.)transfermarkt\.[a-z.]+$/i.test(url.hostname)) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        const segment = mode === 'league' ? 'wettbewerb' : 'verein';
        const index = parts.indexOf(segment);
        identifier = index >= 0 ? (parts[index + 1] ?? '') : '';
      } else if (sourceName === 'soccerway') {
        if (!/(^|\.)soccerway\.com$/i.test(url.hostname)) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        if (mode === 'team') {
          identifier = parts[0] === 'team' ? parts.slice(1, 3).join('/') : '';
        } else {
          let suffix = -1;
          for (let index = parts.length - 2; index >= 0; index -= 1) {
            if (parts[index] === 'standings' && parts[index + 1] === 'overall') {
              suffix = index;
              break;
            }
          }
          identifier = (suffix >= 0 ? parts.slice(0, suffix) : parts).join('/');
        }
      } else if (sourceName === 'worldfootball') {
        if (!/(^|\.)worldfootball\.net$/i.test(url.hostname)) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        const root = mode === 'league' ? 'competition' : 'teams';
        identifier = parts[0] === root ? parts.slice(1, 3).join('/') : '';
      } else {
        if (!/(^|\.)eurofotbal\.cz$/i.test(url.hostname)) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        if (mode === 'league') {
          identifier =
            parts.length === 3 && parts[2] === 'tabulky' ? parts.slice(0, 2).join('/') : '';
        } else {
          identifier =
            parts.length === 4 && parts[0] === 'kluby' && parts[3] === 'soupiska'
              ? parts.slice(1, 3).join('/')
              : '';
        }
      }
    } catch {
      return false;
    }
  }
  if (sourceName === 'transfermarkt') return sourceIdPatterns.transfermarkt.test(identifier);
  if (sourceName === 'soccerway') {
    return (
      mode === 'league' ? sourceIdPatterns.soccerwayLeague : sourceIdPatterns.soccerwayTeam
    ).test(identifier);
  }
  if (sourceName === 'eurofotbal') return sourceIdPatterns.eurofotbal.test(identifier);
  return (
    mode === 'league' ? sourceIdPatterns.worldFootballLeague : sourceIdPatterns.worldFootballTeam
  ).test(identifier);
};

@Component({
  selector: 'app-import-page',
  imports: [
    FormField,
    ImportSummary,
    DecimalPipe,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatStepperModule,
    PageHeader,
    PositionBadge,
  ],
  templateUrl: './import-page.html',
  styleUrl: './import-page.css',
})
export class ImportPage {
  private readonly api = inject(DesktopApi);
  private readonly confetti = inject(ConfettiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly stepper = viewChild(MatStepper);
  private readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  private returnTo: EditableEntityKind | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private sourceSequence = 0;
  private squadSequence = 0;
  private reviewSequence = 0;
  private targetSequence = 0;

  protected readonly operation = signal<'merge' | 'synchronize'>('merge');
  protected readonly mode = signal<'league' | 'team'>('league');
  protected readonly sourceName = signal<SourceName>('transfermarkt');
  private readonly sourceDetails = signal<SourceDetailsModel>({
    name: '',
    identifier: '',
    season: '',
  });
  protected readonly name = computed(() => this.sourceDetails().name);
  protected readonly identifier = computed(() => this.sourceDetails().identifier);
  protected readonly season = computed(() => this.sourceDetails().season);
  protected readonly sourceForm = form(this.sourceDetails, (path) => {
    readonlyField(path.name, { when: () => this.isSynchronize() });
    readonlyField(path.identifier, { when: () => this.isSynchronize() });
    readonlyField(path.season, { when: () => this.isSynchronize() });
    required(path.identifier, { message: 'Source ID or URL is required.' });
    validate(path.identifier, ({ value }) =>
      validSourceIdentifier(value(), this.sourceName(), this.mode())
        ? undefined
        : {
            kind: 'sourceIdentifier',
            message: `Use a valid ${sourceLabels[this.sourceName()]} ${this.mode()} ID or URL.`,
          },
    );
    validate(path.name, ({ value }) =>
      this.mode() === 'league' || value().trim()
        ? undefined
        : { kind: 'required', message: 'Team name is required.' },
    );
    pattern(path.season, /^(|\d{4})$/, {
      message: 'Use a four-digit season or leave it empty.',
    });
  });
  protected readonly leaguePreview = signal<LeaguePreview | undefined>(undefined);
  protected readonly teamSelection = new SelectionModel<ExternalTeam>(true);
  private readonly teamSelectionVersion = signal(0);
  protected readonly squads = signal<SelectableSquad[]>([]);
  protected readonly readyToCommit = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly errorLocation = signal<ImportErrorLocation>('page');
  protected readonly jobId = signal('');
  protected readonly progress = this.api.scrapeProgress;
  protected readonly targetSearch = signal('');
  protected readonly targets = signal<EditableEntity[]>([]);
  protected readonly selectedTarget = signal<EditableEntity | undefined>(undefined);
  protected readonly updateBehaviorModel = signal<UpdateBehaviorModel>(defaultUpdateBehavior());
  protected readonly updateBehaviorForm = form(this.updateBehaviorModel);
  protected readonly mergeOptions = signal<MergeImportOptions>(defaultMergeOptions());
  protected readonly preparedRequest = signal<CommitImportRequest | undefined>(undefined);
  protected readonly importPreview = signal<ImportPreview | undefined>(undefined);
  protected readonly targetErrorMatcher: ErrorStateMatcher = {
    isErrorState: () => this.errorLocation() === 'target' && Boolean(this.error()),
  };
  protected readonly nameErrorMatcher: ErrorStateMatcher = {
    isErrorState: () => this.errorLocation() === 'name' && Boolean(this.error()),
  };
  protected readonly identifierErrorMatcher: ErrorStateMatcher = {
    isErrorState: () => this.errorLocation() === 'identifier' && Boolean(this.error()),
  };
  protected readonly isSynchronize = computed(() => this.operation() === 'synchronize');
  protected readonly sourceLabel = computed(() => sourceLabels[this.sourceName()]);
  protected readonly sourceSupportsSeason = computed(() => sourceSupportsSeason[this.sourceName()]);
  protected readonly sourceIdExample = computed(() => {
    if (this.sourceName() === 'transfermarkt') return this.mode() === 'league' ? 'GB1' : '281';
    if (this.sourceName() === 'soccerway') {
      return this.mode() === 'league'
        ? 'czech-republic/chance-liga/standings/bNFMkskm'
        : 'slavia-prague/viXGgnyB';
    }
    if (this.sourceName() === 'eurofotbal') {
      return this.mode() === 'league' ? 'chance-liga/2026-2027' : 'cesko/sparta-praha';
    }
    return this.mode() === 'league' ? 'co7093/mexico-lp---serie-b' : 'te237557/artesanos-metepec';
  });
  protected readonly sourceUrlExample = computed(() => {
    if (this.sourceName() === 'transfermarkt') {
      return this.mode() === 'league'
        ? 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1'
        : 'https://www.transfermarkt.com/slug/kader/verein/281/plus/1';
    }
    if (this.sourceName() === 'soccerway') {
      return this.mode() === 'league'
        ? 'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/'
        : 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/';
    }
    if (this.sourceName() === 'eurofotbal') {
      return this.mode() === 'league'
        ? 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/'
        : 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska';
    }
    return this.mode() === 'league'
      ? 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/'
      : 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/';
  });
  protected readonly sourceLabels = sourceLabels;
  protected readonly sourceSupportsSeasonByName = sourceSupportsSeason;
  protected readonly selectedPlayerCount = computed(() =>
    this.squads().reduce(
      (total, squad) => total + squad.players.filter((player) => player.selected).length,
      0,
    ),
  );
  protected readonly allTeamsSelected = computed(() => {
    this.teamSelectionVersion();
    const teams = this.leaguePreview()?.teams ?? [];
    return teams.length > 0 && this.teamSelection.selected.length === teams.length;
  });
  protected readonly someTeamsSelected = computed(() => {
    this.teamSelectionVersion();
    return this.teamSelection.selected.length > 0 && !this.allTeamsSelected();
  });
  protected readonly canReview = computed(() =>
    this.isSynchronize()
      ? Boolean(this.selectedTarget() && this.readyToCommit())
      : this.selectedPlayerCount() > 0,
  );
  protected readonly sourceComplete = computed(() =>
    this.mode() === 'league' ? Boolean(this.leaguePreview()) : this.readyToCommit(),
  );
  protected readonly summaryDetails = computed<ImportSummaryDetails | undefined>(() => {
    const request = this.preparedRequest();
    if (!request) return undefined;
    const source = request.league ?? request.teams.at(0);
    return {
      operation: this.isSynchronize() ? 'Update existing' : 'New import',
      sourceName: request.sourceName,
      entity: this.mode() === 'league' ? 'League' : 'Team',
      name: source?.name ?? this.name(),
      identifier: source?.sourceId ?? this.identifier(),
      season: source?.season,
      teamCount: request.teams.length,
      playerCount: request.teams.reduce((total, team) => total + team.players.length, 0),
    };
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
    void this.initializeFromQuery();
  }

  protected changeOperation(operation: 'merge' | 'synchronize'): void {
    if (this.operation() === operation) return;
    this.operation.set(operation);
    this.clearTarget(false);
    this.mergeOptions.set(defaultMergeOptions());
    this.resetStepper();
    if (operation === 'synchronize') void this.loadTargets('');
  }

  protected changeMode(mode: 'league' | 'team'): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.clearTarget(false);
    this.mergeOptions.set(defaultMergeOptions());
    this.resetStepper(1);
    if (this.isSynchronize()) void this.loadTargets('');
  }

  protected changeSource(sourceName: SourceName): void {
    if (this.sourceName() === sourceName) return;
    this.sourceName.set(sourceName);
    this.clearTarget(false);
    if (this.isSynchronize()) void this.loadTargets('');
  }

  protected setName(value: string): void {
    if (this.name() === value) return;
    this.sourceDetails.update((details) => ({ ...details, name: value }));
    this.resetPreview();
  }

  protected setIdentifier(value: string): void {
    if (this.identifier() === value) return;
    this.sourceDetails.update((details) => ({ ...details, identifier: value }));
    this.resetPreview();
  }

  protected setSeason(value: string): void {
    if (this.season() === value) return;
    this.sourceDetails.update((details) => ({ ...details, season: value }));
    this.resetPreview();
  }

  protected searchExisting(value: string): void {
    this.targetSearch.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.loadTargets(value), 250);
  }

  protected selectTarget(event: MatAutocompleteSelectedEvent): void {
    this.applyTarget(event.option.value as EditableEntity);
  }

  protected clearTarget(reload = true): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = undefined;
    }
    this.targetSequence += 1;
    this.targets.set([]);
    this.selectedTarget.set(undefined);
    this.targetSearch.set('');
    this.sourceDetails.set({ name: '', identifier: '', season: '' });
    this.resetPreview();
    this.resetUpdateBehavior();
    if (reload && this.isSynchronize()) void this.loadTargets('');
  }

  protected readonly displayTarget = (target: EditableEntity | string): string =>
    typeof target === 'string' ? target : target.name;

  protected async preview(): Promise<void> {
    this.clearError();
    if (this.isSynchronize() && !this.selectedTarget()) {
      this.setError(`Select an existing ${this.mode()} to update.`, 'target');
      return;
    }
    if (this.mode() === 'team' && !this.name().trim()) {
      this.sourceForm.name().markAsTouched();
      this.setError('Team name is required.', 'name');
      return;
    }
    if (!this.identifier().trim()) {
      this.sourceForm.identifier().markAsTouched();
      this.setError(`Enter a ${this.sourceLabel()} source ID or URL.`, 'identifier');
      return;
    }
    this.sourceForm.identifier().markAsTouched();
    this.sourceForm.season().markAsTouched();
    if (this.sourceForm.identifier().invalid()) {
      this.setError(
        this.sourceForm.identifier().errors()[0]?.message ??
          `Use a valid ${this.sourceLabel()} ${this.mode()} ID or URL.`,
        'identifier',
      );
      return;
    }
    if (this.sourceSupportsSeason() && this.sourceForm.season().invalid()) {
      this.setError(
        this.sourceForm.season().errors()[0]?.message ??
          'Use a four-digit season or leave it empty.',
        'identifier',
      );
      return;
    }
    const sequence = ++this.sourceSequence;
    this.busy.set(true);
    if (this.mode() === 'league') {
      const result = await this.api.previewLeague({
        sourceName: this.sourceName(),
        identifierOrUrl: this.identifier(),
        season: this.sourceSupportsSeason() ? this.season() || undefined : undefined,
      });
      if (sequence !== this.sourceSequence) return;
      this.busy.set(false);
      if (!result.ok) {
        this.setError(result.error.message, 'identifier');
        return;
      }
      if (
        result.value.name &&
        (!this.name().trim() ||
          this.name().trim().toLowerCase() === result.value.sourceId.toLowerCase())
      ) {
        this.sourceDetails.update((details) => ({ ...details, name: result.value.name ?? '' }));
      }
      this.leaguePreview.set(result.value);
      this.teamSelection.clear();
      this.teamSelection.select(...result.value.teams);
      this.teamSelectionVersion.update((version) => version + 1);
      this.squads.set([]);
      this.readyToCommit.set(false);
      this.invalidateReview();
      this.advance();
      return;
    }
    const result = await this.api.previewTeam({
      sourceName: this.sourceName(),
      identifierOrUrl: this.identifier(),
      name: this.name(),
      season: this.sourceSupportsSeason() ? this.season() || undefined : undefined,
    });
    if (sequence !== this.sourceSequence) return;
    this.busy.set(false);
    if (!result.ok) {
      this.setError(result.error.message, 'identifier');
      return;
    }
    this.setSquads([result.value]);
    this.advance();
  }

  protected continueUpdateOptions(): void {
    this.invalidateReview();
    this.advance();
  }

  protected async loadSelectedSquads(): Promise<void> {
    if (!this.teamSelection.selected.length) {
      if (this.isSynchronize() && this.mode() === 'league') {
        this.squads.set([]);
        this.readyToCommit.set(true);
        this.clearError();
        this.invalidateReview();
        this.advance();
        return;
      }
      this.setError('Select at least one team.');
      return;
    }
    const jobId = crypto.randomUUID();
    const sequence = ++this.squadSequence;
    this.jobId.set(jobId);
    this.busy.set(true);
    this.clearError();
    const result = await this.api.previewTeams({
      sourceName: this.sourceName(),
      jobId,
      teams: this.teamSelection.selected,
    });
    if (sequence !== this.squadSequence) return;
    this.busy.set(false);
    if (!result.ok) {
      this.setError(result.error.message);
      return;
    }
    this.setSquads(result.value);
    this.advance();
  }

  protected cancel(): void {
    const jobId = this.jobId();
    if (jobId) void this.api.cancelScrape(jobId);
  }

  protected toggleTeam(team: ExternalTeam, selected: boolean): void {
    if (selected) this.teamSelection.select(team);
    else this.teamSelection.deselect(team);
    this.teamSelectionVersion.update((version) => version + 1);
    this.squads.set([]);
    this.readyToCommit.set(false);
    this.invalidateReview();
  }

  protected toggleAllTeams(selected: boolean): void {
    this.teamSelection.clear();
    if (selected) this.teamSelection.select(...(this.leaguePreview()?.teams ?? []));
    this.teamSelectionVersion.update((version) => version + 1);
    this.squads.set([]);
    this.readyToCommit.set(false);
    this.invalidateReview();
  }

  protected togglePlayer(teamId: string, playerKey: string, selected: boolean): void {
    this.squads.update((squads) =>
      squads.map((squad) => {
        if (squad.team.sourceId !== teamId) return squad;
        const players = squad.players.map((player) =>
          player.key === playerKey ? { ...player, selected } : player,
        );
        return { ...squad, players, allSelected: players.every((player) => player.selected) };
      }),
    );
    this.invalidateReview();
  }

  protected toggleSquad(teamId: string, selected: boolean): void {
    this.squads.update((squads) =>
      squads.map((squad) =>
        squad.team.sourceId === teamId
          ? {
              ...squad,
              players: squad.players.map((player) => ({ ...player, selected })),
              allSelected: selected,
            }
          : squad,
      ),
    );
    this.invalidateReview();
  }

  protected invalidateReview(): void {
    this.reviewSequence += 1;
    this.busy.set(false);
    this.preparedRequest.set(undefined);
    this.importPreview.set(undefined);
  }

  protected async review(): Promise<void> {
    const prepared = await this.preparePreview(this.mergeOptions());
    if (!prepared) return;
    this.preparedRequest.set(prepared.request);
    this.importPreview.set(prepared.preview);
    this.advance();
  }

  protected async updateMergeOptions(options: MergeImportOptions): Promise<void> {
    const prepared = await this.preparePreview(options, this.importPreview());
    if (!prepared) return;
    this.preparedRequest.set(prepared.request);
    this.importPreview.set(prepared.preview);
  }

  protected async commit(): Promise<void> {
    const request = this.preparedRequest();
    if (!request) return;
    this.busy.set(true);
    this.clearError();
    const result = await this.api.commitImport(request);
    this.busy.set(false);
    if (!result.ok) {
      this.setError(result.error.message);
      return;
    }
    this.confetti.celebrate();
    await this.api.getProjectSummary(this.projectId);
    if (this.isSynchronize()) {
      const added =
        result.value.changes.leagues.added +
        result.value.changes.teams.added +
        result.value.changes.players.added;
      const updated =
        result.value.changes.leagues.updated +
        result.value.changes.teams.updated +
        result.value.changes.players.updated;
      const deleted =
        result.value.changes.leagues.deleted +
        result.value.changes.teams.deleted +
        result.value.changes.players.deleted;
      const detached = result.value.changes.teams.detached;
      const moved = result.value.changes.teams.moved + result.value.changes.players.moved;
      const preserved =
        result.value.changes.leagues.preserved +
        result.value.changes.teams.preserved +
        result.value.changes.players.preserved;
      const deduplicated = result.value.changes.players.deduplicated;
      this.snackBar.open(
        `Update complete. ${added} added, ${updated} refreshed, ${preserved} preserved, ${moved} moved, ${detached} detached, ${deduplicated} duplicates removed, ${deleted} deleted.`,
        'Dismiss',
        { duration: 5000 },
      );
      await this.router.navigate([
        '/projects',
        this.projectId,
        'source',
        'objects',
        this.returnTo ?? `${this.mode()}s`,
      ]);
      return;
    }
    const changes = result.value.changes;
    const refreshed = changes.leagues.updated + changes.teams.updated + changes.players.updated;
    const preserved =
      changes.leagues.preserved + changes.teams.preserved + changes.players.preserved;
    const moved = changes.teams.moved + changes.players.moved;
    this.snackBar.open(
      `Import complete. ${refreshed} refreshed, ${preserved} preserved, ${moved} moved, ${changes.players.deduplicated} duplicates removed.`,
      'Dismiss',
      { duration: 5000 },
    );
    await this.router.navigate(['/projects', this.projectId]);
  }

  private buildRequest(mergeOptions: MergeImportOptions): CommitImportRequest | undefined {
    if (this.isSynchronize() && !this.selectedTarget()) {
      this.setError(`Select an existing ${this.mode()} to update.`);
      return undefined;
    }
    const selectedTeams = this.squads().map((squad) => ({
      ...squad.team,
      players: squad.players.filter((player) => player.selected).map((player) => player.player),
    }));
    const teams = this.isSynchronize()
      ? selectedTeams
      : selectedTeams.filter((team) => team.players.length > 0);
    if (!this.isSynchronize() && !teams.length) {
      this.setError('Select at least one player to import.');
      return undefined;
    }
    let league: ImportLeague | undefined;
    const preview = this.leaguePreview();
    if (this.mode() === 'league' && preview) {
      league = {
        sourceId: preview.sourceId,
        name: this.name().trim(),
        season: preview.season,
        sourceUrl: preview.sourceUrl,
      };
    }
    const target = this.selectedTarget();
    return {
      projectId: this.projectId,
      sourceName: this.sourceName(),
      operation:
        this.isSynchronize() && target
          ? this.createSynchronizationOperation(target)
          : { kind: 'merge', options: mergeOptions },
      league,
      teams,
    };
  }

  private async loadImportPreview(
    request: CommitImportRequest,
  ): Promise<ImportPreview | undefined> {
    const sequence = ++this.reviewSequence;
    this.busy.set(true);
    this.clearError();
    const result = await this.api.previewImportChanges(request);
    if (sequence !== this.reviewSequence) return undefined;
    this.busy.set(false);
    if (!result.ok) {
      this.setError(result.error.message);
      return undefined;
    }
    return result.value;
  }

  private async preparePreview(
    options: MergeImportOptions,
    currentPreview?: ImportPreview,
  ): Promise<{ request: CommitImportRequest; preview: ImportPreview } | undefined> {
    let normalized = this.normalizeMergeOptions(options, currentPreview);
    this.mergeOptions.set(normalized);
    let request = this.buildRequest(normalized);
    if (!request) return undefined;
    let preview = await this.loadImportPreview(request);
    if (!preview) return undefined;

    const previewOptions = this.normalizeMergeOptions(normalized, preview);
    if (previewOptions.playerTeamConflicts !== normalized.playerTeamConflicts) {
      normalized = previewOptions;
      this.mergeOptions.set(normalized);
      request = this.buildRequest(normalized);
      if (!request) return undefined;
      const refreshedPreview = await this.loadImportPreview(request);
      if (!refreshedPreview) return undefined;
      preview = refreshedPreview;
    }
    return { request, preview };
  }

  private normalizeMergeOptions(
    options: MergeImportOptions,
    preview?: ImportPreview,
  ): MergeImportOptions {
    if (this.isSynchronize()) return options;
    const hasLegacyCopies = preview?.conflicts.playerTeamConflicts.some(
      ({ legacyCopyCount }) => legacyCopyCount > 1,
    );
    return hasLegacyCopies ? { ...options, playerTeamConflicts: 'move' } : options;
  }

  private async initializeFromQuery(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const entity = params.get('entity');
    const targetId = params.get('targetId');
    const returnTo = params.get('returnTo');
    if (returnTo === 'leagues' || returnTo === 'teams') this.returnTo = returnTo;
    if (
      params.get('operation') !== 'synchronize' ||
      !targetId ||
      (entity !== 'leagues' && entity !== 'teams')
    ) {
      return;
    }
    this.operation.set('synchronize');
    this.mode.set(entity === 'leagues' ? 'league' : 'team');
    this.busy.set(true);
    const result = await this.api.getEntity(this.projectId, entity, targetId);
    this.busy.set(false);
    if (!result.ok) {
      this.setError(result.error.message, 'target');
      return;
    }
    this.applyTarget(result.value);
  }

  private applyTarget(target: EditableEntity): void {
    this.resetUpdateBehavior();
    this.selectedTarget.set(target);
    this.sourceName.set(target.sourceName);
    this.targetSearch.set(target.name);
    this.sourceDetails.set({
      name: target.name,
      identifier: target.sourceId,
      season: target.season ?? '',
    });
    this.resetPreview();
  }

  private async loadTargets(search: string): Promise<void> {
    const sequence = ++this.targetSequence;
    const entity: EditableEntityKind = this.mode() === 'league' ? 'leagues' : 'teams';
    const result = await this.api.listEntities({
      projectId: this.projectId,
      entity,
      pageIndex: 0,
      pageSize: 25,
      search,
      sort: 'name',
      direction: 'asc',
      sourceNames: [this.sourceName()],
    });
    if (sequence !== this.targetSequence) return;
    if (!result.ok) {
      this.setError(result.error.message, 'target');
      return;
    }
    this.targets.set(result.value.rows as EditableEntity[]);
  }

  protected resetPreview(): void {
    this.sourceSequence += 1;
    this.squadSequence += 1;
    this.leaguePreview.set(undefined);
    this.teamSelection.clear();
    this.teamSelectionVersion.update((version) => version + 1);
    this.squads.set([]);
    this.readyToCommit.set(false);
    this.clearError();
    this.invalidateReview();
  }

  private resetUpdateBehavior(): void {
    this.updateBehaviorModel.set(defaultUpdateBehavior());
  }

  private setError(message: string, location: ImportErrorLocation = 'page'): void {
    this.errorLocation.set(location);
    this.error.set(message);
    this.updateInputErrorStates();
  }

  private clearError(): void {
    this.error.set('');
    this.errorLocation.set('page');
    this.updateInputErrorStates();
  }

  private updateInputErrorStates(): void {
    this.changeDetector.markForCheck();
  }

  private createSynchronizationOperation(target: EditableEntity): SynchronizeImportOperation {
    const behavior = this.updateBehaviorModel();
    if (this.mode() === 'league') {
      return {
        kind: 'synchronize',
        target: { entity: 'leagues', id: target.id },
        options: {
          absentTeams: behavior.absentTeams,
          absentPlayers: behavior.absentPlayers,
          overrideTeamNames: behavior.overrideTeamNames,
          overridePlayerNames: behavior.overridePlayerNames,
          teamLeagueConflicts: behavior.teamLeagueConflicts,
          playerTeamConflicts: behavior.playerTeamConflicts,
        },
      };
    }
    return {
      kind: 'synchronize',
      target: { entity: 'teams', id: target.id },
      options: {
        absentPlayers: behavior.absentPlayers,
        overridePlayerNames: behavior.overridePlayerNames,
        playerTeamConflicts: behavior.playerTeamConflicts,
      },
    };
  }

  private setSquads(previews: TeamPreview[]): void {
    this.squads.set(
      previews.map((team) => ({
        team,
        allSelected: true,
        players: team.players.map((player, index) => ({
          key: player.sourceId ?? `${player.name}:${index}`,
          player,
          selected: true,
        })),
      })),
    );
    this.readyToCommit.set(true);
    this.invalidateReview();
  }

  private advance(): void {
    this.changeDetector.detectChanges();
    this.stepper()?.next();
  }

  private resetStepper(index = 0): void {
    const stepper = this.stepper();
    if (stepper) stepper.selectedIndex = index;
  }
}
