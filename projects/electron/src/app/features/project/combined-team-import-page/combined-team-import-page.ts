import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';

import {
  collectPlayerConflicts,
  defaultSourcePriority,
  playerFields,
  resolveNameValue,
  resolvePlayer,
  resolveValue,
} from '../../../../../shared/downloader/combined-data';
import {
  type CombineTeamCandidate,
  type CombinedLeagueSelection,
  type FieldConflict,
  type FieldResolution,
  type FieldResolutions,
  type League,
  type PlayerInput,
  type PlayerMatchGroup,
  type PlayerPosition,
  type PlayerSourceRecord,
  type SourceName,
  type TeamCombinationPreview,
  sourceLabels,
  sourceNames,
} from '../../../../../shared/downloader/contracts';
import { findFootballCountryByCode3 } from '../../../../../shared/downloader/football-countries';
import { formatReferenceDate } from '../../../../../shared/downloader/reference-date';
import { formatEuroCurrency, formatUiNumber } from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import { ConfettiService } from '../../../shared/confetti/confetti.service';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { PageHeader } from '../../../shared/page-header/page-header';
import { PositionBadge, positionBadgeDetails } from '../../../shared/position-badge/position-badge';
import { ReferenceDatePipe } from '../../../shared/reference-date-pipe';

type LeagueMode = 'none' | 'existing' | 'create';
type PlayerReviewField = (typeof playerFields)[number];
type ReviewValue = string | number | undefined;

interface ReviewFieldDefinition<Field extends string = string> {
  key: Field;
  label: string;
}

interface ReviewValueOption {
  key: string;
  sourceName: SourceName;
  displayValue: string;
}

interface ReviewField {
  key: string;
  label: string;
  conflict: FieldConflict;
  options: ReviewValueOption[];
  selectedOptionKey?: string;
}

interface ReviewCard {
  id: string;
  headingId: string;
  kind: 'team' | 'player';
  name: string;
  position?: PlayerPosition;
  birthdate?: string;
  countryName?: string;
  countryCode2?: string;
  fields: ReviewField[];
}

interface SummaryPlayer {
  groupId: string;
  name: string;
  position?: PlayerPosition;
  birthdate?: string;
  countryName?: string;
  countryCode2?: string;
}

interface FootballFlagSource {
  readonly countryCode2?: string;
  readonly countryCode3?: string;
}

const teamFieldDefinitions = [
  { key: 'name', label: 'Name' },
  { key: 'countryName', label: 'Country name' },
  { key: 'countryCode2', label: 'Country code (2)' },
  { key: 'countryCode3', label: 'Country code (3)' },
  { key: 'season', label: 'Season' },
] as const satisfies readonly ReviewFieldDefinition[];

const playerFieldLabels: Record<PlayerReviewField, string> = {
  name: 'Name',
  firstName: 'First name',
  lastName: 'Last name',
  jerseyNumber: 'Jersey number',
  position: 'Position',
  positionDetail: 'Position detail',
  birthdate: 'Birthdate',
  height: 'Height',
  weight: 'Weight',
  foot: 'Foot',
  joined: 'Joined',
  contractExpires: 'Contract expires',
  marketValue: 'Market value',
  countryName: 'Country name',
  countryCode2: 'Country code (2)',
  countryCode3: 'Country code (3)',
  minutesPlayed: 'Minutes played',
};

const playerFieldDefinitions: readonly ReviewFieldDefinition<PlayerReviewField>[] =
  playerFields.map((key) => ({ key, label: playerFieldLabels[key] }));
const playerDateFields = new Set<PlayerReviewField>(['birthdate', 'joined', 'contractExpires']);
const footLabels = { LEFT: 'Left', RIGHT: 'Right' } as const;
const hasValue = (value: unknown): value is string | number =>
  value !== undefined && value !== null && value !== '';
const normalizedName = (value: string | undefined): string | undefined => {
  const name = value?.trim();
  if (!name) return undefined;
  return name;
};

interface PlayerDragData {
  groupId: string;
  playerId: string;
  sourceName: SourceName;
  canSeparate: boolean;
}

interface PlayerDropCell {
  groupId?: string;
  sourceName: SourceName;
  newRow: boolean;
}

interface AutomaticTeamSelection {
  anchorSourceName: SourceName;
  teamId: string;
  automaticLeagueId?: string;
}

