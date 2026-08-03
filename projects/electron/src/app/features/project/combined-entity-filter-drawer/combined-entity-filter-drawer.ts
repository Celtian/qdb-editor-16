import { Component, type Signal, computed, inject, signal } from '@angular/core';
import { FormField, disabled, form, submit } from '@angular/forms/signals';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { type MatSelectChange, MatSelectModule } from '@angular/material/select';

import {
  type CombinedEntityFilterOptions,
  type CombinedEntityKind,
  type CountryFilterOption,
  type EntityFilterOption,
  type NationalityFilterOption,
  type PlayerFoot,
  type PlayerPosition,
  type PlayerPositionDetail,
  type SourceName,
  sourceLabels,
  sourceNames,
} from '../../../../../shared/downloader/contracts';
import {
  type CombinedEntityStatus,
  combinedEntityStatusDetails,
  combinedEntityStatuses,
} from '../../../shared/combined-entity-status-badge/combined-entity-status-badge';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import { PositionBadge, positionBadgeDetails } from '../../../shared/position-badge/position-badge';
import { PositionDetailBadge } from '../../../shared/position-detail-badge/position-detail-badge';

export interface CombinedEntityFilters {
  sourceNames: SourceName[];
  statuses: CombinedEntityStatus[];
  customBadgeIds: string[];
  parentIds: string[];
  includeTeamsWithoutLeague: boolean;
  tiers: number[];
  includeLeaguesWithoutTier: boolean;
  countries: string[];
  nationalities: string[];
  positions: PlayerPosition[];
  positionDetails: PlayerPositionDetail[];
  feet: PlayerFoot[];
}

export interface CombinedEntityFilterDrawerData {
  entity: CombinedEntityKind;
  filters: CombinedEntityFilters;
  options: Signal<CombinedEntityFilterOptions | undefined>;
  loading: Signal<boolean>;
  error: Signal<string>;
  retry: () => void;
}

const footLabels: Record<PlayerFoot, string> = {
  LEFT: 'Left',
  RIGHT: 'Right',
};

const statusOptions = combinedEntityStatuses.map((value) => ({
  value,
  label: combinedEntityStatusDetails[value].label,
}));

export const emptyCombinedEntityFilters = (): CombinedEntityFilters => ({
  sourceNames: [],
  statuses: [],
  customBadgeIds: [],
  parentIds: [],
  includeTeamsWithoutLeague: false,
  tiers: [],
  includeLeaguesWithoutTier: false,
  countries: [],
  nationalities: [],
  positions: [],
  positionDetails: [],
  feet: [],
});

export const copyCombinedEntityFilters = (
  filters: CombinedEntityFilters,
): CombinedEntityFilters => ({
  sourceNames: [...filters.sourceNames],
  statuses: [...filters.statuses],
  customBadgeIds: [...filters.customBadgeIds],
  parentIds: [...filters.parentIds],
  includeTeamsWithoutLeague: filters.includeTeamsWithoutLeague,
  tiers: [...filters.tiers],
  includeLeaguesWithoutTier: filters.includeLeaguesWithoutTier,
  countries: [...filters.countries],
  nationalities: [...filters.nationalities],
  positions: [...filters.positions],
  positionDetails: [...filters.positionDetails],
  feet: [...filters.feet],
});

