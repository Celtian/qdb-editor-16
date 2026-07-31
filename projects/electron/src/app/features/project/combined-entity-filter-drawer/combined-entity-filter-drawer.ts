import { Component, computed, inject, signal, type Signal } from '@angular/core';
import { disabled, form, FormField, submit } from '@angular/forms/signals';
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
import { MatSelectModule, type MatSelectChange } from '@angular/material/select';
import {
  sourceLabels,
  sourceNames,
  type CombinedEntityFilterOptions,
  type CombinedEntityKind,
  type CountryFilterOption,
  type EntityFilterOption,
  type NationalityFilterOption,
  type PlayerFoot,
  type PlayerPosition,
  type PlayerPositionDetail,
  type SourceName,
} from '../../../../../shared/downloader/contracts';
import {
  combinedEntityStatuses,
  combinedEntityStatusDetails,
  type CombinedEntityStatus,
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
  template: `
    <form
      class="filter-form"
      aria-labelledby="combined-entity-filter-title"
      [attr.aria-busy]="data.loading()"
      (submit)="apply(); $event.preventDefault()"
    >
      <header>
        <h2 id="combined-entity-filter-title">Filters</h2>
        <button matIconButton type="button" aria-label="Close filters" (click)="cancel()">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      @if (data.loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading project filter options" />
      }
      @if (data.error()) {
        <div class="filter-error" role="alert">
          <p>Additional filters could not be loaded: {{ data.error() }}</p>
          <button matButton type="button" (click)="data.retry()">Retry</button>
        </div>
      }

      <div class="filter-fields">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Linked providers</mat-label>
          <mat-select
            multiple
            [aria-label]="'Filter project ' + data.entity + ' by linked providers'"
            [value]="filtersModel().sourceNames"
            (selectionChange)="setSourceNames($event.value)"
          >
            @for (sourceName of sourceNames; track sourceName) {
              <mat-option [value]="sourceName">{{ sourceLabels[sourceName] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Badges</mat-label>
          <mat-select
            multiple
            [aria-label]="'Filter project ' + data.entity + ' by badges'"
            [value]="selectedBadgeValues()"
            (selectionChange)="setSelectedBadges($event)"
          >
            <mat-select-trigger>
              <span class="filter-badges">
                @for (status of selectedStatuses(); track status.value) {
                  <span class="combined-status-option">{{ status.label }}</span>
                }
                @for (badge of selectedCustomBadges(); track badge.id) {
                  <app-custom-badge [badge]="badge" />
                }
              </span>
            </mat-select-trigger>
            <mat-optgroup label="Status">
              @for (status of statusOptions; track status.value) {
                <mat-option [value]="status.value">{{ status.label }}</mat-option>
              }
            </mat-optgroup>
            @if (customBadgeOptions().length) {
              <mat-optgroup label="Custom">
                @for (badge of customBadgeOptions(); track badge.id) {
                  <mat-option [value]="badge.id" [attr.aria-label]="badge.name">
                    <app-custom-badge aria-hidden="true" [badge]="badge" />
                  </mat-option>
                }
              </mat-optgroup>
            }
          </mat-select>
        </mat-form-field>

        @if (data.entity === 'leagues' || data.entity === 'teams') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Countries</mat-label>
            <mat-chip-grid
              #countryChipGrid
              class="country-chip-grid"
              [attr.aria-label]="selectedCountryOptions().length ? 'Selected countries' : null"
              [disabled]="dynamicControlsDisabled()"
            >
              @for (country of selectedCountryOptions(); track country.name) {
                <mat-chip-row (removed)="removeCountry(country.name)">
                  <span class="country-option">
                    @if (country.code) {
                      <app-country-flag decorative [code]="country.code" />
                    }
                    <span>{{ country.name }}</span>
                  </span>
                  <button matChipRemove type="button" [attr.aria-label]="'Remove ' + country.name">
                    <mat-icon aria-hidden="true">cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              #countryInput
              matInput
              type="search"
              autocomplete="off"
              [attr.aria-label]="'Filter project ' + data.entity + ' by countries'"
              placeholder="Search countries"
              [disabled]="dynamicControlsDisabled()"
              [value]="countrySearch()"
              [matChipInputFor]="countryChipGrid"
              [matAutocomplete]="countryAutocomplete"
              (input)="countrySearch.set(countryInput.value)"
            />
            <mat-autocomplete
              #countryAutocomplete="matAutocomplete"
              (optionSelected)="selectCountry($event)"
            >
              @for (country of filteredCountryOptions(); track country.name) {
                <mat-option [value]="country">
                  <span class="country-option">
                    @if (country.code) {
                      <app-country-flag decorative [code]="country.code" />
                    }
                    <span>{{ country.name }}</span>
                  </span>
                </mat-option>
              } @empty {
                <mat-option disabled>No matching countries</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        }

        @if (data.entity === 'leagues') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Tiers</mat-label>
            <mat-select
              multiple
              aria-label="Filter project leagues by tiers"
              [formField]="filtersForm.tiers"
            >
              @for (tier of tierOptions(); track tier) {
                <mat-option [value]="tier">Tier {{ tier }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (hasNoTierOption()) {
            <mat-checkbox [formField]="filtersForm.includeLeaguesWithoutTier">
              Include leagues without a tier
            </mat-checkbox>
          }
        }

        @if (data.entity === 'teams' || data.entity === 'players') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ parentDetails().label }}</mat-label>
            <mat-chip-grid
              #parentChipGrid
              class="parent-chip-grid"
              [attr.aria-label]="
                selectedParentOptions().length ? parentDetails().selectedLabel : null
              "
              [disabled]="dynamicControlsDisabled()"
            >
              @for (option of selectedParentOptions(); track option.id) {
                <mat-chip-row (removed)="removeParent(option.id)">
                  {{ option.name }}
                  <button matChipRemove type="button" [attr.aria-label]="'Remove ' + option.name">
                    <mat-icon aria-hidden="true">cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              #parentInput
              matInput
              type="search"
              autocomplete="off"
              [attr.aria-label]="parentDetails().inputLabel"
              [placeholder]="parentDetails().placeholder"
              [disabled]="dynamicControlsDisabled()"
              [value]="parentSearch()"
              [matChipInputFor]="parentChipGrid"
              [matAutocomplete]="parentAutocomplete"
              (input)="parentSearch.set(parentInput.value)"
            />
            <mat-autocomplete
              #parentAutocomplete="matAutocomplete"
              (optionSelected)="selectParent($event)"
            >
              @for (option of filteredParentOptions(); track option.id) {
                <mat-option [value]="option">{{ option.name }}</mat-option>
              } @empty {
                <mat-option disabled>{{ parentDetails().emptyLabel }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          @if (data.entity === 'teams' && hasNoLeagueOption()) {
            <mat-checkbox [formField]="filtersForm.includeTeamsWithoutLeague">
              Include teams without a league
            </mat-checkbox>
          }
        }

        @if (data.entity === 'players') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Nationalities</mat-label>
            <mat-chip-grid
              #nationalityChipGrid
              class="nationality-chip-grid"
              [attr.aria-label]="
                selectedNationalityOptions().length ? 'Selected nationalities' : null
              "
              [disabled]="dynamicControlsDisabled()"
            >
              @for (nationality of selectedNationalityOptions(); track nationality.name) {
                <mat-chip-row (removed)="removeNationality(nationality.name)">
                  <span class="country-option">
                    @if (nationality.code) {
                      <app-country-flag decorative [code]="nationality.code" />
                    }
                    <span>{{ nationality.name }}</span>
                  </span>
                  <button
                    matChipRemove
                    type="button"
                    [attr.aria-label]="'Remove ' + nationality.name"
                  >
                    <mat-icon aria-hidden="true">cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              #nationalityInput
              matInput
              type="search"
              autocomplete="off"
              aria-label="Filter project players by nationalities"
              placeholder="Search nationalities"
              [disabled]="dynamicControlsDisabled()"
              [value]="nationalitySearch()"
              [matChipInputFor]="nationalityChipGrid"
              [matAutocomplete]="nationalityAutocomplete"
              (input)="nationalitySearch.set(nationalityInput.value)"
            />
            <mat-autocomplete
              #nationalityAutocomplete="matAutocomplete"
              (optionSelected)="selectNationality($event)"
            >
              @for (nationality of filteredNationalityOptions(); track nationality.name) {
                <mat-option [value]="nationality">
                  <span class="country-option">
                    @if (nationality.code) {
                      <app-country-flag decorative [code]="nationality.code" />
                    }
                    <span>{{ nationality.name }}</span>
                  </span>
                </mat-option>
              } @empty {
                <mat-option disabled>No matching nationalities</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Positions</mat-label>
            <mat-select
              multiple
              aria-label="Filter project players by positions"
              [formField]="filtersForm.positions"
            >
              <mat-select-trigger>
                <span class="position-badges">
                  @for (position of filtersModel().positions; track position) {
                    <app-position-badge [position]="position" />
                  }
                </span>
              </mat-select-trigger>
              @for (position of positionOptions(); track position) {
                <mat-option [value]="position" [attr.aria-label]="positionLabel(position)">
                  <app-position-badge aria-hidden="true" [position]="position" />
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Position details</mat-label>
            <mat-select
              multiple
              aria-label="Filter project players by position details"
              [formField]="filtersForm.positionDetails"
            >
              <mat-select-trigger>
                <span class="position-badges">
                  @for (positionDetail of filtersModel().positionDetails; track positionDetail) {
                    <app-position-detail-badge [positionDetail]="positionDetail" />
                  }
                </span>
              </mat-select-trigger>
              @for (positionDetail of positionDetailOptions(); track positionDetail) {
                <mat-option [value]="positionDetail" [attr.aria-label]="positionDetail">
                  <app-position-detail-badge aria-hidden="true" [positionDetail]="positionDetail" />
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Preferred foot</mat-label>
            <mat-select
              multiple
              aria-label="Filter project players by preferred foot"
              [formField]="filtersForm.feet"
            >
              @for (foot of footOptions(); track foot) {
                <mat-option [value]="foot">{{ footLabel(foot) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>

      <footer>
        <button matButton type="button" (click)="clearAll()">Clear all</button>
        <span></span>
        <button matButton type="button" (click)="cancel()">Cancel</button>
        <button matButton="filled" type="submit">Apply</button>
      </footer>
    </form>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .filter-form {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      width: 100%;
    }
    header {
      align-items: center;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 1rem;
    }
    h2,
    p {
      margin: 0;
    }
    h2 {
      font-size: 1.25rem;
    }
    .filter-error {
      align-items: center;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      padding: 0.75rem 1rem;
    }
    .filter-fields {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1rem;
      overflow: auto;
      padding: 1.25rem 1rem;
    }
    mat-form-field {
      width: 100%;
    }
    .country-option {
      align-items: center;
      display: inline-flex;
      gap: 0.5rem;
    }
    .filter-badges,
    .position-badges {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .combined-status-option {
      background: var(--mat-sys-tertiary-container);
      border-radius: 999px;
      color: var(--mat-sys-on-tertiary-container);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
    }
    footer {
      align-items: center;
      border-top: 1px solid var(--mat-sys-outline-variant);
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
    }
    footer span {
      flex: 1;
    }
  `,
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