@Component({
  selector: 'app-combined-team-import-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CdkDropListGroup,
    DecimalPipe,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatStepperModule,
    MatTooltipModule,
    CountryFlag,
    PageHeader,
    PositionBadge,
    ReferenceDatePipe,
  ],
  templateUrl: './combined-team-import-page.html',
  styleUrl: './combined-team-import-page.css',
})
export class CombinedTeamImportPage {
  private readonly api = inject(DesktopApi);
  private readonly confetti = inject(ConfettiService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stepper = viewChild(MatStepper);
  private readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  private readonly candidateSearchTimers: Partial<
    Record<SourceName, ReturnType<typeof setTimeout>>
  > = {};
  private readonly leagueSearchTimers: Partial<Record<SourceName, ReturnType<typeof setTimeout>>> =
    {};
  private readonly candidateSequences: Record<SourceName, number> = {
    transfermarkt: 0,
    soccerway: 0,
    worldfootball: 0,
    eurofotbal: 0,
  };
  private readonly leagueSequences: Record<SourceName, number> = {
    transfermarkt: 0,
    soccerway: 0,
    worldfootball: 0,
    eurofotbal: 0,
  };
  private automaticMatchSequence = 0;
  protected readonly combinedTeamId = signal(this.route.snapshot.queryParamMap.get('teamId') ?? '');
  protected readonly priority = signal<SourceName[]>([...defaultSourcePriority]);
  protected readonly candidates = signal<Record<SourceName, CombineTeamCandidate[]>>({
    transfermarkt: [],
    soccerway: [],
    worldfootball: [],
    eurofotbal: [],
  });
  protected readonly leagueCandidates = signal<Record<SourceName, League[]>>({
    transfermarkt: [],
    soccerway: [],
    worldfootball: [],
    eurofotbal: [],
  });
  protected readonly selectedTeamIds = signal<Partial<Record<SourceName, string>>>({});
  protected readonly selectedLeagueIds = signal<Partial<Record<SourceName, string>>>({});
  protected readonly automaticTeamSelections = signal<
    Partial<Record<SourceName, AutomaticTeamSelection>>
  >({});
  protected readonly teamSearches = signal<Record<SourceName, string>>({
    transfermarkt: '',
    soccerway: '',
    worldfootball: '',
    eurofotbal: '',
  });
  protected readonly leagueSearches = signal<Record<SourceName, string>>({
    transfermarkt: '',
    soccerway: '',
    worldfootball: '',
    eurofotbal: '',
  });
  protected readonly preview = signal<TeamCombinationPreview | undefined>(undefined);
  protected readonly matchGroups = signal<PlayerMatchGroup[]>([]);
  protected readonly selectedPlayerGroupIds = signal<ReadonlySet<string>>(new Set());
  protected readonly teamResolutions = signal<FieldResolutions>({});
  protected readonly playerResolutions = signal<Record<string, FieldResolutions>>({});
  protected readonly leagueMode = signal<LeagueMode>('none');
  protected readonly combinedLeagueId = signal('');
  protected readonly sourceLeagueIds = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly autoMatching = signal(false);
  protected readonly error = signal('');
  protected readonly sourceLabels = sourceLabels;
  protected readonly sourceNames = sourceNames;
  protected readonly orderedSources = computed(() => this.priority());
  protected readonly activeSources = computed(() => {
    const selected = new Set(this.preview()?.sourceTeams.map(({ sourceName }) => sourceName) ?? []);
    return this.priority().filter((sourceName) => selected.has(sourceName));
  });
  protected readonly selectedCombinedLeague = computed(() =>
    this.preview()?.combinedLeagues.find(({ id }) => id === this.combinedLeagueId()),
  );
  protected readonly selectedTeamCount = computed(
    () => Object.values(this.selectedTeamIds()).filter(Boolean).length,
  );
  protected readonly showPlayerMatches = computed(
    () => (this.preview()?.sourceTeams.length ?? 0) > 1,
  );
  protected readonly automaticTeamCount = computed(
    () => Object.values(this.automaticTeamSelections()).filter(Boolean).length,
  );
  protected readonly automaticGroupCount = computed(
    () => this.matchGroups().filter(({ automatic }) => automatic).length,
  );
  protected readonly unmatchedGroupCount = computed(
    () => this.matchGroups().filter(({ players }) => players.length === 1).length,
  );
  protected readonly selectedPlayerGroupIdList = computed(() => {
    const selected = this.selectedPlayerGroupIds();
    return this.matchGroups().flatMap(({ id }) => (selected.has(id) ? [id] : []));
  });
  protected readonly selectedPlayerCount = computed(() => this.selectedPlayerGroupIdList().length);
  protected readonly conflicts = computed<FieldConflict[]>(() => {
    const preview = this.preview();
    if (!preview) return [];
    return [
      ...preview.conflicts
        .filter(({ entity }) => entity !== 'player')
        .map((conflict) => ({
          ...conflict,
          resolution: this.teamResolutions()[conflict.field],
          resolvedValue:
            conflict.field === 'name'
              ? resolveNameValue(
                  conflict.values.map(({ sourceName, value }) => ({
                    sourceName,
                    value: typeof value === 'string' ? value : undefined,
                  })),
                  this.priority(),
                  this.teamResolutions()[conflict.field],
                )
              : resolveValue(
                  conflict.values,
                  this.priority(),
                  this.teamResolutions()[conflict.field],
                ),
        })),
      ...collectPlayerConflicts(this.matchGroups(), this.priority(), this.playerResolutions()),
    ];
  });
  protected readonly reviewCards = computed<ReviewCard[]>(() => {
    const preview = this.preview();
    if (!preview) return [];
    const conflicts = this.conflicts();
    const teamConflicts = conflicts.filter(({ entity }) => entity === 'team');
    return [
      ...(teamConflicts.length ? [this.buildTeamReviewCard(preview, teamConflicts)] : []),
      ...this.matchGroups().flatMap((group, index) => {
        const playerConflicts = conflicts.filter(
          ({ entity, entityId }) => entity === 'player' && entityId === group.id,
        );
        return playerConflicts.length
          ? [this.buildPlayerReviewCard(group, index, playerConflicts)]
          : [];
      }),
    ];
  });
  protected readonly showConflicts = computed(() => this.reviewCards().length > 0);
  protected readonly summaryPlayers = computed<SummaryPlayer[]>(() => {
    const priority = this.priority();
    const resolutions = this.playerResolutions();
    return this.matchGroups().map((group) => {
      const resolved = resolvePlayer(group, priority, resolutions[group.id]);
      return {
        groupId: group.id,
        name: normalizedName(resolved.name) ?? 'Unnamed player',
        position: resolved.position,
        birthdate: resolved.birthdate,
        countryName: resolved.countryName,
        countryCode2: resolved.countryCode2,
      };
    });
  });
  protected readonly selectedPlayersWithoutBirthdateCount = computed(() => {
    const selected = this.selectedPlayerGroupIds();
    return this.summaryPlayers().filter(
      ({ groupId, birthdate }) => selected.has(groupId) && !birthdate,
    ).length;
  });
  protected readonly canEnterPlayerCell = (
    drag: CdkDrag<PlayerDragData>,
    drop: CdkDropList<PlayerDropCell>,
  ): boolean =>
    drag.data.sourceName === drop.data.sourceName &&
    (drop.data.newRow ? drag.data.canSeparate : drop.data.groupId !== drag.data.groupId);

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timer of Object.values(this.candidateSearchTimers)) {
        if (timer) clearTimeout(timer);
      }
      for (const timer of Object.values(this.leagueSearchTimers)) {
        if (timer) clearTimeout(timer);
      }
      this.cancelAutomaticMatching();
    });
    void this.initialize();
  }

  protected searchLeagues(sourceName: SourceName, value: string): void {
    const selectedLeagueId = this.selectedLeagueIds()[sourceName];
    const selectedValue = this.leagueSearches()[sourceName];
    this.leagueSearches.update((searches) => ({ ...searches, [sourceName]: value }));
    if (selectedLeagueId && value !== selectedValue) {
      this.cancelAutomaticMatching();
      this.markLeagueAsManual(sourceName);
      this.selectedLeagueIds.update((leagueIds) => ({ ...leagueIds, [sourceName]: undefined }));
      void this.loadCandidates(sourceName, this.teamSearches()[sourceName]);
    }
    const timer = this.leagueSearchTimers[sourceName];
    if (timer) clearTimeout(timer);
    this.leagueSearchTimers[sourceName] = setTimeout(
      () => void this.loadLeagues(sourceName, value),
      250,
    );
  }

  protected selectLeague(sourceName: SourceName, event: MatAutocompleteSelectedEvent): void {
    this.cancelAutomaticMatching();
    this.markLeagueAsManual(sourceName);
    const league = event.option.value as League;
    this.selectedLeagueIds.update((selected) => ({ ...selected, [sourceName]: league.id }));
    this.leagueSearches.update((searches) => ({ ...searches, [sourceName]: league.name }));
    const team = this.selectedCandidate(sourceName);
    if (team && team.leagueId !== league.id) {
      if (this.automaticTeamSelections()[sourceName]) {
        this.removeAutomaticTeamSelection(sourceName);
      } else {
        this.clearAutomaticTeamSelections(
          ({ anchorSourceName }) => anchorSourceName === sourceName,
        );
      }
      this.clearSelectedTeam(sourceName);
      this.invalidatePreview();
    }
    void this.loadCandidates(sourceName, this.teamSearches()[sourceName], league.id);
  }

  protected clearLeague(sourceName: SourceName): void {
    this.cancelAutomaticMatching();
    this.markLeagueAsManual(sourceName);
    const timer = this.leagueSearchTimers[sourceName];
    if (timer) clearTimeout(timer);
    this.leagueSearchTimers[sourceName] = undefined;
    this.leagueSequences[sourceName] += 1;
    this.selectedLeagueIds.update((selected) => ({ ...selected, [sourceName]: undefined }));
    this.leagueSearches.update((searches) => ({ ...searches, [sourceName]: '' }));
    void this.loadLeagues(sourceName, '');
    void this.loadCandidates(sourceName, this.teamSearches()[sourceName]);
  }

  protected readonly displayLeague = (league: League | string): string =>
    typeof league === 'string' ? league : league.name;

  protected selectedLeague(sourceName: SourceName): League | undefined {
    const id = this.selectedLeagueIds()[sourceName];
    return this.leagueCandidates()[sourceName].find((league) => league.id === id);
  }

  protected countryFlagCode(record: FootballFlagSource): string | undefined {
    return record.countryCode3
      ? (findFootballCountryByCode3(record.countryCode3)?.flagCode ?? record.countryCode2)
      : record.countryCode2;
  }

  protected searchTeams(sourceName: SourceName, value: string): void {
    const selected = this.selectedCandidate(sourceName);
    if (selected && value !== selected.name) {
      this.cancelAutomaticMatching();
      if (this.automaticTeamSelections()[sourceName]) {
        this.clearAutomaticTeamSelections((_, candidateSourceName) => {
          return candidateSourceName === sourceName;
        });
      } else {
        this.clearAutomaticTeamSelections(
          ({ anchorSourceName }) => anchorSourceName === sourceName,
        );
        this.selectedTeamIds.update((teamIds) => ({ ...teamIds, [sourceName]: undefined }));
      }
      this.invalidatePreview();
    }
    this.teamSearches.update((searches) => ({ ...searches, [sourceName]: value }));
    const timer = this.candidateSearchTimers[sourceName];
    if (timer) clearTimeout(timer);
    this.candidateSearchTimers[sourceName] = setTimeout(
      () => void this.loadCandidates(sourceName, value, this.selectedLeagueIds()[sourceName]),
      250,
    );
  }

  protected selectTeam(sourceName: SourceName, event: MatAutocompleteSelectedEvent): void {
    const candidate = event.option.value as CombineTeamCandidate;
    this.cancelAutomaticMatching();
    this.removeAutomaticTeamSelection(sourceName);
    this.clearAutomaticTeamSelections();
    this.selectedTeamIds.update((selected) => ({
      ...selected,
      [sourceName]: candidate.id,
    }));
    this.teamSearches.update((searches) => ({ ...searches, [sourceName]: candidate.name }));
    this.selectCandidateLeague(sourceName, candidate);
    this.invalidatePreview();
    void this.loadCandidates(sourceName, candidate.name, candidate.leagueId);
    void this.matchTeamsFromAnchor(sourceName, candidate);
  }

  protected clearTeam(sourceName: SourceName): void {
    this.cancelAutomaticMatching();
    const timer = this.candidateSearchTimers[sourceName];
    if (timer) clearTimeout(timer);
    this.candidateSearchTimers[sourceName] = undefined;
    this.candidateSequences[sourceName] += 1;
    if (this.automaticTeamSelections()[sourceName]) {
      this.clearAutomaticTeamSelections((_, candidateSourceName) => {
        return candidateSourceName === sourceName;
      });
    } else {
      this.clearAutomaticTeamSelections(({ anchorSourceName }) => anchorSourceName === sourceName);
      this.clearSelectedTeam(sourceName);
    }
    this.invalidatePreview();
    void this.loadCandidates(sourceName, '', this.selectedLeagueIds()[sourceName]);
  }

  protected readonly displayCandidate = (candidate: CombineTeamCandidate | string): string =>
    typeof candidate === 'string' ? candidate : candidate.name;

  protected selectedCandidate(sourceName: SourceName): CombineTeamCandidate | undefined {
    const id = this.selectedTeamIds()[sourceName];
    return this.candidates()[sourceName].find((candidate) => candidate.id === id);
  }

  protected candidateDisabled(candidate: CombineTeamCandidate): boolean {
    return Boolean(candidate.combinedTeamId && candidate.combinedTeamId !== this.combinedTeamId());
  }

  protected automaticMatchLabel(sourceName: SourceName): string | undefined {
    const selection = this.automaticTeamSelections()[sourceName];
    return selection
      ? `Matched automatically from ${this.sourceLabels[selection.anchorSourceName]}`
      : undefined;
  }

  protected async prepare(): Promise<void> {
    if (this.autoMatching()) return;
    if (!this.selectedTeamCount()) {
      this.error.set('Choose at least one source team.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const result = await this.api.previewTeamCombination({
      projectId: this.projectId,
      sourceTeamIds: Object.values(this.selectedTeamIds()).filter((id): id is string =>
        Boolean(id),
      ),
      combinedTeamId: this.combinedTeamId() || undefined,
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    this.applyPreview(result.value);
    afterNextRender(() => this.advance(), { injector: this.injector });
  }

  protected setLeagueMode(mode: LeagueMode): void {
    this.leagueMode.set(mode);
    if (mode !== 'existing') this.combinedLeagueId.set('');
    if (mode === 'create') {
      this.sourceLeagueIds.set(this.preview()?.sourceLeagues.map(({ id }) => id) ?? []);
    }
  }

  protected playerFor(
    group: PlayerMatchGroup,
    sourceName: SourceName,
  ): PlayerSourceRecord | undefined {
    return group.players.find((player) => player.sourceName === sourceName);
  }

  protected matchStatus(group: PlayerMatchGroup): string {
    if (group.players.length === 1) return 'Single-source player';
    return group.automatic ? 'Automatic match' : 'Manual match';
  }

  protected countryLabel(player: Pick<PlayerInput, 'countryName' | 'countryCode2'>): string {
    return player.countryName ?? player.countryCode2?.toLocaleUpperCase('en') ?? '';
  }

  protected dragData(group: PlayerMatchGroup, player: PlayerSourceRecord): PlayerDragData {
    return {
      groupId: group.id,
      playerId: player.id,
      sourceName: player.sourceName,
      canSeparate: group.players.length > 1,
    };
  }

  protected dropCellData(sourceName: SourceName, groupId?: string, newRow = false): PlayerDropCell {
    return { groupId, sourceName, newRow };
  }

  protected dropPlayer(event: CdkDragDrop<PlayerDropCell, PlayerDropCell, PlayerDragData>): void {
    const player = event.item.data;
    const destination = event.container.data;
    if (player.sourceName !== destination.sourceName || destination.groupId === player.groupId) {
      return;
    }
    if (destination.newRow) {
      this.separatePlayer(player.groupId, player.playerId);
      return;
    }
    if (!destination.groupId) return;
    this.movePlayerToGroup(player.groupId, player.playerId, destination.groupId);
  }

  protected movePlayer(groupId: string, playerId: string, direction: -1 | 1): void {
    const groups = this.matchGroups();
    const sourceIndex = groups.findIndex((group) => group.id === groupId);
    const destinationIndex = sourceIndex + direction;
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= groups.length) return;
    this.movePlayerToGroup(groupId, playerId, groups[destinationIndex].id);
  }

  protected separatePlayer(groupId: string, playerId: string): void {
    const group = this.matchGroups().find(({ id }) => id === groupId);
    const player = group?.players.find(({ id }) => id === playerId);
    if (!group || !player || group.players.length < 2) return;

    const remainingPlayers = group.players.filter(({ id }) => id !== playerId);
    const newGroup: PlayerMatchGroup = {
      id: crypto.randomUUID(),
      players: [player],
      automatic: false,
      ambiguous: false,
    };
    this.matchGroups.update((groups) => [
      ...groups.map((candidate) =>
        candidate.id === groupId
          ? {
              ...candidate,
              players: remainingPlayers,
              automatic: false,
              ambiguous: false,
            }
          : candidate,
      ),
      newGroup,
    ]);
    if (this.selectedPlayerGroupIds().has(groupId)) {
      this.selectedPlayerGroupIds.update((selected) => new Set(selected).add(newGroup.id));
    }
    this.clearPlayerResolutions(groupId);
    this.error.set('');
    void this.liveAnnouncer.announce(`${player.name} separated into a new single-source row.`);
    this.focusPlayer(player.id);
  }

  protected continueMatches(): void {
    this.error.set('');
    this.advance();
  }

  protected selectReviewOption(field: ReviewField, optionKey: string): void {
    const option = field.options.find(({ key }) => key === optionKey);
    if (option) this.setResolution(field.conflict, option.sourceName);
  }

  protected setResolution(conflict: FieldConflict, value: string): void {
    if (value === 'auto') {
      this.updateResolution(conflict, undefined);
      return;
    }
    this.updateResolution(conflict, { mode: 'source', sourceName: value as SourceName });
  }

  protected continueConflicts(): void {
    const nameConflict = this.conflicts().find(
      ({ entity, field, resolvedValue }) =>
        (entity === 'team' || entity === 'player') &&
        field === 'name' &&
        !String(resolvedValue ?? '').trim(),
    );
    if (nameConflict) {
      this.error.set('Team and player names cannot be empty.');
      return;
    }
    this.error.set('');
    this.advance();
  }

  protected toggleSummaryPlayer(groupId: string, selected: boolean): void {
    this.selectedPlayerGroupIds.update((current) => {
      const next = new Set(current);
      if (selected) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
    if (selected) this.error.set('');
  }

  protected deselectPlayersWithoutBirthdate(): void {
    const groupIds = new Set(
      this.summaryPlayers()
        .filter(({ birthdate }) => !birthdate)
        .map(({ groupId }) => groupId),
    );
    const deselectedCount = [...this.selectedPlayerGroupIds()].filter((id) =>
      groupIds.has(id),
    ).length;
    if (!deselectedCount) return;
    this.selectedPlayerGroupIds.update(
      (current) => new Set([...current].filter((id) => !groupIds.has(id))),
    );
    void this.liveAnnouncer.announce(
      `${deselectedCount} ${deselectedCount === 1 ? 'player' : 'players'} without a birthdate deselected.`,
    );
  }

  protected async commit(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;
    if (!this.selectedPlayerCount()) {
      this.error.set('Select at least one project player.');
      return;
    }
    const league = this.buildLeagueSelection();
    if (!league) return;
    this.busy.set(true);
    this.error.set('');
    const result = await this.api.commitTeamCombination({
      projectId: this.projectId,
      sourceTeamIds: preview.sourceTeams.map(({ id }) => id),
      combinedTeamId: this.combinedTeamId() || undefined,
      league,
      matchGroups: this.matchGroups(),
      selectedPlayerGroupIds: this.selectedPlayerGroupIdList(),
      teamResolutions: this.teamResolutions(),
      playerResolutions: this.playerResolutions(),
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    this.confetti.celebrate();
    const action = this.combinedTeamId() ? 'recombined' : 'imported';
    this.snackBar.open(
      `${result.value.team.name} ${action}. ${result.value.addedPlayers} players added, ${result.value.updatedPlayers} updated, ${result.value.deletedPlayers} removed.`,
      'Dismiss',
      { duration: 6000 },
    );
    await this.router.navigate(['/projects', this.projectId, 'combined', 'objects', 'teams']);
  }

  private buildTeamReviewCard(
    preview: TeamCombinationPreview,
    conflicts: FieldConflict[],
  ): ReviewCard {
    const fields = teamFieldDefinitions.flatMap((definition) => {
      const conflict = conflicts.find(({ field }) => field === definition.key);
      if (!conflict) return [];
      const values = preview.sourceTeams.map((team) => ({
        sourceName: team.sourceName,
        value: team[definition.key],
      }));
      const resolution = this.teamResolutions()[definition.key];
      const resolvedValue =
        definition.key === 'name'
          ? resolveNameValue(values, this.priority(), resolution)
          : resolveValue(values, this.priority(), resolution);
      return [this.buildReviewField(definition, resolvedValue, conflict)];
    });
    const name = resolveNameValue(
      preview.sourceTeams.map((team) => ({
        sourceName: team.sourceName,
        value: team.name,
      })),
      this.priority(),
      this.teamResolutions()['name'],
    );
    return {
      id: 'team',
      headingId: 'review-team-heading',
      kind: 'team',
      name: normalizedName(name) ?? 'Project team',
      countryName: this.resolveTeamCountryValue(preview, 'countryName'),
      countryCode2: this.resolveTeamCountryValue(preview, 'countryCode2'),
      fields,
    };
  }

  private buildPlayerReviewCard(
    group: PlayerMatchGroup,
    index: number,
    conflicts: FieldConflict[],
  ): ReviewCard {
    const resolutions = this.playerResolutions()[group.id] ?? {};
    const resolved = resolvePlayer(group, this.priority(), resolutions);
    const fields = playerFieldDefinitions.flatMap((definition) => {
      const conflict = conflicts.find(({ field }) => field === definition.key);
      return conflict
        ? [this.buildReviewField(definition, resolved[definition.key], conflict)]
        : [];
    });
    const resolvedName = (resolved as Partial<PlayerInput>).name;
    return {
      id: `player-${group.id}`,
      headingId: `review-player-${index + 1}-heading`,
      kind: 'player',
      name: normalizedName(resolvedName) ?? 'Unnamed player',
      position: resolved.position,
      birthdate: resolved.birthdate,
      countryName: resolved.countryName,
      countryCode2: resolved.countryCode2,
      fields,
    };
  }

  private resolveTeamCountryValue(
    preview: TeamCombinationPreview,
    field: 'countryName' | 'countryCode2',
  ): string | undefined {
    return resolveValue(
      preview.sourceTeams.map((team) => ({
        sourceName: team.sourceName,
        value: team[field],
      })),
      this.priority(),
      this.teamResolutions()[field],
    );
  }

  private buildReviewField(
    definition: ReviewFieldDefinition,
    resolvedValue: ReviewValue,
    conflict: FieldConflict,
  ): ReviewField {
    const options = this.reviewOptions(definition.key, conflict);
    const selectedOptionKey =
      conflict.resolution?.mode === 'custom'
        ? undefined
        : options.find(({ key }) => key === this.reviewValueKey(resolvedValue))?.key;
    return {
      key: definition.key,
      label: definition.label,
      conflict,
      options,
      selectedOptionKey,
    };
  }

  private reviewOptions(field: string, conflict: FieldConflict): ReviewValueOption[] {
    const valuesBySource = new Map(conflict.values.map((value) => [value.sourceName, value.value]));
    const orderedSources = this.reviewSourceNames(
      conflict.values.map(({ sourceName }) => sourceName),
    );
    const options = new Map<string, ReviewValueOption>();
    for (const sourceName of orderedSources) {
      const value = valuesBySource.get(sourceName);
      if (!hasValue(value)) continue;
      const key = this.reviewValueKey(value);
      if (!options.has(key)) {
        options.set(key, {
          key,
          sourceName,
          displayValue: this.formatReviewValue(field, value),
        });
      }
    }
    return [...options.values()];
  }

  private reviewSourceNames(sourceNameValues: readonly SourceName[]): SourceName[] {
    const available = new Set(sourceNameValues);
    return [
      ...this.priority().filter((sourceName) => available.delete(sourceName)),
      ...sourceNameValues.filter((sourceName) => available.delete(sourceName)),
    ];
  }

  private reviewValueKey(value: ReviewValue): string {
    return String(value);
  }

  private formatReviewValue(field: string, value: ReviewValue): string {
    if (!hasValue(value)) return 'Empty';
    if (playerDateFields.has(field as PlayerReviewField) && typeof value === 'string') {
      return formatReferenceDate(value);
    }
    if (field === 'position' && typeof value === 'string' && value in positionBadgeDetails) {
      return positionBadgeDetails[value as PlayerPosition].label;
    }
    if (field === 'foot' && typeof value === 'string' && value in footLabels) {
      return footLabels[value as keyof typeof footLabels];
    }
    if (field === 'height' && typeof value === 'number') return `${formatUiNumber(value)} cm`;
    if (field === 'weight' && typeof value === 'number') return `${formatUiNumber(value)} kg`;
    if (field === 'marketValue' && typeof value === 'number') {
      return formatEuroCurrency(value);
    }
    if (field === 'minutesPlayed' && typeof value === 'number') {
      return formatUiNumber(value);
    }
    if ((field === 'countryCode2' || field === 'countryCode3') && typeof value === 'string') {
      return value.toLocaleUpperCase('en');
    }
    return String(value);
  }

  private movePlayerToGroup(
    sourceGroupId: string,
    playerId: string,
    destinationGroupId: string,
  ): void {
    if (sourceGroupId === destinationGroupId) return;
    const groups = this.matchGroups();
    const sourceGroup = groups.find(({ id }) => id === sourceGroupId);
    const destinationGroup = groups.find(({ id }) => id === destinationGroupId);
    const player = sourceGroup?.players.find(({ id }) => id === playerId);
    if (!sourceGroup || !destinationGroup || !player) return;

    const displacedPlayer = destinationGroup.players.find(
      ({ sourceName }) => sourceName === player.sourceName,
    );
    const sourcePlayers = this.orderPlayers([
      ...sourceGroup.players.filter(({ id }) => id !== player.id),
      ...(displacedPlayer ? [displacedPlayer] : []),
    ]);
    const destinationPlayers = this.orderPlayers([
      ...destinationGroup.players.filter(({ id }) => id !== displacedPlayer?.id),
      player,
    ]);
    this.matchGroups.set(
      groups.flatMap((group) => {
        if (group.id === sourceGroupId) {
          return sourcePlayers.length
            ? [
                {
                  ...group,
                  players: sourcePlayers,
                  automatic: false,
                  ambiguous: false,
                },
              ]
            : [];
        }
        if (group.id === destinationGroupId) {
          return [
            {
              ...group,
              players: destinationPlayers,
              automatic: false,
              ambiguous: false,
            },
          ];
        }
        return [group];
      }),
    );
    if (!sourcePlayers.length) {
      this.selectedPlayerGroupIds.update((selected) => {
        const next = new Set(selected);
        next.delete(sourceGroupId);
        return next;
      });
    }
    this.clearPlayerResolutions(sourceGroupId, destinationGroupId);
    this.error.set('');

    const destinationRow = this.matchGroups().findIndex(({ id }) => id === destinationGroupId) + 1;
    const message = displacedPlayer
      ? `${player.name} swapped rows with ${displacedPlayer.name}.`
      : `${player.name} moved to row ${destinationRow}.`;
    void this.liveAnnouncer.announce(message);
    this.focusPlayer(player.id);
  }

  private orderPlayers(players: PlayerSourceRecord[]): PlayerSourceRecord[] {
    const order = new Map(this.priority().map((sourceName, index) => [sourceName, index]));
    return [...players].sort(
      (left, right) =>
        (order.get(left.sourceName) ?? sourceNames.length) -
        (order.get(right.sourceName) ?? sourceNames.length),
    );
  }

  private clearPlayerResolutions(...groupIds: string[]): void {
    const cleared = new Set(groupIds);
    this.playerResolutions.update((current) =>
      Object.fromEntries(Object.entries(current).filter(([groupId]) => !cleared.has(groupId))),
    );
  }

  private focusPlayer(playerId: string): void {
    afterNextRender(
      () => {
        const tile = [
          ...this.elementRef.nativeElement.querySelectorAll<HTMLElement>('[data-player-id]'),
        ].find((candidate) => candidate.dataset['playerId'] === playerId);
        tile?.querySelector<HTMLButtonElement>('[data-ui-player-drag-handle]')?.focus();
      },
      { injector: this.injector },
    );
  }

  private updateResolution(conflict: FieldConflict, resolution: FieldResolution | undefined): void {
    if (conflict.entity === 'team') {
      this.teamResolutions.update((current) =>
        this.withResolution(current, conflict.field, resolution),
      );
      return;
    }
    this.playerResolutions.update((current) => ({
      ...current,
      [conflict.entityId]: this.withResolution(
        current[conflict.entityId] ?? {},
        conflict.field,
        resolution,
      ),
    }));
  }

  private withResolution(
    current: FieldResolutions,
    field: string,
    resolution: FieldResolution | undefined,
  ): FieldResolutions {
    return { ...current, [field]: resolution };
  }

  private buildLeagueSelection(): CombinedLeagueSelection | undefined {
    if (this.leagueMode() === 'none') return { kind: 'none' };
    if (this.leagueMode() === 'existing') {
      if (!this.combinedLeagueId()) {
        this.error.set('Choose a project league.');
        return undefined;
      }
      return { kind: 'existing', combinedLeagueId: this.combinedLeagueId() };
    }
    if (!this.sourceLeagueIds().length) {
      this.error.set('Choose at least one source league.');
      return undefined;
    }
    return { kind: 'create', sourceLeagueIds: this.sourceLeagueIds(), resolutions: {} };
  }

  private async initialize(): Promise<void> {
    const [priorityResult, candidateResults, leagueResults] = await Promise.all([
      this.api.getSourcePriority(),
      Promise.all(
        sourceNames.map((sourceName) =>
          this.api.listCombineTeamCandidates(
            this.projectId,
            '',
            sourceName,
            this.combinedTeamId() || undefined,
          ),
        ),
      ),
      Promise.all(
        sourceNames.map((sourceName) =>
          this.api.listEntities({
            projectId: this.projectId,
            entity: 'leagues',
            pageIndex: 0,
            pageSize: 100,
            search: '',
            sort: 'name',
            direction: 'asc',
            sourceNames: [sourceName],
          }),
        ),
      ),
    ]);
    if (priorityResult.ok) this.priority.set(priorityResult.value);
    const nextCandidates = { ...this.candidates() };
    const nextLeagues = { ...this.leagueCandidates() };
    candidateResults.forEach((result, index) => {
      if (result.ok) nextCandidates[sourceNames[index]] = result.value;
      else this.error.set(result.error.message);
    });
    leagueResults.forEach((result, index) => {
      if (result.ok) nextLeagues[sourceNames[index]] = result.value.rows as League[];
      else this.error.set(result.error.message);
    });
    this.candidates.set(nextCandidates);
    this.leagueCandidates.set(nextLeagues);
    const combinedTeamId = this.combinedTeamId();
    const filteredLoads: Promise<void>[] = [];
    if (combinedTeamId) {
      for (const sourceName of sourceNames) {
        const candidate = nextCandidates[sourceName].find(
          ({ combinedTeamId: owner }) => owner === combinedTeamId,
        );
        if (!candidate) continue;
        this.selectedTeamIds.update((selected) => ({
          ...selected,
          [sourceName]: candidate.id,
        }));
        this.teamSearches.update((searches) => ({
          ...searches,
          [sourceName]: candidate.name,
        }));
        this.selectCandidateLeague(sourceName, candidate);
        filteredLoads.push(this.loadCandidates(sourceName, candidate.name, candidate.leagueId));
      }
    }
    await Promise.all(filteredLoads);
    this.loading.set(false);
  }

  private async loadLeagues(sourceName: SourceName, search: string): Promise<void> {
    const sequence = ++this.leagueSequences[sourceName];
    const result = await this.api.listEntities({
      projectId: this.projectId,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 100,
      search,
      sort: 'name',
      direction: 'asc',
      sourceNames: [sourceName],
    });
    if (sequence !== this.leagueSequences[sourceName]) return;
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    const selectedId = this.selectedLeagueIds()[sourceName];
    const selected = this.leagueCandidates()[sourceName].find(({ id }) => id === selectedId);
    const leagues = result.value.rows as League[];
    const candidates =
      selected && !leagues.some(({ id }) => id === selected.id) ? [selected, ...leagues] : leagues;
    this.leagueCandidates.update((current) => ({ ...current, [sourceName]: candidates }));
  }

  private async ensureLeagueLoaded(sourceName: SourceName, leagueId: string): Promise<void> {
    if (this.leagueCandidates()[sourceName].some(({ id }) => id === leagueId)) return;
    const result = await this.api.getEntity(this.projectId, 'leagues', leagueId);
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    const league = result.value as League;
    this.leagueCandidates.update((current) => ({
      ...current,
      [sourceName]: [league, ...current[sourceName]],
    }));
    if (this.selectedLeagueIds()[sourceName] === league.id) {
      this.leagueSearches.update((searches) => ({ ...searches, [sourceName]: league.name }));
    }
  }

  private selectCandidateLeague(sourceName: SourceName, candidate: CombineTeamCandidate): void {
    this.selectedLeagueIds.update((selected) => ({
      ...selected,
      [sourceName]: candidate.leagueId,
    }));
    this.leagueSearches.update((searches) => ({
      ...searches,
      [sourceName]: candidate.leagueName ?? '',
    }));
    if (candidate.leagueId) void this.ensureLeagueLoaded(sourceName, candidate.leagueId);
  }

  private async matchTeamsFromAnchor(
    anchorSourceName: SourceName,
    anchor: CombineTeamCandidate,
  ): Promise<void> {
    const targetSources = this.priority().filter(
      (sourceName) => sourceName !== anchorSourceName && !this.selectedTeamIds()[sourceName],
    );
    if (!targetSources.length) return;

    const sequence = ++this.automaticMatchSequence;
    const selectedLeagueIds = this.selectedLeagueIds();
    this.autoMatching.set(true);

    const matches = await Promise.all(
      targetSources.map(async (sourceName) => {
        const searchTerms = this.automaticMatchSearchTerms(anchor.name);
        const results = await Promise.all(
          searchTerms.map((search) =>
            this.api.listCombineTeamCandidates(
              this.projectId,
              search,
              sourceName,
              this.combinedTeamId() || undefined,
              selectedLeagueIds[sourceName],
            ),
          ),
        );
        const failed = results.find((result) => !result.ok);
        if (failed) {
          return { sourceName, error: failed.error.message };
        }

        const candidateMap = new Map<string, CombineTeamCandidate>();
        for (const candidate of this.candidates()[sourceName]) {
          candidateMap.set(candidate.id, candidate);
        }
        for (const result of results) {
          if (!result.ok) continue;
          for (const candidate of result.value) candidateMap.set(candidate.id, candidate);
        }
        const candidates = [...candidateMap.values()];
        const exactMatches = candidates.filter(
          (candidate) =>
            this.normalizeTeamName(candidate.name) === this.normalizeTeamName(anchor.name) &&
            this.countriesAreCompatible(anchor, candidate) &&
            !this.candidateDisabled(candidate),
        );
        return {
          sourceName,
          candidates,
          match: exactMatches.length === 1 ? exactMatches[0] : undefined,
        };
      }),
    );

    if (sequence !== this.automaticMatchSequence) return;

    const failedMatch = matches.find(
      (match): match is { sourceName: SourceName; error: string } => 'error' in match,
    );
    if (failedMatch) {
      this.error.set(
        `Could not search ${this.sourceLabels[failedMatch.sourceName]} teams: ${failedMatch.error}`,
      );
    }

    for (const result of matches) {
      if ('error' in result) continue;
      this.candidates.update((current) => ({
        ...current,
        [result.sourceName]: result.candidates,
      }));
      if (!result.match || this.selectedTeamIds()[result.sourceName]) continue;

      const existingLeagueId = this.selectedLeagueIds()[result.sourceName];
      this.selectedTeamIds.update((selected) => ({
        ...selected,
        [result.sourceName]: result.match?.id,
      }));
      this.teamSearches.update((searches) => ({
        ...searches,
        [result.sourceName]: result.match?.name ?? '',
      }));
      this.selectCandidateLeague(result.sourceName, result.match);
      this.automaticTeamSelections.update((selections) => ({
        ...selections,
        [result.sourceName]: {
          anchorSourceName,
          teamId: result.match?.id ?? '',
          ...(!existingLeagueId && result.match?.leagueId
            ? { automaticLeagueId: result.match.leagueId }
            : {}),
        },
      }));
    }
    this.autoMatching.set(false);
  }

  private automaticMatchSearchTerms(name: string): string[] {
    const original = name.trim();
    const longestNormalizedToken =
      this.normalizeTeamName(name)
        .split(' ')
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)[0] ?? '';
    return [...new Set([original, longestNormalizedToken].filter(Boolean))];
  }

  private normalizeTeamName(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/\p{Mark}+/gu, '')
      .toLocaleLowerCase('en')
      .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private countriesAreCompatible(
    anchor: CombineTeamCandidate,
    candidate: CombineTeamCandidate,
  ): boolean {
    const anchorCode3 = anchor.countryCode3?.toLocaleUpperCase('en');
    const candidateCode3 = candidate.countryCode3?.toLocaleUpperCase('en');
    if (anchorCode3 && candidateCode3) return anchorCode3 === candidateCode3;

    const anchorCode2 = anchor.countryCode2?.toLocaleUpperCase('en');
    const candidateCode2 = candidate.countryCode2?.toLocaleUpperCase('en');
    if (anchorCode2 && candidateCode2) return anchorCode2 === candidateCode2;

    const anchorHasCode = Boolean(anchorCode3 ?? anchorCode2);
    const candidateHasCode = Boolean(candidateCode3 ?? candidateCode2);
    return !anchorHasCode || !candidateHasCode;
  }

  private cancelAutomaticMatching(): void {
    this.automaticMatchSequence += 1;
    this.autoMatching.set(false);
  }

  private markLeagueAsManual(sourceName: SourceName): void {
    const automaticSelection = this.automaticTeamSelections()[sourceName];
    if (!automaticSelection?.automaticLeagueId) return;
    this.automaticTeamSelections.update((selections) => ({
      ...selections,
      [sourceName]: {
        ...automaticSelection,
        automaticLeagueId: undefined,
      },
    }));
  }

  private removeAutomaticTeamSelection(sourceName: SourceName): void {
    if (!this.automaticTeamSelections()[sourceName]) return;
    this.automaticTeamSelections.update((selections) => ({
      ...selections,
      [sourceName]: undefined,
    }));
  }

  private clearAutomaticTeamSelections(
    predicate: (selection: AutomaticTeamSelection, sourceName: SourceName) => boolean = () => true,
  ): void {
    const selections = this.automaticTeamSelections();
    const nextSelections = { ...selections };
    const nextTeamIds = { ...this.selectedTeamIds() };
    const nextTeamSearches = { ...this.teamSearches() };
    const nextLeagueIds = { ...this.selectedLeagueIds() };
    const nextLeagueSearches = { ...this.leagueSearches() };

    for (const sourceName of sourceNames) {
      const selection = selections[sourceName];
      if (!selection || !predicate(selection, sourceName)) continue;
      if (nextTeamIds[sourceName] === selection.teamId) {
        nextTeamIds[sourceName] = undefined;
        nextTeamSearches[sourceName] = '';
      }
      if (
        selection.automaticLeagueId &&
        nextLeagueIds[sourceName] === selection.automaticLeagueId
      ) {
        nextLeagueIds[sourceName] = undefined;
        nextLeagueSearches[sourceName] = '';
      }
      nextSelections[sourceName] = undefined;
    }

    this.automaticTeamSelections.set(nextSelections);
    this.selectedTeamIds.set(nextTeamIds);
    this.teamSearches.set(nextTeamSearches);
    this.selectedLeagueIds.set(nextLeagueIds);
    this.leagueSearches.set(nextLeagueSearches);
  }

  private clearSelectedTeam(sourceName: SourceName): void {
    this.selectedTeamIds.update((selected) => ({ ...selected, [sourceName]: undefined }));
    this.teamSearches.update((searches) => ({ ...searches, [sourceName]: '' }));
  }

  private async loadCandidates(
    sourceName: SourceName,
    search: string,
    leagueId?: string,
  ): Promise<void> {
    const sequence = ++this.candidateSequences[sourceName];
    const result = await this.api.listCombineTeamCandidates(
      this.projectId,
      search,
      sourceName,
      this.combinedTeamId() || undefined,
      leagueId,
    );
    if (sequence !== this.candidateSequences[sourceName]) return;
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    const selectedId = this.selectedTeamIds()[sourceName];
    const selected = this.candidates()[sourceName].find(({ id }) => id === selectedId);
    const candidates =
      selected && !result.value.some(({ id }) => id === selected.id)
        ? [selected, ...result.value]
        : result.value;
    this.candidates.update((current) => ({ ...current, [sourceName]: candidates }));
  }

  private applyPreview(preview: TeamCombinationPreview): void {
    this.preview.set(preview);
    this.matchGroups.set(preview.matchGroups);
    this.selectedPlayerGroupIds.set(new Set(preview.matchGroups.map(({ id }) => id)));
    this.teamResolutions.set(preview.existingResolutions);
    this.playerResolutions.set(preview.existingPlayerResolutions);
    if (
      preview.detectedCombinedLeagueId &&
      preview.combinedLeagues.some(({ id }) => id === preview.detectedCombinedLeagueId)
    ) {
      this.leagueMode.set('existing');
      this.combinedLeagueId.set(preview.detectedCombinedLeagueId);
      this.sourceLeagueIds.set([]);
    } else if (preview.sourceLeagues.length) {
      this.leagueMode.set('create');
      this.combinedLeagueId.set('');
      this.sourceLeagueIds.set(preview.sourceLeagues.map(({ id }) => id));
    } else {
      this.leagueMode.set('none');
      this.combinedLeagueId.set('');
      this.sourceLeagueIds.set([]);
    }
  }

  private invalidatePreview(): void {
    this.preview.set(undefined);
    this.matchGroups.set([]);
    this.selectedPlayerGroupIds.set(new Set());
    this.teamResolutions.set({});
    this.playerResolutions.set({});
  }

  private advance(): void {
    this.stepper()?.next();
  }
}