@Component({
  selector: 'app-combined-entity-filter-drawer',
  imports: [
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    CountryFlag,
    CustomBadgeView,
    PositionBadge,
    PositionDetailBadge,
  ],
  templateUrl: './combined-entity-filter-drawer.html',
  styleUrl: './combined-entity-filter-drawer.css',
})
export class CombinedEntityFilterDrawer {
  protected readonly data = inject<CombinedEntityFilterDrawerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<CombinedEntityFilterDrawer, CombinedEntityFilters>,
  );
  protected readonly filtersModel = signal(copyCombinedEntityFilters(this.data.filters));
  protected readonly dynamicControlsDisabled = computed(
    () => this.data.loading() || Boolean(this.data.error()) || !this.data.options(),
  );
  protected readonly filtersForm = form(this.filtersModel, (path) => {
    disabled(path.parentIds, { when: () => this.dynamicControlsDisabled() });
    disabled(path.includeTeamsWithoutLeague, {
      when: () => this.dynamicControlsDisabled(),
    });
    disabled(path.tiers, { when: () => this.dynamicControlsDisabled() });
    disabled(path.includeLeaguesWithoutTier, {
      when: () => this.dynamicControlsDisabled(),
    });
    disabled(path.countries, { when: () => this.dynamicControlsDisabled() });
    disabled(path.nationalities, { when: () => this.dynamicControlsDisabled() });
    disabled(path.positions, { when: () => this.dynamicControlsDisabled() });
    disabled(path.positionDetails, { when: () => this.dynamicControlsDisabled() });
    disabled(path.feet, { when: () => this.dynamicControlsDisabled() });
  });
  protected readonly sourceNames = sourceNames;
  protected readonly sourceLabels = sourceLabels;
  protected readonly statusOptions = statusOptions;
  protected readonly selectedStatuses = computed(() => {
    const selected = new Set(this.filtersModel().statuses);
    return statusOptions.filter(({ value }) => selected.has(value));
  });
  protected readonly customBadgeOptions = computed(() => this.data.options()?.customBadges ?? []);
  protected readonly selectedCustomBadges = computed(() => {
    const selected = new Set(this.filtersModel().customBadgeIds);
    return this.customBadgeOptions().filter(({ id }) => selected.has(id));
  });
  protected readonly selectedBadgeValues = computed(() => [
    ...this.filtersModel().statuses,
    ...this.filtersModel().customBadgeIds,
  ]);
  protected readonly parentSearch = signal('');
  protected readonly countrySearch = signal('');
  protected readonly nationalitySearch = signal('');
  protected readonly parentDetails = computed(() =>
    this.data.entity === 'teams'
      ? {
          label: 'Leagues',
          selectedLabel: 'Selected project leagues',
          inputLabel: 'Filter project teams by project leagues',
          placeholder: 'Search project leagues',
          emptyLabel: 'No matching project leagues',
        }
      : {
          label: 'Teams',
          selectedLabel: 'Selected project teams',
          inputLabel: 'Filter project players by project teams',
          placeholder: 'Search project teams',
          emptyLabel: 'No matching project teams',
        },
  );
  protected readonly parentOptions = computed<EntityFilterOption[]>(() => {
    const options = this.data.options();
    if (options?.entity === 'teams') return options.leagues;
    if (options?.entity === 'players') return options.teams;
    return [];
  });
  protected readonly selectedParentOptions = computed(() => {
    const selectedIds = new Set(this.filtersModel().parentIds);
    return this.parentOptions().filter(({ id }) => selectedIds.has(id));
  });
  protected readonly filteredParentOptions = computed(() => {
    const selectedIds = new Set(this.filtersModel().parentIds);
    const search = this.normalizedSearch(this.parentSearch());
    return this.parentOptions().filter(
      ({ id, name }) => !selectedIds.has(id) && this.matchesSearch(name, search),
    );
  });
  protected readonly countryOptions = computed<CountryFilterOption[]>(() => {
    const options = this.data.options();
    return options?.entity === 'leagues' || options?.entity === 'teams' ? options.countries : [];
  });
  protected readonly selectedCountryOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().countries);
    return this.countryOptions().filter(({ name }) => selectedNames.has(name));
  });
  protected readonly filteredCountryOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().countries);
    const search = this.normalizedSearch(this.countrySearch());
    return this.countryOptions().filter(
      ({ name }) => !selectedNames.has(name) && this.matchesSearch(name, search),
    );
  });
  protected readonly nationalityOptions = computed<NationalityFilterOption[]>(() => {
    const options = this.data.options();
    return options?.entity === 'players' ? options.nationalities : [];
  });
  protected readonly selectedNationalityOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().nationalities);
    return this.nationalityOptions().filter(({ name }) => selectedNames.has(name));
  });
  protected readonly filteredNationalityOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().nationalities);
    const search = this.normalizedSearch(this.nationalitySearch());
    return this.nationalityOptions().filter(
      ({ name }) => !selectedNames.has(name) && this.matchesSearch(name, search),
    );
  });
  protected readonly tierOptions = computed(() => {
    const options = this.data.options();
    return options?.entity === 'leagues' ? options.tiers : [];
  });
  protected readonly hasNoTierOption = computed(() => {
    const options = this.data.options();
    return options?.entity === 'leagues' && options.hasLeaguesWithoutTier;
  });
  protected readonly hasNoLeagueOption = computed(() => {
    const options = this.data.options();
    return options?.entity === 'teams' && options.hasTeamsWithoutLeague;
  });
  protected readonly positionOptions = computed(() => {
    const options = this.data.options();
    return options?.entity === 'players' ? options.positions : [];
  });
  protected readonly positionDetailOptions = computed(() => {
    const options = this.data.options();
    return options?.entity === 'players' ? options.positionDetails : [];
  });
  protected readonly footOptions = computed(() => {
    const options = this.data.options();
    return options?.entity === 'players' ? options.feet : [];
  });

  protected clearAll(): void {
    this.filtersModel.set(emptyCombinedEntityFilters());
    this.clearSearches();
  }

  protected setSourceNames(selectedSourceNames: SourceName[]): void {
    this.filtersModel.update((filters) => ({
      ...filters,
      sourceNames: [...selectedSourceNames],
    }));
  }

  protected setSelectedBadges(event: MatSelectChange): void {
    const values = Array.isArray(event.value)
      ? event.value.filter((value): value is string => typeof value === 'string')
      : [];
    const statuses = values.filter((value): value is CombinedEntityStatus =>
      statusOptions.some((status) => status.value === value),
    );
    const customBadgeIds = new Set(this.customBadgeOptions().map(({ id }) => id));
    this.filtersModel.update((filters) => ({
      ...filters,
      statuses,
      customBadgeIds: values.filter((value) => customBadgeIds.has(value)),
    }));
  }

  protected selectParent(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as EntityFilterOption;
    this.filtersModel.update((filters) =>
      filters.parentIds.includes(option.id)
        ? filters
        : { ...filters, parentIds: [...filters.parentIds, option.id] },
    );
    this.parentSearch.set('');
  }

  protected removeParent(id: string): void {
    this.filtersModel.update((filters) => ({
      ...filters,
      parentIds: filters.parentIds.filter((selectedId) => selectedId !== id),
    }));
  }

  protected selectCountry(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as CountryFilterOption;
    this.filtersModel.update((filters) =>
      filters.countries.includes(option.name)
        ? filters
        : { ...filters, countries: [...filters.countries, option.name] },
    );
    this.countrySearch.set('');
  }

  protected removeCountry(name: string): void {
    this.filtersModel.update((filters) => ({
      ...filters,
      countries: filters.countries.filter((selectedName) => selectedName !== name),
    }));
  }

  protected selectNationality(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as NationalityFilterOption;
    this.filtersModel.update((filters) =>
      filters.nationalities.includes(option.name)
        ? filters
        : { ...filters, nationalities: [...filters.nationalities, option.name] },
    );
    this.nationalitySearch.set('');
  }

  protected removeNationality(name: string): void {
    this.filtersModel.update((filters) => ({
      ...filters,
      nationalities: filters.nationalities.filter((selectedName) => selectedName !== name),
    }));
  }

  protected positionLabel(position: PlayerPosition): string {
    return positionBadgeDetails[position].label;
  }

  protected footLabel(foot: PlayerFoot): string {
    return footLabels[foot];
  }

  protected apply(): void {
    if (this.dynamicControlsDisabled()) {
      this.dialogRef.close(copyCombinedEntityFilters(this.filtersModel()));
      return;
    }
    void submit(this.filtersForm, async () => {
      await Promise.resolve();
      this.dialogRef.close(copyCombinedEntityFilters(this.filtersModel()));
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private clearSearches(): void {
    this.parentSearch.set('');
    this.countrySearch.set('');
    this.nationalitySearch.set('');
  }

  private normalizedSearch(value: string): string {
    return value.trim().toLocaleLowerCase();
  }

  private matchesSearch(value: string, search: string): boolean {
    return !search || value.toLocaleLowerCase().includes(search);
  }
}
