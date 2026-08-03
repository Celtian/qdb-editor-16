import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute } from '@angular/router';

import {
  type EntityFilterOption,
  type EntityKind,
  type ExportColumnMapping,
  type ExportColumnSelection,
  type ExportConfigurationPreference,
  type ExportDataset,
  type ExportFieldNameConfiguration,
  type ExportFormat,
  type ExportResult,
  sourceLabels,
} from '../../../../../shared/downloader/contracts';
import {
  camelCaseExportFieldNames,
  cloneExportColumns,
  cloneExportFieldNames,
  defaultExportColumns,
  exportColumnDefinitions,
  sameExportColumns,
  sameExportFieldNames,
  validateExportColumns,
  validateExportFieldNames,
} from '../../../../../shared/downloader/export-schema';
import { findFootballCountryByName } from '../../../../../shared/downloader/football-countries';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import {
  ExportColumnPresetsService,
  camelCaseExportFieldNamePresetId,
  defaultExportVisibilityPresetId,
} from '../../../core/export-column-presets.service';
import { ConfettiService } from '../../../shared/confetti/confetti.service';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { ExportColumnEditor } from '../../../shared/export-column-editor/export-column-editor';
import { PageHeader } from '../../../shared/page-header/page-header';

const exportFormatLabels: Record<ExportFormat, string> = {
  json: 'JSON',
  'single-json': 'Single JSON',
  csv: 'CSV',
};
const modifiedPresetId = 'modified';

