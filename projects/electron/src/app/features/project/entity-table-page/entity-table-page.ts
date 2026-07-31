import { SelectionModel } from '@angular/cdk/collections';
import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { NgxNullablePipe } from 'ngx-nullable';
import {
  isSourceName,
  leagueTiers,
  playerPositionDetails,
  sourceLabels,
  type Entity,
  type EditableEntityKind,
  type EntityKind,
  type EntityFilterOption,
  type EntityFilterOptions,
  type League,
  type NationalityFilterOption,
  type PageRequest,
  type Player,
  type PlayerFoot,
  type PlayerPosition,
  type PlayerPositionDetail,
  type Team,
  type DeleteLeagueMode,
} from '../../../../../shared/downloader/contracts';
import type { CustomBadge } from '../../../../../shared/downloader/custom-badge';
import { formatReferenceDate } from '../../../../../shared/downloader/reference-date';
import {
  formatEuroCurrency,
  formatUiNumber,
  formatUiTimestamp,
} from '../../../../../shared/downloader/ui-format';
import { findFootballCountryByCode3 } from '../../../../../shared/downloader/football-countries';
import { DesktopApi } from '../../../core/downloader-api';
import { EntityStatusSettingsService } from '../../../core/entity-status-settings.service';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import { EntityStatusBadge } from '../../../shared/entity-status-badge/entity-status-badge';
import {
  deriveEntityStatuses,
  isEntityStatus,
  normalizeEntityStatus,
  type EntityStatus,
  type EntityStatusSettings,
} from '../../../../../shared/downloader/entity-status';
import { PageHeader } from '../../../shared/page-header/page-header';
import { PositionBadge, positionBadgeDetails } from '../../../shared/position-badge/position-badge';
import { PositionDetailBadge } from '../../../shared/position-detail-badge/position-detail-badge';
import {
  ChangeLeagueCountryDialog,
  type ChangeLeagueCountryDialogData,
} from '../change-league-country-dialog/change-league-country-dialog';
import {
  ChangeLeagueTierDialog,
  type ChangeLeagueTierDialogData,
} from '../change-league-tier-dialog/change-league-tier-dialog';
import {
  EntityColumnDrawer,
  type EntityColumnDrawerData,
} from '../entity-column-drawer/entity-column-drawer';
import {
  EntityFilterDrawer,
  type EntityFilterDrawerData,
} from '../entity-filter-drawer/entity-filter-drawer';
import { emptyEntityFilters, type EntityFilters } from '../entity-filter-form/entity-filter-form';
import {
  DeleteLeagueDialog,
  type DeleteLeagueDialogData,
} from '../delete-league-dialog/delete-league-dialog';
import {
  DeletePlayerDialog,
  type DeletePlayerDialogData,
} from '../delete-player-dialog/delete-player-dialog';
import {
  DeleteTeamDialog,
  type DeleteTeamDialogData,
} from '../delete-team-dialog/delete-team-dialog';
import {
  EditEntityDialog,
  type EditEntityDialogData,
  type EditEntityValue,
} from '../edit-entity-dialog/edit-entity-dialog';
import {
  ManageCustomBadgesDialog,
  type ManageCustomBadgesDialogData,
  type ManageCustomBadgesDialogValue,
} from '../manage-custom-badges-dialog/manage-custom-badges-dialog';
import { EntityColumnPreferences } from './entity-column-preferences';
import { EntityFilterPreferences } from './entity-filter-preferences';
import {
  columnsByEntity,
  defaultColumnPreference,
  entityColumnLabels,
  visibleColumnsFromPreference,
  type EntityColumnDefinition,
  type EntityColumnKey,
  type EntityColumnPreference,
} from './entity-table-columns';

interface DisplayRow {
  id: string;
  entity: Entity;
  statuses: readonly EntityStatus[];
  customBadges: readonly CustomBadge[];
  countryCode?: string;
  position?: PlayerPosition;
  positionDetail?: PlayerPositionDetail;
  sourceLabel?: string;
  sourceUrl?: string;
  cells: Record<string, string | number | undefined>;
}

type SelectableEntityKind = EntityKind;

const footLabels: Record<PlayerFoot, string> = {
  LEFT: 'Left',
  RIGHT: 'Right',
};

const entityHeadings: Record<EntityKind, string> = {
  leagues: 'Leagues',
  teams: 'Teams',
  players: 'Players',
};

const entityIcons: Record<EntityKind, string> = {
  leagues: 'emoji_events',
  teams: 'shield',
  players: 'groups',
};

const playerDateColumns = new Set(['birthdate', 'joined', 'contractExpires']);
const timestampColumns = new Set(['createdAt', 'updatedAt']);
const quantityColumns = new Set(['playerCount', 'teamCount']);
const filterQueryParameters: Record<EntityKind, readonly string[]> = {
  leagues: ['sourceName', 'badge', 'country', 'season', 'tier', 'noTier'],
  teams: ['sourceName', 'badge', 'leagueId', 'noLeague', 'country', 'season'],
  players: ['sourceName', 'badge', 'teamId', 'nationality', 'position', 'positionDetail', 'foot'],
};
function uniqueIds(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function isPlayerPosition(value: unknown): value is PlayerPosition {
  return typeof value === 'string' && value in positionBadgeDetails;
}

function isLeagueTier(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (leagueTiers as readonly number[]).includes(value)
  );
}

