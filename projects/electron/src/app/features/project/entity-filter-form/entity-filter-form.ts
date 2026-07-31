import { Component, computed, effect, input, output, signal } from '@angular/core';
import { disabled, form, FormField, submit } from '@angular/forms/signals';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule, type MatSelectChange } from '@angular/material/select';
import type {
  CountryFilterOption,
  EntityFilterOption,
  EntityFilterOptions,
  EntityKind,
  NationalityFilterOption,
  PlayerFoot,
  PlayerPosition,
  PlayerPositionDetail,
  SourceName,
} from '../../../../../shared/downloader/contracts';
import type { CustomBadge } from '../../../../../shared/downloader/custom-badge';
import { sourceLabels } from '../../../../../shared/downloader/contracts';
import { entityStatuses, type EntityStatus } from '../../../../../shared/downloader/entity-status';
import { CountryFlag } from '../../../shared/country-flag/country-flag';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import {
  EntityStatusBadge,
  entityStatusDetails,
} from '../../../shared/entity-status-badge/entity-status-badge';
import { PositionBadge, positionBadgeDetails } from '../../../shared/position-badge/position-badge';
import { PositionDetailBadge } from '../../../shared/position-detail-badge/position-detail-badge';

export interface EntityFilters {
  sourceNames: SourceName[];
  statuses: EntityStatus[];
  customBadgeIds: string[];
  parentIds: string[];
  includeTeamsWithoutLeague: boolean;
  tiers: number[];
  includeLeaguesWithoutTier: boolean;
  seasons: string[];
  countries: string[];
  nationalities: string[];
  positions: PlayerPosition[];
  positionDetails: PlayerPositionDetail[];
  feet: PlayerFoot[];
}

const footLabels: Record<PlayerFoot, string> = {
  LEFT: 'Left',
  RIGHT: 'Right',
};

export const emptyEntityFilters = (): EntityFilters => ({
  sourceNames: [],
  statuses: [],
  customBadgeIds: [],
  parentIds: [],
  includeTeamsWithoutLeague: false,
  tiers: [],
  includeLeaguesWithoutTier: false,
  seasons: [],
  countries: [],
  nationalities: [],
  positions: [],
  positionDetails: [],
  feet: [],
});

export const copyEntityFilters = (filters: EntityFilters): EntityFilters => ({
  sourceNames: [...filters.sourceNames],
  statuses: [...filters.statuses],
  customBadgeIds: [...filters.customBadgeIds],
  parentIds: [...filters.parentIds],
  includeTeamsWithoutLeague: filters.includeTeamsWithoutLeague,
  tiers: [...filters.tiers],
  includeLeaguesWithoutTier: filters.includeLeaguesWithoutTier,
  seasons: [...filters.seasons],
  countries: [...filters.countries],
  nationalities: [...filters.nationalities],
  positions: [...filters.positions],
  positionDetails: [...filters.positionDetails],
  feet: [...filters.feet],
});

@Component({
  selector: 'app-entity-filter-form',
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
    EntityStatusBadge,
    PositionBadge,
    PositionDetailBadge,
  ],
  templateUrl: './entity-filter-form.html',
  styleUrl: './entity-filter-form.css',
})
export class EntityFilterForm {
  readonly entity = input.required<EntityKind>();
  readonly initialFilters = input<EntityFilters>(emptyEntityFilters());
  readonly options = input<EntityFilterOptions>();
  readonly loading = input(false);
  readonly error = input('');
  readonly filtersApplied = output<EntityFilters>();
  readonly cancelled = output();
  readonly retryRequested = output();