@Component({
  selector: 'app-export-page',
  imports: [
    CountryFlag,
    ExportColumnEditor,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatStepperModule,
    PageHeader,
  ],
  templateUrl: './export-page.html',
  styleUrl: './export-page.css',
})
export class ExportPage {
  private readonly api = inject(DesktopApi);
  private readonly confetti = inject(ConfettiService);
  private readonly exportPresets = inject(ExportColumnPresetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  private readonly routeDataset: ExportDataset =
    this.route.snapshot?.data?.['dataset'] === 'combined' ? 'combined' : 'source';
  protected readonly visibilityPresets = this.exportPresets.visibilityPresets;
  protected readonly fieldNamePresets = this.exportPresets.fieldNamePresets;
  protected readonly dataset = signal<ExportDataset>(this.routeDataset);
  protected readonly format = signal<ExportFormat>('single-json');
  protected readonly columns = signal<ExportColumnSelection>(defaultExportColumns());
  protected readonly fieldNames = signal<ExportFieldNameConfiguration>(camelCaseExportFieldNames());
  protected readonly selectedVisibilityPresetId = signal(defaultExportVisibilityPresetId);
  protected readonly selectedFieldNamePresetId = signal(camelCaseExportFieldNamePresetId);
  protected readonly destination = signal('');
  protected readonly leagues = signal<readonly EntityFilterOption[]>([]);
  protected readonly hasTeamsWithoutLeague = signal(false);
  protected readonly includeTeamsWithoutLeague = signal(false);
  protected readonly selectedLeagueIds = signal<readonly string[]>([]);
  protected readonly loadingLeagues = signal(true);
  protected readonly choosingFolder = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly warning = signal('');
  protected readonly result = signal<ExportResult | undefined>(undefined);
  protected readonly formatLabel = computed(() => exportFormatLabels[this.format()]);
  protected readonly visibilityPresetLabel = computed(
    () =>
      this.visibilityPresets().find((preset) => preset.id === this.selectedVisibilityPresetId())
        ?.name ?? 'Custom (modified)',
  );
  protected readonly fieldNamePresetLabel = computed(
    () =>
      this.fieldNamePresets().find((preset) => preset.id === this.selectedFieldNamePresetId())
        ?.name ?? 'Custom (modified)',
  );
  protected readonly columnsValid = computed(
    () =>
      validateExportColumns(this.columns()).length === 0 &&
      validateExportFieldNames(this.fieldNames()).length === 0,
  );
  protected readonly allLeaguesSelected = computed(
    () =>
      (this.leagues().length > 0 || this.hasTeamsWithoutLeague()) &&
      this.selectedLeagueIds().length === this.leagues().length &&
      (!this.hasTeamsWithoutLeague() || this.includeTeamsWithoutLeague()),
  );
  protected readonly someLeaguesSelected = computed(
    () =>
      (this.selectedLeagueIds().length > 0 || this.includeTeamsWithoutLeague()) &&
      !this.allLeaguesSelected(),
  );
  protected readonly leagueSelectionValid = computed(
    () =>
      !this.loadingLeagues() &&
      (this.leagues().length === 0 && !this.hasTeamsWithoutLeague()
        ? true
        : this.selectedLeagueIds().length > 0 || this.includeTeamsWithoutLeague()),
  );

  constructor() {
    void this.initialize();
  }

  protected selectFormat(value: unknown): void {
    if (value !== 'json' && value !== 'single-json' && value !== 'csv') return;
    this.format.set(value);
    this.resetResult();
  }

  protected selectVisibilityPreset(value: unknown): void {
    if (typeof value !== 'string') return;
    const preset = this.visibilityPresets().find((candidate) => candidate.id === value);
    if (!preset) return;
    this.selectedVisibilityPresetId.set(preset.id);
    this.columns.set(cloneExportColumns(preset.columns));
    this.resetResult();
  }

  protected selectFieldNamePreset(value: unknown): void {
    if (typeof value !== 'string') return;
    const preset = this.fieldNamePresets().find((candidate) => candidate.id === value);
    if (!preset) return;
    this.selectedFieldNamePresetId.set(preset.id);
    this.fieldNames.set(cloneExportFieldNames(preset.fieldNames));
    this.resetResult();
  }

  protected updateColumns(columns: ExportColumnSelection): void {
    this.columns.set(columns);
    const selectedPreset = this.visibilityPresets().find(
      (preset) =>
        preset.id === this.selectedVisibilityPresetId() &&
        sameExportColumns(preset.columns, columns),
    );
    const matchingPreset =
      selectedPreset ??
      this.visibilityPresets().find((preset) => sameExportColumns(preset.columns, columns));
    this.selectedVisibilityPresetId.set(matchingPreset?.id ?? modifiedPresetId);
    this.resetResult();
  }

  protected updateFieldNames(fieldNames: ExportFieldNameConfiguration): void {
    this.fieldNames.set(fieldNames);
    const selectedPreset = this.fieldNamePresets().find(
      (preset) =>
        preset.id === this.selectedFieldNamePresetId() &&
        sameExportFieldNames(preset.fieldNames, fieldNames),
    );
    const matchingPreset =
      selectedPreset ??
      this.fieldNamePresets().find((preset) => sameExportFieldNames(preset.fieldNames, fieldNames));
    this.selectedFieldNamePresetId.set(matchingPreset?.id ?? modifiedPresetId);
    this.resetResult();
  }

  protected async chooseFolder(): Promise<void> {
    this.choosingFolder.set(true);
    this.error.set('');
    const response = await this.api.chooseExportDirectory();
    this.choosingFolder.set(false);
    if (!response.ok) {
      this.error.set(response.error.message);
      return;
    }
    if (response.value) {
      this.destination.set(response.value);
      this.resetResult();
    }
  }

  protected toggleAllLeagues(selected: boolean): void {
    this.selectedLeagueIds.set(selected ? this.leagues().map(({ id }) => id) : []);
    this.includeTeamsWithoutLeague.set(selected && this.hasTeamsWithoutLeague());
    this.resetResult();
  }

  protected toggleLeague(leagueId: string, selected: boolean): void {
    this.selectedLeagueIds.update((current) =>
      selected ? [...new Set([...current, leagueId])] : current.filter((id) => id !== leagueId),
    );
    this.resetResult();
  }

  protected isLeagueSelected(leagueId: string): boolean {
    return this.selectedLeagueIds().includes(leagueId);
  }

  protected providerLabel(league: EntityFilterOption): string {
    if (this.dataset() === 'combined') return 'Linked providers';
    return league.sourceName ? sourceLabels[league.sourceName] : 'Provider not set';
  }

  protected toggleTeamsWithoutLeague(selected: boolean): void {
    this.includeTeamsWithoutLeague.set(selected);
    this.resetResult();
  }

  protected columnSummary(entity: EntityKind): string {
    const labels = new Map<string, string>(
      exportColumnDefinitions[entity].map(({ key, label }) => [key, label]),
    );
    const outputNames = new Map(
      (this.fieldNames()[entity] as readonly ExportColumnMapping[]).map(
        ({ sourceKey, outputName }) => [sourceKey, outputName],
      ),
    );
    return (this.columns()[entity] as readonly string[])
      .map(
        (sourceKey) =>
          `${labels.get(sourceKey) ?? sourceKey} → ${outputNames.get(sourceKey) ?? sourceKey}`,
      )
      .join(', ');
  }

  protected leagueSummary(): string {
    if (this.leagues().length === 0 && !this.hasTeamsWithoutLeague()) {
      return 'No leagues available';
    }
    if (this.allLeaguesSelected()) {
      if (this.leagues().length === 0) return 'Teams without a league';
      return this.hasTeamsWithoutLeague()
        ? `All ${formatUiCount(this.leagues().length, 'league')} and teams without a league`
        : `All ${formatUiCount(this.leagues().length, 'league')}`;
    }
    const selected = new Set(this.selectedLeagueIds());
    const names = this.leagues()
      .filter(({ id }) => selected.has(id))
      .map(({ name }) => name);
    if (this.includeTeamsWithoutLeague()) names.push('Teams without a league');
    return names.join(', ');
  }

  protected async export(): Promise<void> {
    if (!this.destination() || !this.leagueSelectionValid() || !this.columnsValid()) return;
    const configuration: ExportConfigurationPreference = {
      dataset: this.dataset(),
      format: this.format(),
      columns: cloneExportColumns(this.columns()),
      fieldNames: cloneExportFieldNames(this.fieldNames()),
    };
    this.busy.set(true);
    this.error.set('');
    this.warning.set('');
    this.result.set(undefined);
    const response = await this.api.exportProject({
      projectId: this.projectId,
      ...configuration,
      destination: this.destination(),
      includeTeamsWithoutLeague: this.includeTeamsWithoutLeague(),
      leagueIds: [...this.selectedLeagueIds()],
    });
    this.busy.set(false);
    if (!response.ok) {
      this.error.set(response.error.message);
      return;
    }
    this.result.set(response.value);
    this.confetti.celebrate();
    const preferenceResponse = await this.api.updateExportConfiguration(configuration);
    if (!preferenceResponse.ok) {
      this.warning.set(
        `Export completed, but your export choices could not be remembered: ${preferenceResponse.error.message}`,
      );
    }
  }

  protected openDirectory(): void {
    const directory = this.result()?.directory;
    if (directory) void this.api.openExportDirectory(directory);
  }

  protected fileCountLabel(count: number): string {
    return `${formatUiCount(count, 'file')} created`;
  }

  private async initialize(): Promise<void> {
    const [configurationResponse] = await Promise.all([
      this.api.getExportConfiguration(),
      this.exportPresets.whenInitialized(),
      this.loadDestination(),
    ]);
    if (configurationResponse.ok && configurationResponse.value) {
      this.restoreConfiguration(configurationResponse.value);
    }
    await this.loadLeagues();
  }

  private restoreConfiguration(configuration: ExportConfigurationPreference): void {
    this.format.set(configuration.format);
    this.columns.set(cloneExportColumns(configuration.columns));
    this.fieldNames.set(cloneExportFieldNames(configuration.fieldNames));
    this.selectedVisibilityPresetId.set(
      this.visibilityPresets().find((preset) =>
        sameExportColumns(preset.columns, configuration.columns),
      )?.id ?? modifiedPresetId,
    );
    this.selectedFieldNamePresetId.set(
      this.fieldNamePresets().find((preset) =>
        sameExportFieldNames(preset.fieldNames, configuration.fieldNames),
      )?.id ?? modifiedPresetId,
    );
  }

  private resetResult(): void {
    this.result.set(undefined);
    this.warning.set('');
  }

  private async loadDestination(): Promise<void> {
    const response = await this.api.getExportDestination();
    if (!response.ok) {
      this.error.set(response.error.message);
      return;
    }
    if (response.value) this.destination.set(response.value);
  }

  private async loadLeagues(): Promise<void> {
    this.loadingLeagues.set(true);
    this.error.set('');
    if (this.dataset() === 'combined') {
      const [leagueResponse, teamResponse] = await Promise.all([
        this.api.listCombinedEntities({
          projectId: this.projectId,
          entity: 'leagues',
          pageIndex: 0,
          pageSize: 200,
          search: '',
          sort: 'name',
          direction: 'asc',
        }),
        this.api.listCombinedEntities({
          projectId: this.projectId,
          entity: 'teams',
          pageIndex: 0,
          pageSize: 200,
          search: '',
          sort: 'name',
          direction: 'asc',
        }),
      ]);
      if (!leagueResponse.ok || !teamResponse.ok) {
        this.loadingLeagues.set(false);
        this.error.set(
          !leagueResponse.ok
            ? leagueResponse.error.message
            : teamResponse.ok
              ? ''
              : teamResponse.error.message,
        );
        return;
      }
      const leagues = leagueResponse.value.rows.map((league) => ({
        id: league.id,
        name: league.name,
        countryName: 'countryName' in league ? league.countryName : undefined,
        countryCode:
          'countryCode3' in league && league.countryCode3
            ? findFootballCountryByName(league.countryName ?? '')?.flagCode
            : undefined,
        tier: 'tier' in league ? league.tier : undefined,
      }));
      const hasUnassigned = teamResponse.value.rows.some(
        (team) => 'leagueId' in team && !team.leagueId,
      );
      this.leagues.set(leagues);
      this.hasTeamsWithoutLeague.set(hasUnassigned);
      this.includeTeamsWithoutLeague.set(hasUnassigned);
      this.selectedLeagueIds.set(leagues.map(({ id }) => id));
      this.loadingLeagues.set(false);
      return;
    }
    const response = await this.api.listEntityFilterOptions({
      projectId: this.projectId,
      entity: 'teams',
    });
    if (!response.ok) {
      this.loadingLeagues.set(false);
      this.error.set(response.error.message);
      return;
    }
    if (response.value.entity !== 'teams') {
      this.loadingLeagues.set(false);
      this.error.set('League options could not be loaded.');
      return;
    }
    const leagues = await Promise.all(
      response.value.leagues.map(async (league) => {
        const countryCode =
          league.countryCode ??
          (league.countryName
            ? findFootballCountryByName(league.countryName)?.flagCode
            : undefined);
        const option = countryCode ? { ...league, countryCode } : league;
        if (!option.sourceId || option.name !== option.sourceId) return option;
        const preview = await this.api.previewLeague({
          sourceName: option.sourceName ?? 'transfermarkt',
          identifierOrUrl: option.sourceId,
        });
        return preview.ok && preview.value.name ? { ...option, name: preview.value.name } : option;
      }),
    );
    this.leagues.set(leagues);
    this.hasTeamsWithoutLeague.set(response.value.hasTeamsWithoutLeague);
    this.includeTeamsWithoutLeague.set(response.value.hasTeamsWithoutLeague);
    this.selectedLeagueIds.set(leagues.map(({ id }) => id));
    this.loadingLeagues.set(false);
  }
}
