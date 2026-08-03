import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  type CombinedEntity,
  type CombinedEntityFilterOptions,
  type CombinedEntityKind,
  type CombinedLeague,
  type CombinedPlayer,
  type CombinedTeam,
  type PlayerFoot,
  type SourceName,
  sourceLabels,
} from '../../../../../shared/downloader/contracts';
import { findFootballCountryByCode3 } from '../../../../../shared/downloader/football-countries';
import { formatReferenceDate } from '../../../../../shared/downloader/reference-date';
import {
  formatEuroCurrency,
  formatUiCount,
  formatUiNumber,
} from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import {
  CombinedEntityStatusBadge,
  combinedEntityStatuses,
} from '../../../shared/combined-entity-status-badge/combined-entity-status-badge';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import { PageHeader } from '../../../shared/page-header/page-header';
import { PositionBadge } from '../../../shared/position-badge/position-badge';
import { PositionDetailBadge } from '../../../shared/position-detail-badge/position-detail-badge';
import {
  CombinedEntityFilterDrawer,
  type CombinedEntityFilterDrawerData,
  type CombinedEntityFilters,
  copyCombinedEntityFilters,
  emptyCombinedEntityFilters,
} from '../combined-entity-filter-drawer/combined-entity-filter-drawer';
import {
  EntityColumnDrawer,
  type EntityColumnDrawerData,
} from '../entity-column-drawer/entity-column-drawer';
import type { ColumnPreference } from '../entity-column-editor/column-layout';
import {
  ManageCustomBadgesDialog,
  type ManageCustomBadgesDialogData,
  type ManageCustomBadgesDialogValue,
} from '../manage-custom-badges-dialog/manage-custom-badges-dialog';
import { CombinedEntityColumnPreferences } from './combined-entity-column-preferences';
import {
  combinedColumnsByEntity,
  defaultCombinedColumnPreference,
  visibleCombinedColumnsFromPreference,
} from './combined-entity-columns';
import { CombinedEntityFilterPreferences } from './combined-entity-filter-preferences';

interface DeleteCombinedDialogData {
  entity: CombinedEntityKind;
  name?: string;
  bulk?: boolean;
  entityCount?: number;
  teamCount?: number;
  playerCount?: number;
}

@Component({
  selector: 'app-delete-combined-dialog',
  imports: [MatButtonModule, MatDialogModule, MatRadioModule],
  templateUrl: './delete-combined-dialog.html',
  styleUrl: './delete-combined-dialog.css',
})
export class DeleteCombinedDialog {
  protected readonly data = inject<DeleteCombinedDialogData>(MAT_DIALOG_DATA);
  protected readonly mode = signal<'detach' | 'cascade'>('detach');
  protected readonly singular = `project ${this.data.entity.slice(0, -1)}`;
  protected readonly entityCount = this.data.entityCount ?? 1;
  protected readonly entityCountLabel = formatUiCount(this.entityCount, this.singular);
  protected readonly teamCountLabel = formatUiCount(this.data.teamCount ?? 0, 'project team');
  protected readonly playerCount = this.data.playerCount ?? 0;
  protected readonly playerCountLabel = formatUiCount(this.playerCount, 'project player');
  protected readonly title = this.data.bulk
    ? `Delete selected ${this.entityCount === 1 ? this.singular : `project ${this.data.entity}`}?`
    : `Delete ${this.singular}`;
}

const headings: Record<CombinedEntityKind, string> = {
  leagues: 'Leagues',
  teams: 'Teams',
  players: 'Players',
};

const icons: Record<CombinedEntityKind, string> = {
  leagues: 'emoji_events',
  teams: 'shield',
  players: 'groups',
};

const parentLabels: Record<CombinedEntityKind, string> = {
  leagues: 'Teams',
  teams: 'League',
  players: 'Team',
};

const footLabels: Record<PlayerFoot, string> = {
  LEFT: 'Left',
  RIGHT: 'Right',
};

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function equalValues<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