function isPlayerPositionDetail(value: unknown): value is PlayerPositionDetail {
  return typeof value === 'string' && playerPositionDetails.includes(value as PlayerPositionDetail);
}

function normalizeFilterOptions(options: EntityFilterOptions): EntityFilterOptions {
  if (options.entity !== 'players') return options;
  const nationalities = options.nationalities as readonly (NationalityFilterOption | string)[];
  return {
    ...options,
    nationalities: nationalities.map((nationality) =>
      typeof nationality === 'string' ? { name: nationality } : nationality,
    ),
  };
}

function isPlayerFoot(value: unknown): value is PlayerFoot {
  return typeof value === 'string' && value in footLabels;
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

@Component({
  selector: 'app-entity-table-page',
  imports: [
    CountryFlag,
    CustomBadgeView,
    DecimalPipe,
    EntityStatusBadge,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSortModule,
    MatTableModule,
    NgxNullablePipe,
    PageHeader,
    PositionBadge,
    PositionDetailBadge,
    RouterLink,
  ],
  templateUrl: './entity-table-page.html',
  styleUrl: './entity-table-page.css',
})
export class EntityTablePage {
  private readonly api = inject(DesktopApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(EntityColumnPreferences);
  private readonly filterPreferences = inject(EntityFilterPreferences);
  private readonly entityStatusSettings = inject(EntityStatusSettingsService);
  protected readonly entity = signal<EntityKind>('leagues');
  protected readonly entityHeading = computed(() => entityHeadings[this.entity()]);
  protected readonly entityIcon = computed(() => entityIcons[this.entity()]);
  protected readonly rows = signal<DisplayRow[]>([]);
  protected readonly columnDefinitions = signal<readonly EntityColumnDefinition[]>(
    columnsByEntity.leagues,
  );
  private readonly columnPreference = signal<EntityColumnPreference>(
    defaultColumnPreference('leagues'),
  );
  protected readonly columns = computed(() =>
    visibleColumnsFromPreference(this.columnPreference()),
  );
  protected readonly displayedColumns = computed<readonly string[]>(() => [
    'select',
    ...this.columns(),
  ]);
  protected readonly hiddenColumnCount = computed(
    () => this.columnDefinitions().length - this.columns().length,
  );
  protected readonly total = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly search = signal('');
  protected readonly sort = signal('name');
  protected readonly direction = signal<'asc' | 'desc'>('asc');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly bulkActionPending = signal(false);
  protected readonly filterOptions = signal<EntityFilterOptions | undefined>(undefined);
  protected readonly filterLoading = signal(false);
  protected readonly filterError = signal('');
  protected readonly filters = signal<EntityFilters>(emptyEntityFilters());
  protected readonly activeFilterCount = computed(() => {
    const filters = this.filters();
    return (
      Number(filters.sourceNames.length > 0) +
      Number(filters.statuses.length > 0 || filters.customBadgeIds.length > 0) +
      Number(filters.parentIds.length > 0 || filters.includeTeamsWithoutLeague) +
      Number(filters.tiers.length > 0 || filters.includeLeaguesWithoutTier) +
      Number(filters.seasons.length > 0) +
      Number(filters.countries.length > 0) +
      Number(filters.nationalities.length > 0) +
      Number(filters.positions.length > 0) +
      Number(filters.positionDetails.length > 0) +
      Number(filters.feet.length > 0)
    );
  });
  protected readonly labels = entityColumnLabels;
  protected readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  private readonly referenceDate = signal<string | undefined>(undefined);
  private readonly referenceDateLoaded = this.loadReferenceDate();
  protected readonly entitySelection = new SelectionModel<DisplayRow>(true);
  private readonly selectionVersion = signal(0);
  protected readonly selectedRows = computed(() => {
    this.selectionVersion();
    return this.entitySelection.selected;
  });
  protected readonly selectedCount = computed(() => this.selectedRows().length);
  protected readonly selectedEntitySingular = computed(() => {
    const entity = this.entity();
    return entity === 'leagues' ? 'league' : entity === 'teams' ? 'team' : 'player';
  });
  protected readonly selectedEntityPlural = computed(() => this.entity());
  protected readonly allRowsSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && this.selectedCount() === rows.length;
  });
  protected readonly someRowsSelected = computed(
    () => this.selectedCount() > 0 && !this.allRowsSelected(),
  );
  private loadRequestId = 0;
  private hasInvalidFilterQuery = false;
  private filterPreferencesInitialized = false;

  constructor() {
    this.entitySelection.changed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.selectionVersion.update((version) => version + 1));
    const entity = this.route.snapshot.data['entity'] as EntityKind;
    this.entity.set(entity);
    this.columnDefinitions.set(columnsByEntity[entity]);
    this.columnPreference.set(this.columnPreferences.load(entity));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const entity = this.entity();
      let restoredFilters: EntityFilters | undefined;
      if (!this.filterPreferencesInitialized) {
        this.filterPreferencesInitialized = true;
        const hasExplicitFilters = filterQueryParameters[entity].some((parameter) =>
          params.has(parameter),
        );
        if (!hasExplicitFilters) {
          restoredFilters = this.filterPreferences.load(this.projectId, entity);
          if (restoredFilters) void this.updateFilterUrl(restoredFilters, false);
        }
      }
      const parentParameter = entity === 'teams' ? 'leagueId' : 'teamId';
      const positionValues = entity === 'players' ? uniqueIds(params.getAll('position')) : [];
      const positionDetailValues =
        entity === 'players' ? uniqueIds(params.getAll('positionDetail')) : [];
      const footValues = entity === 'players' ? uniqueIds(params.getAll('foot')) : [];
      const tierValues = entity === 'leagues' ? uniqueIds(params.getAll('tier')) : [];
      const sourceValues = uniqueIds(params.getAll('sourceName'));
      const statusValues = uniqueIds(params.getAll('badge'));
      const sourceNames = sourceValues.filter(isSourceName);
      const statuses = [
        ...new Set(
          statusValues
            .map(normalizeEntityStatus)
            .filter((status): status is EntityStatus => status !== undefined),
        ),
      ];
      const customBadgeIds = statusValues.filter(
        (status) => normalizeEntityStatus(status) === undefined,
      );
      const positions = positionValues.filter(isPlayerPosition);
      const positionDetails = positionDetailValues.filter(isPlayerPositionDetail);
      const feet = footValues.filter(isPlayerFoot);
      const tiers = tierValues.map(Number).filter(isLeagueTier);
      this.hasInvalidFilterQuery =
        sourceNames.length !== sourceValues.length ||
        statusValues.some((status) => {
          const normalized = normalizeEntityStatus(status);
          return normalized !== undefined && normalized !== status;
        }) ||
        positions.length !== positionValues.length ||
        positionDetails.length !== positionDetailValues.length ||
        feet.length !== footValues.length ||
        tiers.length !== tierValues.length;
      const filters: EntityFilters =
        restoredFilters ??
        ({
          sourceNames,
          statuses,
          customBadgeIds,
          parentIds: entity === 'leagues' ? [] : uniqueIds(params.getAll(parentParameter)),
          includeTeamsWithoutLeague: entity === 'teams' && params.get('noLeague') === 'true',
          tiers,
          includeLeaguesWithoutTier: entity === 'leagues' && params.get('noTier') === 'true',
          seasons: entity === 'players' ? [] : uniqueIds(params.getAll('season')),
          countries: entity !== 'players' ? uniqueIds(params.getAll('country')) : [],
          nationalities: entity === 'players' ? uniqueIds(params.getAll('nationality')) : [],
          positions,
          positionDetails,
          feet,
        } satisfies EntityFilters);
      this.filters.set(filters);
      this.pageIndex.set(0);
      const options = this.filterOptions();
      if (options) {
        const normalized = this.normalizeFilters(filters, options);
        if (this.hasInvalidFilterQuery || !this.filtersEqual(normalized, filters)) {
          void this.updateFilterUrl(normalized);
          return;
        }
        this.filterPreferences.save(this.projectId, entity, normalized);
      }
      void this.load();
    });
    void this.loadFilterOptions();
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
    void this.load();
  }

  protected pageChanged(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    void this.load();
  }

  protected sortChanged(event: Sort): void {
    if (event.active === 'badge' || event.active === 'actions') return;
    this.sort.set(event.active || 'name');
    this.direction.set(event.direction === 'desc' ? 'desc' : 'asc');
    this.pageIndex.set(0);
    void this.load();
  }

  protected toggleRow(row: DisplayRow, checked: boolean): void {
    if (checked) this.entitySelection.select(row);
    else this.entitySelection.deselect(row);
  }

  protected toggleAllRows(checked: boolean): void {
    this.entitySelection.clear();
    if (checked) this.entitySelection.select(...this.rows());
  }

  protected openFilters(): void {
    this.dialog
      .open<EntityFilterDrawer, EntityFilterDrawerData, EntityFilters>(EntityFilterDrawer, {
        ariaLabelledBy: 'entity-filter-title',
        ariaModal: true,
        autoFocus: 'first-tabbable',
        data: {
          entity: this.entity(),
          filters: this.filters(),
          options: this.filterOptions,
          loading: this.filterLoading,
          error: this.filterError,
          retry: () => this.retryFilterOptions(),
        },
        delayFocusTrap: false,
        disableClose: false,
        height: '100vh',
        maxHeight: '100vh',
        maxWidth: '100vw',
        panelClass: 'entity-filter-drawer-panel',
        position: { right: '0', top: '0' },
        restoreFocus: true,
        width: '28rem',
      })
      .afterClosed()
      .subscribe((filters) => {
        if (filters) this.applyFilters(filters);
      });
  }

  protected openColumns(): void {
    const entity = this.entity();
    this.dialog
      .open<EntityColumnDrawer, EntityColumnDrawerData, EntityColumnPreference>(
        EntityColumnDrawer,
        {
          ariaLabelledBy: 'entity-column-title',
          ariaModal: true,
          autoFocus: 'first-tabbable',
          data: {
            entity,
            columns: this.columnDefinitions(),
            preference: this.columnPreference(),
            defaultPreference: defaultColumnPreference(entity),
          },
          delayFocusTrap: false,
          disableClose: false,
          height: '100vh',
          maxHeight: '100vh',
          maxWidth: '100vw',
          panelClass: 'entity-side-drawer-panel',
          position: { right: '0', top: '0' },
          restoreFocus: true,
          width: '28rem',
        },
      )
      .afterClosed()
      .subscribe((columns) => {
        if (columns) this.applyColumns(columns);
      });
  }

  protected applyFilters(filters: EntityFilters): void {
    void this.updateFilterUrl(filters);
  }

  protected retryFilterOptions(): void {
    void this.loadFilterOptions();
  }

  private applyColumns(preference: EntityColumnPreference): void {
    const columns = visibleColumnsFromPreference(preference);
    this.columnPreferences.save(this.entity(), preference);
    this.columnPreference.set(preference);
    if (columns.includes(this.sort() as EntityColumnKey)) return;
    this.sort.set('name');
    this.direction.set('asc');
    this.pageIndex.set(0);
    void this.load();
  }

  protected async editEntity(entity: Entity): Promise<void> {
    const kind = this.entity();
    if (kind === 'players') return;
    const leagues = kind === 'teams' ? await this.loadAllLeagues() : [];
    const value = await new Promise<EditEntityValue | undefined>((resolve) => {
      this.dialog
        .open<EditEntityDialog, EditEntityDialogData, EditEntityValue>(EditEntityDialog, {
          data: { entity: entity as League | Team, kind, leagues },
          autoFocus: 'first-tabbable',
        })
        .afterClosed()
        .subscribe(resolve);
    });
    if (value) await this.saveEntityMetadata(kind, entity.id, value);
  }

  protected refreshEntity(entity: Entity): void {
    const kind = this.entity();
    if (kind === 'players') return;
    void this.router.navigate(['/projects', this.projectId, 'source', 'import'], {
      queryParams: {
        operation: 'synchronize',
        entity: kind,
        targetId: entity.id,
        returnTo: kind,
      },
    });
  }

  protected confirmTeamDeletion(entity: Entity): void {
    if (this.entity() !== 'teams') return;
    const team = entity as Team;
    this.dialog
      .open<DeleteTeamDialog, DeleteTeamDialogData, boolean>(DeleteTeamDialog, {
        data: { name: team.name, playerCount: team.playerCount ?? 0 },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.deleteTeam(team.id);
      });
  }

  protected confirmLeagueDeletion(entity: Entity): void {
    if (this.entity() !== 'leagues') return;
    const league = entity as League;
    this.dialog
      .open<DeleteLeagueDialog, DeleteLeagueDialogData, DeleteLeagueMode>(DeleteLeagueDialog, {
        data: {
          name: league.name,
          teamCount: league.teamCount ?? 0,
          playerCount: league.playerCount ?? 0,
        },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
        maxWidth: '36rem',
      })
      .afterClosed()
      .subscribe((mode) => {
        if (mode) void this.deleteLeague(league.id, mode);
      });
  }

  protected confirmPlayerDeletion(entity: Entity): void {
    if (this.entity() !== 'players') return;
    const player = entity as Player;
    this.dialog
      .open<DeletePlayerDialog, DeletePlayerDialogData, boolean>(DeletePlayerDialog, {
        data: { name: player.name },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.deletePlayer(player.id);
      });
  }

  protected confirmSelectedDeletion(): void {
    if (this.bulkActionPending()) return;
    const entity = this.entity();
    const selectedEntities = this.selectedRows().map(({ entity }) => entity);
    if (!selectedEntities.length) return;
    if (entity === 'leagues') {
      const leagues = selectedEntities as League[];
      this.dialog
        .open<DeleteLeagueDialog, DeleteLeagueDialogData, DeleteLeagueMode>(DeleteLeagueDialog, {
          data: {
            bulk: true,
            leagueCount: leagues.length,
            teamCount: leagues.reduce((total, league) => total + (league.teamCount ?? 0), 0),
            playerCount: leagues.reduce((total, league) => total + (league.playerCount ?? 0), 0),
          },
          role: 'alertdialog',
          autoFocus: 'first-tabbable',
          maxWidth: '36rem',
        })
        .afterClosed()
        .subscribe((mode) => {
          if (mode) void this.deleteSelectedEntities(entity, leagues, mode);
        });
      return;
    }
    if (entity === 'players') {
      const players = selectedEntities as Player[];
      this.dialog
        .open<DeletePlayerDialog, DeletePlayerDialogData, boolean>(DeletePlayerDialog, {
          data: {
            bulk: true,
            playerCount: players.length,
          },
          role: 'alertdialog',
          autoFocus: 'first-tabbable',
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (confirmed) void this.deleteSelectedEntities(entity, players);
        });
      return;
    }
    const teams = selectedEntities as Team[];
    this.dialog
      .open<DeleteTeamDialog, DeleteTeamDialogData, boolean>(DeleteTeamDialog, {
        data: {
          bulk: true,
          teamCount: teams.length,
          playerCount: teams.reduce((total, team) => total + (team.playerCount ?? 0), 0),
        },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.deleteSelectedEntities(entity, teams);
      });
  }

  protected manageRowCustomBadges(row: DisplayRow): void {
    this.openCustomBadgesDialog([row]);
  }

  protected manageSelectedCustomBadges(): void {
    this.openCustomBadgesDialog(this.selectedRows());
  }

  protected changeSelectedCountry(): void {
    if (this.bulkActionPending()) return;
    const entity = this.entity();
    if (entity === 'players') return;
    const selectedEntities = this.selectedRows().map(({ entity }) => entity as League | Team);
    if (!selectedEntities.length) return;
    const countries = new Set(selectedEntities.map(({ countryCode3 }) => countryCode3 ?? ''));
    const countryCode3 = countries.size === 1 ? [...countries][0] || undefined : undefined;
    this.dialog
      .open<ChangeLeagueCountryDialog, ChangeLeagueCountryDialogData, string | null>(
        ChangeLeagueCountryDialog,
        {
          data: {
            entity,
            entityCount: selectedEntities.length,
            countryCode3,
            mixedCountries: countries.size > 1,
          },
          autoFocus: 'first-tabbable',
          maxWidth: '32rem',
        },
      )
      .afterClosed()
      .subscribe((selectedCountryCode3) => {
        if (selectedCountryCode3 !== undefined) {
          void this.updateSelectedCountries(
            entity,
            selectedEntities,
            selectedCountryCode3 ?? undefined,
          );
        }
      });
  }

  protected changeSelectedTier(): void {
    if (this.bulkActionPending() || this.entity() !== 'leagues') return;
    const selectedLeagues = this.selectedRows().map(({ entity }) => entity as League);
    if (!selectedLeagues.length) return;
    const tiers = new Set(selectedLeagues.map(({ tier }) => tier ?? 0));
    const tier = tiers.size === 1 ? [...tiers][0] || undefined : undefined;
    this.dialog
      .open<ChangeLeagueTierDialog, ChangeLeagueTierDialogData, number>(ChangeLeagueTierDialog, {
        data: {
          leagueCount: selectedLeagues.length,
          tier,
          mixedTiers: tiers.size > 1,
        },
        autoFocus: 'first-tabbable',
        maxWidth: '32rem',
      })
      .afterClosed()
      .subscribe((selectedTier) => {
        if (selectedTier !== undefined) {
          void this.updateSelectedTiers(selectedLeagues, selectedTier || undefined);
        }
      });
  }

  private async load(): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.entitySelection.clear();
    const entity = this.entity();
    const filters = this.filters();
    const statusAsOf = new Date();
    const statusSettings = { ...this.entityStatusSettings.settings() };
    this.loading.set(true);
    const request: PageRequest = {
      projectId: this.projectId,
      entity,
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      search: this.search(),
      sort: this.sort(),
      direction: this.direction(),
      sourceNames: [...filters.sourceNames],
      leagueId: entity === 'teams' ? filters.parentIds[0] : undefined,
      leagueIds: entity === 'teams' ? [...filters.parentIds] : undefined,
      teamId: entity === 'players' ? filters.parentIds[0] : undefined,
      teamIds: entity === 'players' ? [...filters.parentIds] : undefined,
      includeTeamsWithoutLeague: entity === 'teams' ? filters.includeTeamsWithoutLeague : undefined,
      tiers: entity === 'leagues' ? [...filters.tiers] : undefined,
      includeLeaguesWithoutTier:
        entity === 'leagues' ? filters.includeLeaguesWithoutTier : undefined,
      seasons: entity === 'players' ? undefined : [...filters.seasons],
      countries: entity !== 'players' ? [...filters.countries] : undefined,
      nationalities: entity === 'players' ? [...filters.nationalities] : undefined,
      positions: entity === 'players' ? [...filters.positions] : undefined,
      positionDetails: entity === 'players' ? [...filters.positionDetails] : undefined,
      feet: entity === 'players' ? [...filters.feet] : undefined,
      statuses: [...filters.statuses],
      customBadgeIds: [...filters.customBadgeIds],
      statusAsOf: statusAsOf.toISOString(),
      statusSettings,
    };
    const [result] = await Promise.all([this.api.listEntities(request), this.referenceDateLoaded]);
    if (requestId !== this.loadRequestId) return;
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    this.error.set('');
    this.total.set(result.value.total);
    this.rows.set(
      result.value.rows.map((entity) => this.toDisplayRow(entity, statusAsOf, statusSettings)),
    );
  }

  private async deleteTeam(id: string): Promise<void> {
    const deletingLastRowOnPage = this.rows().length === 1 && this.pageIndex() > 0;
    const result = await this.api.deleteTeam(this.projectId, id);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    if (deletingLastRowOnPage) this.pageIndex.update((pageIndex) => pageIndex - 1);
    await this.loadFilterOptions();
    await this.load();
    this.snackBar.open('Team deleted.', 'Dismiss', { duration: 3000 });
  }

  private async deleteLeague(id: string, mode: DeleteLeagueMode): Promise<void> {
    const deletingLastRowOnPage = this.rows().length === 1 && this.pageIndex() > 0;
    const result = await this.api.deleteLeague(this.projectId, id, mode);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    if (deletingLastRowOnPage) this.pageIndex.update((pageIndex) => pageIndex - 1);
    await this.loadFilterOptions();
    await this.load();
    this.snackBar.open('League deleted.', 'Dismiss', { duration: 3000 });
  }

  private async deletePlayer(id: string): Promise<void> {
    const deletingLastRowOnPage = this.rows().length === 1 && this.pageIndex() > 0;
    const result = await this.api.deletePlayer(this.projectId, id);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    if (deletingLastRowOnPage) this.pageIndex.update((pageIndex) => pageIndex - 1);
    await this.loadFilterOptions();
    await this.load();
    this.snackBar.open('Player deleted.', 'Dismiss', { duration: 3000 });
  }

  private async deleteSelectedEntities(
    entity: SelectableEntityKind,
    selectedEntities: readonly Entity[],
    leagueMode?: DeleteLeagueMode,
  ): Promise<void> {
    if (this.bulkActionPending() || !selectedEntities.length) return;
    if (entity === 'leagues' && !leagueMode) return;
    this.bulkActionPending.set(true);
    const ids = selectedEntities.map(({ id }) => id);
    const result =
      entity === 'leagues'
        ? await this.api.deleteLeagues(this.projectId, ids, leagueMode ?? 'league-only')
        : entity === 'teams'
          ? await this.api.deleteTeams(this.projectId, ids)
          : await this.api.deletePlayers(this.projectId, ids);
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    const remainingTotal = Math.max(0, this.total() - selectedEntities.length);
    const lastPageIndex = Math.max(0, Math.ceil(remainingTotal / this.pageSize()) - 1);
    this.pageIndex.update((pageIndex) => Math.min(pageIndex, lastPageIndex));
    this.entitySelection.clear();
    await this.loadFilterOptions();
    await this.load();
    const singular = entity === 'leagues' ? 'league' : entity === 'teams' ? 'team' : 'player';
    this.snackBar.open(
      `${formatUiNumber(selectedEntities.length)} ${
        selectedEntities.length === 1 ? singular : entity
      } deleted.`,
      'Dismiss',
      { duration: 3000 },
    );
  }

  private async updateSelectedCountries(
    entity: SelectableEntityKind,
    selectedEntities: readonly (League | Team)[],
    countryCode3?: string,
  ): Promise<void> {
    if (this.bulkActionPending() || !selectedEntities.length) return;
    this.bulkActionPending.set(true);
    const ids = selectedEntities.map(({ id }) => id);
    const result =
      entity === 'leagues'
        ? await this.api.updateLeagueCountries(this.projectId, ids, countryCode3)
        : await this.api.updateTeamCountries(this.projectId, ids, countryCode3);
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.entitySelection.clear();
    await this.loadFilterOptions();
    await this.load();
    const singular = entity === 'leagues' ? 'league' : 'team';
    this.snackBar.open(
      `Country updated for ${formatUiNumber(selectedEntities.length)} ${
        selectedEntities.length === 1 ? singular : entity
      }.`,
      'Dismiss',
      { duration: 3000 },
    );
  }

  private async updateSelectedTiers(
    selectedLeagues: readonly League[],
    tier?: number,
  ): Promise<void> {
    if (this.bulkActionPending() || !selectedLeagues.length) return;
    this.bulkActionPending.set(true);
    const result = await this.api.updateLeagueTiers(
      this.projectId,
      selectedLeagues.map(({ id }) => id),
      tier,
    );
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.entitySelection.clear();
    await this.loadFilterOptions();
    await this.load();
    this.snackBar.open(
      `Tier updated for ${formatUiNumber(selectedLeagues.length)} ${
        selectedLeagues.length === 1 ? 'league' : 'leagues'
      }.`,
      'Dismiss',
      { duration: 3000 },
    );
  }

  private async saveEntityMetadata(
    kind: EditableEntityKind,
    id: string,
    value: EditEntityValue,
  ): Promise<void> {
    const common = {
      projectId: this.projectId,
      id,
      name: value.name,
      sourceId: value.sourceId,
      season: value.season || undefined,
    };
    const result =
      kind === 'leagues'
        ? await this.api.updateEntityMetadata({
            ...common,
            entity: 'leagues',
            countryCode3: value.countryCode3 || undefined,
            tier: value.tier || undefined,
          })
        : await this.api.updateEntityMetadata({
            ...common,
            entity: 'teams',
            countryCode3: value.countryCode3 || undefined,
            leagueId: value.leagueId || undefined,
          });
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    await this.api.getProjectSummary(this.projectId);
    await this.load();
    this.snackBar.open(`${kind === 'leagues' ? 'League' : 'Team'} updated.`, 'Dismiss', {
      duration: 3000,
    });
  }

  private async loadAllLeagues(): Promise<EntityFilterOption[]> {
    const result = await this.api.listEntityFilterOptions({
      projectId: this.projectId,
      entity: 'teams',
    });
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return [];
    }
    return result.value.entity === 'teams' ? result.value.leagues : [];
  }

  private async loadFilterOptions(): Promise<void> {
    this.filterLoading.set(true);
    this.filterError.set('');
    const result = await this.api.listEntityFilterOptions({
      projectId: this.projectId,
      entity: this.entity(),
    });
    this.filterLoading.set(false);
    if (!result.ok) {
      this.filterError.set(result.error.message);
      return;
    }
    const options = normalizeFilterOptions(result.value);
    this.filterError.set('');
    this.filterOptions.set(options);
    const normalized = this.normalizeFilters(this.filters(), options);
    if (this.hasInvalidFilterQuery || !this.filtersEqual(normalized, this.filters())) {
      await this.updateFilterUrl(normalized);
    } else {
      this.filterPreferences.save(this.projectId, this.entity(), normalized);
    }
  }

  private updateFilterUrl(filters: EntityFilters, persist = true): Promise<boolean> {
    this.pageIndex.set(0);
    const entity = this.entity();
    if (persist) this.filterPreferences.save(this.projectId, entity, filters);
    const queryParams = {
      sourceName: filters.sourceNames.length ? [...filters.sourceNames] : null,
      badge:
        filters.statuses.length || filters.customBadgeIds.length
          ? [...filters.statuses, ...filters.customBadgeIds]
          : null,
      leagueId: entity === 'teams' && filters.parentIds.length ? [...filters.parentIds] : null,
      noLeague: entity === 'teams' && filters.includeTeamsWithoutLeague ? ('true' as const) : null,
      tier: entity === 'leagues' && filters.tiers.length ? [...filters.tiers] : null,
      noTier: entity === 'leagues' && filters.includeLeaguesWithoutTier ? ('true' as const) : null,
      teamId: entity === 'players' && filters.parentIds.length ? [...filters.parentIds] : null,
      season: entity !== 'players' && filters.seasons.length ? [...filters.seasons] : null,
      country: entity !== 'players' && filters.countries.length ? [...filters.countries] : null,
      nationality:
        entity === 'players' && filters.nationalities.length ? [...filters.nationalities] : null,
      position: entity === 'players' && filters.positions.length ? [...filters.positions] : null,
      positionDetail:
        entity === 'players' && filters.positionDetails.length
          ? [...filters.positionDetails]
          : null,
      foot: entity === 'players' && filters.feet.length ? [...filters.feet] : null,
    };
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private normalizeFilters(filters: EntityFilters, options: EntityFilterOptions): EntityFilters {
    const normalized = emptyEntityFilters();
    const sourceNames = new Set(options.sourceNames ?? []);
    normalized.sourceNames = filters.sourceNames.filter((sourceName) =>
      sourceNames.has(sourceName),
    );
    normalized.statuses = filters.statuses.filter(isEntityStatus);
    const customBadgeIds = new Set((options.customBadges ?? []).map(({ id }) => id));
    normalized.customBadgeIds = filters.customBadgeIds.filter((id) => customBadgeIds.has(id));
    if (options.entity === 'leagues') {
      const seasons = new Set(options.seasons);
      const countries = new Set(options.countries.map((country) => country.name));
      const tiers = new Set(options.tiers ?? []);
      normalized.seasons = filters.seasons.filter((season) => seasons.has(season));
      normalized.countries = filters.countries.filter((country) => countries.has(country));
      normalized.tiers = filters.tiers.filter((tier) => tiers.has(tier));
      normalized.includeLeaguesWithoutTier =
        filters.includeLeaguesWithoutTier && Boolean(options.hasLeaguesWithoutTier);
      return normalized;
    }
    if (options.entity === 'teams') {
      const leagueIds = new Set(options.leagues.map((league) => league.id));
      const countries = new Set(options.countries.map((country) => country.name));
      const seasons = new Set(options.seasons);
      normalized.parentIds = filters.parentIds.filter((id) => leagueIds.has(id));
      normalized.includeTeamsWithoutLeague =
        filters.includeTeamsWithoutLeague && options.hasTeamsWithoutLeague;
      normalized.countries = filters.countries.filter((country) => countries.has(country));
      normalized.seasons = filters.seasons.filter((season) => seasons.has(season));
      return normalized;
    }
    const teamIds = new Set(options.teams.map((team) => team.id));
    const nationalities = new Set(options.nationalities.map((nationality) => nationality.name));
    const positions = new Set(options.positions);
    const positionDetails = new Set(options.positionDetails);
    const feet = new Set(options.feet);
    normalized.parentIds = filters.parentIds.filter((id) => teamIds.has(id));
    normalized.nationalities = filters.nationalities.filter((nationality) =>
      nationalities.has(nationality),
    );
    normalized.positions = filters.positions.filter((position) => positions.has(position));
    normalized.positionDetails = filters.positionDetails.filter((positionDetail) =>
      positionDetails.has(positionDetail),
    );
    normalized.feet = filters.feet.filter((foot) => feet.has(foot));
    return normalized;
  }

  private filtersEqual(left: EntityFilters, right: EntityFilters): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private async loadReferenceDate(): Promise<void> {
    const result = await this.api.getProjectSummary(this.projectId);
    if (result.ok) this.referenceDate.set(result.value.referenceDate);
  }

  private toDisplayRow(
    entity: Entity,
    now: Date,
    statusSettings: EntityStatusSettings,
  ): DisplayRow {
    const record = entity as unknown as Record<string, unknown>;
    const cells: Record<string, string | number | undefined> = {};
    for (const { key: column } of this.columnDefinitions()) {
      const value =
        column === 'leagueCountry' || column === 'teamCountry'
          ? record['countryName']
          : record[column];
      if (timestampColumns.has(column) && typeof value === 'string')
        cells[column] = formatUiTimestamp(value);
      else if (playerDateColumns.has(column) && typeof value === 'string')
        cells[column] = formatReferenceDate(value);
      else if (column === 'position' && isPlayerPosition(value))
        cells[column] = positionBadgeDetails[value].abbreviation;
      else if (column === 'sourceName' && isSourceName(value)) cells[column] = sourceLabels[value];
      else if (column === 'foot' && isPlayerFoot(value)) cells[column] = footLabels[value];
      else if (column === 'height' && typeof value === 'number')
        cells[column] = `${formatUiNumber(value)} cm`;
      else if (column === 'weight' && typeof value === 'number')
        cells[column] = `${formatUiNumber(value)} kg`;
      else if (column === 'marketValue' && typeof value === 'number') {
        cells[column] = formatEuroCurrency(value);
      } else if (quantityColumns.has(column) && typeof value === 'number') {
        cells[column] = formatUiNumber(value);
      } else if (typeof value === 'string' || typeof value === 'number') {
        cells[column] = value;
      } else if (typeof value === 'boolean') {
        cells[column] = String(value);
      } else {
        cells[column] = undefined;
      }
    }
    return {
      id: entity.id,
      entity,
      statuses: deriveEntityStatuses(entity, this.referenceDate(), now, statusSettings),
      customBadges: entity.customBadges ?? [],
      countryCode:
        typeof record['countryCode3'] === 'string'
          ? findFootballCountryByCode3(record['countryCode3'])?.flagCode
          : typeof record['countryCode2'] === 'string'
            ? record['countryCode2']
            : undefined,
      position: isPlayerPosition(record['position']) ? record['position'] : undefined,
      positionDetail: isPlayerPositionDetail(record['positionDetail'])
        ? record['positionDetail']
        : undefined,
      sourceLabel: isSourceName(record['sourceName'])
        ? sourceLabels[record['sourceName']]
        : undefined,
      sourceUrl: isHttpsUrl(record['sourceUrl']) ? record['sourceUrl'] : undefined,
      cells,
    };
  }

  private openCustomBadgesDialog(rows: readonly DisplayRow[]): void {
    if (this.bulkActionPending() || !rows.length) return;
    const badges = this.filterOptions()?.customBadges ?? [];
    this.dialog
      .open<ManageCustomBadgesDialog, ManageCustomBadgesDialogData, ManageCustomBadgesDialogValue>(
        ManageCustomBadgesDialog,
        {
          data: {
            entity: this.entity(),
            entities: rows.map(({ entity }) => entity),
            badges,
          },
          autoFocus: 'first-tabbable',
        },
      )
      .afterClosed()
      .subscribe((value) => {
        if (value) void this.updateCustomBadges(rows, value);
      });
  }

  private async updateCustomBadges(
    rows: readonly DisplayRow[],
    value: ManageCustomBadgesDialogValue,
  ): Promise<void> {
    this.bulkActionPending.set(true);
    const result = await this.api.updateEntityCustomBadges({
      projectId: this.projectId,
      entity: this.entity(),
      ids: rows.map(({ id }) => id),
      ...value,
    });
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.entitySelection.clear();
    await this.loadFilterOptions();
    await this.load();
    this.snackBar.open(
      `Custom badges updated for ${formatUiNumber(rows.length)} ${
        rows.length === 1 ? this.selectedEntitySingular() : this.selectedEntityPlural()
      }.`,
      'Dismiss',
      { duration: 3000 },
    );
  }
}