  private readonly filtersModel = signal<EntityFilters>(emptyEntityFilters());
  protected readonly parentSearch = signal('');
  protected readonly countrySearch = signal('');
  protected readonly nationalitySearch = signal('');
  protected readonly controlsDisabled = computed(
    () => this.loading() || Boolean(this.error()) || !this.options(),
  );
  protected readonly filtersForm = form(this.filtersModel, (path) => {
    disabled(path.sourceNames, { when: () => this.controlsDisabled() });
    disabled(path.statuses, { when: () => this.controlsDisabled() });
    disabled(path.customBadgeIds, { when: () => this.controlsDisabled() });
    disabled(path.parentIds, { when: () => this.controlsDisabled() });
    disabled(path.includeTeamsWithoutLeague, { when: () => this.controlsDisabled() });
    disabled(path.tiers, { when: () => this.controlsDisabled() });
    disabled(path.includeLeaguesWithoutTier, { when: () => this.controlsDisabled() });
    disabled(path.seasons, { when: () => this.controlsDisabled() });
    disabled(path.countries, { when: () => this.controlsDisabled() });
    disabled(path.nationalities, { when: () => this.controlsDisabled() });
    disabled(path.positions, { when: () => this.controlsDisabled() });
    disabled(path.positionDetails, { when: () => this.controlsDisabled() });
    disabled(path.feet, { when: () => this.controlsDisabled() });
  });
  protected readonly parentOptions = computed(() => {
    const options = this.options();
    if (options?.entity === 'teams') return options.leagues;
    if (options?.entity === 'players') return options.teams;
    return [];
  });
  protected readonly parentFilterDetails = computed(() =>
    this.entity() === 'teams'
      ? {
          label: 'Leagues',
          selectedAriaLabel: 'Selected leagues',
          inputAriaLabel: 'Filter teams by leagues',
          placeholder: 'Search leagues',
          emptyLabel: 'No matching leagues',
        }
      : {
          label: 'Teams',
          selectedAriaLabel: 'Selected teams',
          inputAriaLabel: 'Filter players by teams',
          placeholder: 'Search teams',
          emptyLabel: 'No matching teams',
        },
  );
  protected readonly selectedParentOptions = computed(() => {
    const selectedIds = new Set(this.filtersModel().parentIds);
    return this.parentOptions().filter((option) => selectedIds.has(option.id));
  });
  protected readonly filteredParentOptions = computed(() => {
    const selectedIds = new Set(this.filtersModel().parentIds);
    const search = this.normalizedSearch(this.parentSearch());
    return this.parentOptions().filter(
      (option) => !selectedIds.has(option.id) && this.matchesSearch(option.name, search),
    );
  });
  protected readonly seasonOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'leagues' || options?.entity === 'teams' ? options.seasons : [];
  });
  protected readonly tierOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'leagues' ? (options.tiers ?? []) : [];
  });
  protected readonly hasNoTierOption = computed(() => {
    const options = this.options();
    return options?.entity === 'leagues' && options.hasLeaguesWithoutTier;
  });
  protected readonly sourceOptions = computed(() => this.options()?.sourceNames ?? []);
  protected readonly statusOptions = entityStatuses;
  protected readonly selectedStatuses = computed(() => this.filtersModel().statuses);
  protected readonly customBadgeOptions = computed(() => this.options()?.customBadges ?? []);
  protected readonly selectedCustomBadges = computed(() => {
    const selectedIds = new Set(this.filtersModel().customBadgeIds);
    return this.customBadgeOptions().filter(({ id }) => selectedIds.has(id));
  });
  protected readonly selectedBadgeValues = computed(() => [
    ...this.filtersModel().statuses,
    ...this.filtersModel().customBadgeIds,
  ]);
  protected readonly countryOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'leagues' || options?.entity === 'teams' ? options.countries : [];
  });
  protected readonly selectedCountryOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().countries);
    return this.countryOptions().filter((option) => selectedNames.has(option.name));
  });
  protected readonly filteredCountryOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().countries);
    const search = this.normalizedSearch(this.countrySearch());
    return this.countryOptions().filter(
      (option) => !selectedNames.has(option.name) && this.matchesSearch(option.name, search),
    );
  });
  protected readonly nationalityOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'players' ? options.nationalities : [];
  });
  protected readonly selectedNationalityOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().nationalities);
    return this.nationalityOptions().filter((option) => selectedNames.has(option.name));
  });
  protected readonly filteredNationalityOptions = computed(() => {
    const selectedNames = new Set(this.filtersModel().nationalities);
    const search = this.normalizedSearch(this.nationalitySearch());
    return this.nationalityOptions().filter(
      (option) => !selectedNames.has(option.name) && this.matchesSearch(option.name, search),
    );
  });
  protected readonly positionOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'players' ? options.positions : [];
  });
  protected readonly selectedPositions = computed(() => this.filtersModel().positions);
  protected readonly positionDetailOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'players' ? options.positionDetails : [];
  });
  protected readonly selectedPositionDetails = computed(() => this.filtersModel().positionDetails);
  protected readonly footOptions = computed(() => {
    const options = this.options();
    return options?.entity === 'players' ? options.feet : [];
  });
  protected readonly hasNoLeagueOption = computed(() => {
    const options = this.options();
    return options?.entity === 'teams' && options.hasTeamsWithoutLeague;
  });

  constructor() {
    effect(() => this.reset(this.initialFilters()));
  }

  reset(filters: EntityFilters): void {
    this.filtersModel.set(copyEntityFilters(filters));
    this.clearSearches();
  }

  protected clearAll(): void {
    this.filtersModel.set(emptyEntityFilters());
    this.clearSearches();
  }

  protected setParentSearch(value: string): void {
    this.parentSearch.set(value);
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

  protected setCountrySearch(value: string): void {
    this.countrySearch.set(value);
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

  protected setNationalitySearch(value: string): void {
    this.nationalitySearch.set(value);
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

  protected applyFilters(): void {
    void submit(this.filtersForm, async () => {
      await Promise.resolve();
      this.filtersApplied.emit(copyEntityFilters(this.filtersModel()));
    });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected positionLabel(position: PlayerPosition): string {
    return positionBadgeDetails[position].label;
  }

  protected footLabel(foot: PlayerFoot): string {
    return footLabels[foot];
  }

  protected sourceLabel(sourceName: SourceName): string {
    return sourceLabels[sourceName];
  }

  protected statusLabel(status: EntityStatus): string {
    return entityStatusDetails[status].label;
  }

  protected customBadgeLabel(badge: CustomBadge): string {
    return badge.name;
  }

  protected setSelectedBadges(event: MatSelectChange): void {
    const values = Array.isArray(event.value)
      ? event.value.filter((value): value is string => typeof value === 'string')
      : [];
    const statuses = values.filter((value): value is EntityStatus =>
      entityStatuses.includes(value as EntityStatus),
    );
    const customBadgeIds = new Set(this.customBadgeOptions().map(({ id }) => id));
    this.filtersModel.update((filters) => ({
      ...filters,
      statuses,
      customBadgeIds: values.filter((value) => customBadgeIds.has(value)),
    }));
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