@Component({
  selector: 'app-combined-entity-page',
  imports: [
    CombinedEntityStatusBadge,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    CountryFlag,
    CustomBadgeView,
    PageHeader,
    PositionBadge,
    PositionDetailBadge,
    RouterLink,
  ],
  templateUrl: './combined-entity-page.html',
  styleUrl: './combined-entity-page.css',
})
export class CombinedEntityPage {
  private readonly api = inject(DesktopApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly columnPreferences = inject(CombinedEntityColumnPreferences);
  private readonly filterPreferences = inject(CombinedEntityFilterPreferences);
  protected readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  protected readonly entity = this.route.snapshot.data['entity'] as CombinedEntityKind;
  protected readonly heading = headings[this.entity];
  protected readonly icon = icons[this.entity];
  protected readonly parentLabel = parentLabels[this.entity];
  protected readonly rows = signal<CombinedEntity[]>([]);
  protected readonly total = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly search = signal('');
  private readonly filters = signal<CombinedEntityFilters>(emptyCombinedEntityFilters());
  protected readonly activeFilterCount = computed(() => {
    const filters = this.filters();
    return (
      Number(filters.sourceNames.length > 0) +
      Number(filters.statuses.length > 0 || filters.customBadgeIds.length > 0) +
      Number(filters.parentIds.length > 0 || filters.includeTeamsWithoutLeague) +
      Number(filters.tiers.length > 0 || filters.includeLeaguesWithoutTier) +
      Number(filters.countries.length > 0) +
      Number(filters.nationalities.length > 0) +
      Number(filters.positions.length > 0) +
      Number(filters.positionDetails.length > 0) +
      Number(filters.feet.length > 0)
    );
  });
  protected readonly filterOptions = signal<CombinedEntityFilterOptions | undefined>(undefined);
  protected readonly filterLoading = signal(false);
  protected readonly filterError = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly bulkActionPending = signal(false);
  private readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedRows = computed(() => {
    const selectedIds = this.selectedIds();
    return this.rows().filter(({ id }) => selectedIds.has(id));
  });
  protected readonly selectedCount = computed(() => this.selectedRows().length);
  protected readonly allRowsSelected = computed(
    () => this.rows().length > 0 && this.rows().every(({ id }) => this.selectedIds().has(id)),
  );
  protected readonly someRowsSelected = computed(
    () => this.selectedCount() > 0 && !this.allRowsSelected(),
  );
  protected readonly columnDefinitions = combinedColumnsByEntity[this.entity];
  private readonly columnPreference = signal(this.columnPreferences.load(this.entity));
  protected readonly columns = computed(() =>
    visibleCombinedColumnsFromPreference(this.entity, this.columnPreference()),
  );
  protected readonly displayedColumns = computed<readonly string[]>(() => [
    'select',
    ...this.columns(),
  ]);
  protected readonly hiddenColumnCount = computed(
    () => this.columnDefinitions.length - this.columns().length,
  );
  protected readonly sourceLabels = sourceLabels;
  protected readonly description = computed(
    () =>
      `Browse canonical ${this.entity} assembled from multiple providers without changing source records.`,
  );
  private parentQueryInitialized = false;
  private filterPreferencesInitialized = false;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const parameter = this.entity === 'teams' ? 'leagueId' : 'teamId';
      let restoredFilters: CombinedEntityFilters | undefined;
      if (!this.filterPreferencesInitialized) {
        this.filterPreferencesInitialized = true;
        const hasExplicitParentFilter = this.entity !== 'leagues' && params.has(parameter);
        if (!hasExplicitParentFilter) {
          restoredFilters = this.filterPreferences.load(this.projectId, this.entity);
          if (restoredFilters) void this.updateParentFilterUrl(restoredFilters, false);
        }
      }
      const parentIds = restoredFilters
        ? restoredFilters.parentIds
        : this.entity === 'leagues'
          ? []
          : uniqueIds(params.getAll(parameter));
      const current = this.filters();
      const parentFilterChanged = !equalValues(current.parentIds, parentIds);
      if (restoredFilters) {
        this.filters.set(restoredFilters);
      } else if (parentFilterChanged) {
        const nextFilters = { ...current, parentIds };
        this.filters.set(nextFilters);
        if (this.parentQueryInitialized) {
          this.filterPreferences.save(this.projectId, this.entity, nextFilters);
        }
      }
      if (!this.parentQueryInitialized || parentFilterChanged || restoredFilters) {
        this.parentQueryInitialized = true;
        this.pageIndex.set(0);
        void this.load();
      }
    });
    void this.loadFilterOptions();
  }

  protected setSearch(search: string): void {
    this.search.set(search);
    this.pageIndex.set(0);
    void this.load();
  }

  protected openFilters(): void {
    this.dialog
      .open<CombinedEntityFilterDrawer, CombinedEntityFilterDrawerData, CombinedEntityFilters>(
        CombinedEntityFilterDrawer,
        {
          ariaLabelledBy: 'combined-entity-filter-title',
          ariaModal: true,
          autoFocus: 'first-tabbable',
          data: {
            entity: this.entity,
            filters: copyCombinedEntityFilters(this.filters()),
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
        },
      )
      .afterClosed()
      .subscribe((filters) => {
        if (!filters) return;
        const nextFilters = copyCombinedEntityFilters(filters);
        this.filters.set(nextFilters);
        this.pageIndex.set(0);
        void this.updateParentFilterUrl(nextFilters);
        void this.load();
      });
  }

  protected openColumns(): void {
    this.dialog
      .open<EntityColumnDrawer, EntityColumnDrawerData, ColumnPreference>(EntityColumnDrawer, {
        ariaLabelledBy: 'entity-column-title',
        ariaModal: true,
        autoFocus: 'first-tabbable',
        data: {
          entity: this.entity,
          columns: this.columnDefinitions,
          preference: this.columnPreference(),
          defaultPreference: defaultCombinedColumnPreference(this.entity),
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
      })
      .afterClosed()
      .subscribe((preference) => {
        if (!preference) return;
        this.columnPreferences.save(this.entity, preference);
        this.columnPreference.set(preference);
      });
  }

  protected paginate(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    void this.load();
  }

  protected retryFilterOptions(): void {
    void this.loadFilterOptions();
  }

  protected rowSelected(row: CombinedEntity): boolean {
    return this.selectedIds().has(row.id);
  }

  protected toggleRow(row: CombinedEntity, checked: boolean): void {
    if (this.bulkActionPending()) return;
    this.selectedIds.update((selectedIds) => {
      const next = new Set(selectedIds);
      if (checked) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  }

  protected toggleAllRows(checked: boolean): void {
    if (this.bulkActionPending()) return;
    this.selectedIds.set(checked ? new Set(this.rows().map(({ id }) => id)) : new Set());
  }

  protected parentName(row: CombinedEntity): string {
    if ('teamId' in row) return row.teamName ?? 'Unknown team';
    if ('leagueId' in row) return row.leagueName ?? 'No league';
    return formatUiNumber((row as CombinedLeague).teamCount ?? 0);
  }

  protected countryFlagCode(row: CombinedEntity): string | undefined {
    return row.countryCode3
      ? (findFootballCountryByCode3(row.countryCode3)?.flagCode ?? row.countryCode2)
      : row.countryCode2;
  }

  protected tier(row: CombinedEntity): number | string {
    return 'tier' in row ? (row.tier ?? '—') : '—';
  }

  protected playerCount(row: CombinedEntity): number {
    return (row as CombinedTeam).playerCount ?? 0;
  }

  protected playerData(row: CombinedEntity): CombinedPlayer {
    return row as CombinedPlayer;
  }

  protected birthdate(row: CombinedEntity): string {
    const birthdate = this.playerData(row).birthdate;
    return birthdate ? formatReferenceDate(birthdate) : '—';
  }

  protected foot(row: CombinedEntity): string {
    const foot = this.playerData(row).foot;
    return foot ? footLabels[foot] : '—';
  }

  protected playerDate(row: CombinedEntity, field: 'joined' | 'contractExpires'): string {
    const value = this.playerData(row)[field];
    return value ? formatReferenceDate(value) : '—';
  }

  protected marketValue(row: CombinedEntity): string {
    const value = this.playerData(row).marketValue;
    return value === undefined ? '—' : formatEuroCurrency(value);
  }

  protected sourceLabel(sourceName: SourceName): string {
    return sourceLabels[sourceName];
  }

  protected recombineId(row: CombinedEntity): string | undefined {
    if (this.entity === 'teams') return row.id;
    if (this.entity === 'players') return (row as CombinedPlayer).teamId;
    return undefined;
  }

  protected confirmDelete(row: CombinedEntity): void {
    if (this.bulkActionPending()) return;
    this.dialog
      .open<DeleteCombinedDialog, DeleteCombinedDialogData, 'delete' | 'detach' | 'cascade'>(
        DeleteCombinedDialog,
        {
          data: { entity: this.entity, name: row.name },
          role: 'alertdialog',
          autoFocus: 'first-tabbable',
        },
      )
      .afterClosed()
      .subscribe((mode) => {
        if (mode) void this.delete(row, mode === 'cascade');
      });
  }

  protected manageRowCustomBadges(row: CombinedEntity): void {
    this.openCustomBadgesDialog([row]);
  }

  protected manageSelectedCustomBadges(): void {
    this.openCustomBadgesDialog(this.selectedRows());
  }

  protected confirmSelectedDeletion(): void {
    const selectedRows = this.selectedRows();
    if (this.bulkActionPending() || !selectedRows.length) return;
    const teamCount =
      this.entity === 'leagues'
        ? (selectedRows as CombinedLeague[]).reduce(
            (total, league) => total + (league.teamCount ?? 0),
            0,
          )
        : this.entity === 'teams'
          ? selectedRows.length
          : 0;
    const playerCount =
      this.entity === 'leagues'
        ? (selectedRows as CombinedLeague[]).reduce(
            (total, league) => total + (league.playerCount ?? 0),
            0,
          )
        : this.entity === 'teams'
          ? (selectedRows as CombinedTeam[]).reduce(
              (total, team) => total + (team.playerCount ?? 0),
              0,
            )
          : selectedRows.length;
    this.dialog
      .open<DeleteCombinedDialog, DeleteCombinedDialogData, 'delete' | 'detach' | 'cascade'>(
        DeleteCombinedDialog,
        {
          data: {
            entity: this.entity,
            bulk: true,
            entityCount: selectedRows.length,
            teamCount,
            playerCount,
          },
          role: 'alertdialog',
          autoFocus: 'first-tabbable',
          maxWidth: this.entity === 'leagues' ? '36rem' : undefined,
        },
      )
      .afterClosed()
      .subscribe((mode) => {
        if (mode) void this.deleteSelectedEntities(selectedRows, mode === 'cascade');
      });
  }

  private async delete(row: CombinedEntity, cascade: boolean): Promise<void> {
    const result = await this.api.deleteCombinedEntity(
      this.projectId,
      this.entity,
      row.id,
      cascade,
    );
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.clampPageAfterDeletion(1);
    this.snackBar.open(`${row.name} deleted. Source data was preserved.`, 'Dismiss', {
      duration: 4000,
    });
    await this.loadFilterOptions();
    await this.load();
  }

  private openCustomBadgesDialog(rows: readonly CombinedEntity[]): void {
    if (this.bulkActionPending() || !rows.length) return;
    const badges = this.filterOptions()?.customBadges ?? [];
    this.dialog
      .open<ManageCustomBadgesDialog, ManageCustomBadgesDialogData, ManageCustomBadgesDialogValue>(
        ManageCustomBadgesDialog,
        {
          data: {
            entity: this.entity,
            entities: rows,
            badges,
            settingsPathLabel: 'Global settings → Combined data → Badges',
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
    rows: readonly CombinedEntity[],
    value: ManageCustomBadgesDialogValue,
  ): Promise<void> {
    this.bulkActionPending.set(true);
    const result = await this.api.updateCombinedEntityCustomBadges({
      projectId: this.projectId,
      entity: this.entity,
      ids: rows.map(({ id }) => id),
      ...value,
    });
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.selectedIds.set(new Set());
    await this.loadFilterOptions();
    await this.load();
    const singular = this.entity.slice(0, -1);
    this.snackBar.open(
      `Custom badges updated for ${formatUiNumber(rows.length)} ${
        rows.length === 1 ? singular : this.entity
      }.`,
      'Dismiss',
      { duration: 3000 },
    );
  }

  private async deleteSelectedEntities(
    selectedRows: readonly CombinedEntity[],
    cascade: boolean,
  ): Promise<void> {
    if (this.bulkActionPending() || !selectedRows.length) return;
    this.bulkActionPending.set(true);
    const ids = selectedRows.map(({ id }) => id);
    const result =
      this.entity === 'leagues'
        ? await this.api.deleteCombinedLeagues(this.projectId, ids, cascade)
        : this.entity === 'teams'
          ? await this.api.deleteCombinedTeams(this.projectId, ids)
          : await this.api.deleteCombinedPlayers(this.projectId, ids);
    this.bulkActionPending.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.clampPageAfterDeletion(selectedRows.length);
    this.selectedIds.set(new Set());
    await this.loadFilterOptions();
    await this.load();
    const singular = this.entity.slice(0, -1);
    this.snackBar.open(
      `${formatUiNumber(selectedRows.length)} project ${
        selectedRows.length === 1 ? singular : this.entity
      } deleted. Source data was preserved.`,
      'Dismiss',
      { duration: 4000 },
    );
  }

  private clampPageAfterDeletion(deletedCount: number): void {
    const remainingTotal = Math.max(0, this.total() - deletedCount);
    const lastPageIndex = Math.max(0, Math.ceil(remainingTotal / this.pageSize()) - 1);
    this.pageIndex.update((pageIndex) => Math.min(pageIndex, lastPageIndex));
  }

  private updateParentFilterUrl(filters: CombinedEntityFilters, persist = true): Promise<boolean> {
    if (persist) this.filterPreferences.save(this.projectId, this.entity, filters);
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        leagueId:
          this.entity === 'teams' && filters.parentIds.length ? [...filters.parentIds] : null,
        teamId:
          this.entity === 'players' && filters.parentIds.length ? [...filters.parentIds] : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async load(): Promise<void> {
    this.selectedIds.set(new Set());
    this.loading.set(true);
    this.error.set('');
    const filters = this.filters();
    const needsReview =
      filters.statuses.length === 1 ? filters.statuses[0] === 'needsReview' : undefined;
    const customBadgeIds = filters.statuses.length === 2 ? [] : filters.customBadgeIds;
    const result = await this.api.listCombinedEntities({
      projectId: this.projectId,
      entity: this.entity,
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      search: this.search(),
      sort: 'name',
      direction: 'asc',
      sourceNames: filters.sourceNames,
      ...(this.entity === 'teams' && filters.parentIds.length && { leagueIds: filters.parentIds }),
      ...(this.entity === 'teams' &&
        filters.includeTeamsWithoutLeague && { includeTeamsWithoutLeague: true }),
      ...(this.entity === 'players' && filters.parentIds.length && { teamIds: filters.parentIds }),
      ...(this.entity === 'leagues' && filters.tiers.length && { tiers: filters.tiers }),
      ...(this.entity === 'leagues' &&
        filters.includeLeaguesWithoutTier && { includeLeaguesWithoutTier: true }),
      ...(this.entity !== 'players' &&
        filters.countries.length && { countries: filters.countries }),
      ...(this.entity === 'players' &&
        filters.nationalities.length && { nationalities: filters.nationalities }),
      ...(this.entity === 'players' &&
        filters.positions.length && { positions: filters.positions }),
      ...(this.entity === 'players' &&
        filters.positionDetails.length && { positionDetails: filters.positionDetails }),
      ...(this.entity === 'players' && filters.feet.length && { feet: filters.feet }),
      ...(needsReview !== undefined && { needsReview }),
      ...(customBadgeIds.length && { customBadgeIds }),
    });
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.error.message);
      return;
    }
    this.rows.set(result.value.rows);
    this.total.set(result.value.total);
  }

  private async loadFilterOptions(): Promise<void> {
    this.filterLoading.set(true);
    this.filterError.set('');
    const result = await this.api.listCombinedEntityFilterOptions({
      projectId: this.projectId,
      entity: this.entity,
    });
    this.filterLoading.set(false);
    if (!result.ok) {
      this.filterError.set(result.error.message);
      return;
    }
    const options = result.value;
    this.filterOptions.set(options);
    const filters = this.filters();
    const normalized = this.normalizeFilters(filters, options);
    if (!this.filtersEqual(filters, normalized)) {
      this.filters.set(normalized);
      await this.updateParentFilterUrl(normalized);
      await this.load();
    } else {
      this.filterPreferences.save(this.projectId, this.entity, normalized);
    }
  }

  private normalizeFilters(
    filters: CombinedEntityFilters,
    options: CombinedEntityFilterOptions,
  ): CombinedEntityFilters {
    const normalized = emptyCombinedEntityFilters();
    normalized.sourceNames = [...filters.sourceNames];
    normalized.statuses = filters.statuses.filter((status) =>
      combinedEntityStatuses.includes(status),
    );
    const customBadgeIds = new Set((options.customBadges ?? []).map(({ id }) => id));
    normalized.customBadgeIds = filters.customBadgeIds.filter((id) => customBadgeIds.has(id));
    if (options.entity === 'leagues') {
      const countries = new Set(options.countries.map(({ name }) => name));
      const tiers = new Set(options.tiers);
      normalized.countries = filters.countries.filter((country) => countries.has(country));
      normalized.tiers = filters.tiers.filter((tier) => tiers.has(tier));
      normalized.includeLeaguesWithoutTier =
        filters.includeLeaguesWithoutTier && options.hasLeaguesWithoutTier;
      return normalized;
    }
    if (options.entity === 'teams') {
      const parentIds = new Set(options.leagues.map(({ id }) => id));
      const countries = new Set(options.countries.map(({ name }) => name));
      normalized.parentIds = filters.parentIds.filter((id) => parentIds.has(id));
      normalized.includeTeamsWithoutLeague =
        filters.includeTeamsWithoutLeague && options.hasTeamsWithoutLeague;
      normalized.countries = filters.countries.filter((country) => countries.has(country));
      return normalized;
    }
    const parentIds = new Set(options.teams.map(({ id }) => id));
    const nationalities = new Set(options.nationalities.map(({ name }) => name));
    const positions = new Set(options.positions);
    const positionDetails = new Set(options.positionDetails);
    const feet = new Set(options.feet);
    normalized.parentIds = filters.parentIds.filter((id) => parentIds.has(id));
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

  private filtersEqual(left: CombinedEntityFilters, right: CombinedEntityFilters): boolean {
    return (
      equalValues(left.sourceNames, right.sourceNames) &&
      equalValues(left.statuses, right.statuses) &&
      equalValues(left.customBadgeIds, right.customBadgeIds) &&
      equalValues(left.parentIds, right.parentIds) &&
      left.includeTeamsWithoutLeague === right.includeTeamsWithoutLeague &&
      equalValues(left.tiers, right.tiers) &&
      left.includeLeaguesWithoutTier === right.includeLeaguesWithoutTier &&
      equalValues(left.countries, right.countries) &&
      equalValues(left.nationalities, right.nationalities) &&
      equalValues(left.positions, right.positions) &&
      equalValues(left.positionDetails, right.positionDetails) &&
      equalValues(left.feet, right.feet)
    );
  }
}
