import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  findFootballCountryByCode3,
  findFootballCountryByName,
  footballCountries,
} from '../../../../../shared/downloader/football-countries';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';
import { CountryFlag } from '../../../shared/country-flag/country-flag';

export interface ChangeLeagueCountryDialogData {
  entity: 'leagues' | 'teams';
  entityCount: number;
  countryCode3?: string;
  mixedCountries: boolean;
}

@Component({
  selector: 'app-change-league-country-dialog',
  imports: [
    CountryFlag,
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './change-league-country-dialog.html',
  styleUrl: './change-league-country-dialog.css',
})
export class ChangeLeagueCountryDialog {
  protected readonly data = inject<ChangeLeagueCountryDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ChangeLeagueCountryDialog, string | null>);
  protected readonly entitySingular = this.data.entity === 'leagues' ? 'league' : 'team';
  protected readonly entityLabel = formatUiCount(
    this.data.entityCount,
    this.entitySingular,
    this.data.entity,
  );
  protected readonly model = signal({
    countryName: findFootballCountryByCode3(this.data.countryCode3 ?? '')?.name ?? '',
  });
  protected readonly countryForm = form(this.model, (path) => {
    validate(path.countryName, ({ value }) =>
      !value().trim() || findFootballCountryByName(value())
        ? undefined
        : {
            kind: 'country',
            message: 'Select a country from the list or leave it empty.',
          },
    );
  });
  protected readonly selectedCountry = computed(() =>
    findFootballCountryByName(this.model().countryName),
  );
  protected readonly filteredCountries = computed(() => {
    const search = this.model().countryName.trim().toLocaleLowerCase('en');
    if (!search) return footballCountries;
    return footballCountries.filter(
      ({ name, code2, code3 }) =>
        name.toLocaleLowerCase('en').includes(search) ||
        code2.toLocaleLowerCase('en').includes(search) ||
        code3.toLocaleLowerCase('en').includes(search),
    );
  });
  protected readonly actionLabel = computed(() =>
    this.model().countryName.trim() ? 'Apply country' : 'Clear country',
  );

  protected save(): void {
    void submit(this.countryForm, async () => {
      await Promise.resolve();
      const countryName = this.model().countryName.trim();
      const country = findFootballCountryByName(countryName);
      this.dialogRef.close(country?.code3 ?? null);
    });
  }
}
