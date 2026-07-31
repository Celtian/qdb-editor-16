import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, pattern, required, submit, validate } from '@angular/forms/signals';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  leagueTiers,
  sourceLabels,
  sourceSupportsSeason,
  type EditableEntityKind,
  type EntityFilterOption,
  type League,
  type Team,
} from '../../../../../shared/downloader/contracts';
import {
  findFootballCountryByName,
  footballCountries,
} from '../../../../../shared/downloader/football-countries';
import { CountryFlag } from '../../../shared/country-flag/country-flag';

export interface EditEntityDialogData {
  entity: League | Team;
  kind: EditableEntityKind;
  leagues: EntityFilterOption[];
}

export interface EditEntityValue {
  name: string;
  countryCode3: string;
  sourceId: string;
  season: string;
  leagueId: string;
  tier: number;
}

interface EditEntityModel {
  name: string;
  countryName: string;
  sourceId: string;
  season: string;
  leagueId: string;
  tier: number;
}

interface SourceUrlExample {
  label: string;
  url: string;
}

interface SourceUrlGuidance {
  examples: SourceUrlExample[];
  detail?: string;
}

@Component({
  selector: 'app-edit-entity-dialog',
  imports: [
    CountryFlag,
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './edit-entity-dialog.html',
  styleUrl: './edit-entity-dialog.css',
})
export class EditEntityDialog {
  protected readonly data = inject<EditEntityDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EditEntityDialog, EditEntityValue>);
  protected readonly availableLeagues = this.data.leagues.filter(
    (league) => league.sourceName === this.data.entity.sourceName,
  );
  protected readonly model = signal<EditEntityModel>({
    name: this.data.entity.name,
    countryName: this.data.entity.countryName ?? '',
    sourceId: this.data.entity.sourceId,
    season: sourceSupportsSeason[this.data.entity.sourceName]
      ? (this.data.entity.season ?? '')
      : '',
    leagueId: this.initialLeagueId(),
    tier: this.data.kind === 'leagues' ? ((this.data.entity as League).tier ?? 0) : 0,
  });
  protected readonly metadataForm = form(this.model, (path) => {
    required(path.name, { message: 'Name is required.' });
    validate(path.countryName, ({ value }) =>
      !value().trim() || findFootballCountryByName(value())
        ? undefined
        : {
            kind: 'country',
            message: 'Select a country from the list or leave it empty.',
          },
    );
    required(path.sourceId, { message: 'Source ID is required.' });
    validate(path.sourceId, ({ value }) => {
      const pattern = this.sourceIdPattern();
      return pattern.test(value())
        ? undefined
        : {
            kind: 'sourceId',
            message:
              this.data.entity.sourceName === 'soccerway'
                ? 'Use the Soccerway path shown in the example.'
                : this.data.entity.sourceName === 'worldfootball'
                  ? 'Use the WorldFootball path shown in the example.'
                  : this.data.entity.sourceName === 'eurofotbal'
                    ? 'Use the Eurofotbal path shown in the example.'
                    : 'Use letters, numbers, underscores, or hyphens.',
          };
    });
    pattern(path.season, /^(|\d{4})$/, { message: 'Use a four-digit season or leave it empty.' });
  });
  protected readonly sourceLabel = sourceLabels[this.data.entity.sourceName];
  protected readonly tierOptions = leagueTiers;
  protected readonly supportsSeason = sourceSupportsSeason[this.data.entity.sourceName];
  protected readonly sourceIdExample = this.sourceExample();
  protected readonly sourceUrlGuidance = this.createSourceUrlGuidance();
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

  protected save(): void {
    void submit(this.metadataForm, async () => {
      await Promise.resolve();
      const { countryName, ...value } = this.model();
      const country = findFootballCountryByName(countryName);
      this.dialogRef.close({
        ...value,
        name: value.name.trim(),
        countryCode3: country?.code3 ?? '',
        sourceId: value.sourceId.trim(),
        season: value.season.trim(),
      });
    });
  }

  private initialLeagueId(): string {
    if (this.data.kind !== 'teams') return '';
    const leagueId = (this.data.entity as Team).leagueId;
    return leagueId && this.availableLeagues.some((league) => league.id === leagueId)
      ? leagueId
      : '';
  }

  private sourceIdPattern(): RegExp {
    if (this.data.entity.sourceName === 'transfermarkt') return /^[a-zA-Z0-9_-]+$/;
    if (this.data.entity.sourceName === 'soccerway') {
      return this.data.kind === 'leagues'
        ? /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/standings\/[a-zA-Z0-9_-]+$/
        : /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;
    }
    if (this.data.entity.sourceName === 'eurofotbal') {
      return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;
    }
    return this.data.kind === 'leagues' ? /^co\d+\/[a-zA-Z0-9_-]+$/ : /^te\d+\/[a-zA-Z0-9_-]+$/;
  }

  private sourceExample(): string {
    if (this.data.entity.sourceName === 'transfermarkt') {
      return this.data.kind === 'leagues' ? 'GB1' : '281';
    }
    if (this.data.entity.sourceName === 'soccerway') {
      return this.data.kind === 'leagues'
        ? 'czech-republic/chance-liga/standings/bNFMkskm'
        : 'slavia-prague/viXGgnyB';
    }
    if (this.data.entity.sourceName === 'eurofotbal') {
      return this.data.kind === 'leagues' ? 'chance-liga/2026-2027' : 'cesko/sparta-praha';
    }
    return this.data.kind === 'leagues'
      ? 'co7093/mexico-lp---serie-b'
      : 'te237557/artesanos-metepec';
  }

  private createSourceUrlGuidance(): SourceUrlGuidance {
    if (this.data.entity.sourceName === 'transfermarkt') {
      return this.data.kind === 'leagues'
        ? {
            examples: [
              {
                label: 'League page',
                url: 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1',
              },
            ],
            detail: 'Season 2026 adds /plus?saison_id=2026.',
          }
        : {
            examples: [
              {
                label: 'Team page',
                url: 'https://www.transfermarkt.com/slug/kader/verein/281/plus/1',
              },
            ],
            detail: 'Season 2026 adds ?saison_id=2026.',
          };
    }
    if (this.data.entity.sourceName === 'soccerway') {
      return this.data.kind === 'leagues'
        ? {
            examples: [
              {
                label: 'League page',
                url: 'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
              },
            ],
          }
        : {
            examples: [
              {
                label: 'Team page',
                url: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
              },
              {
                label: 'Player page',
                url: 'https://www.soccerway.com/player/kolar-ondrej/xfBGcS1U/',
              },
            ],
          };
    }
    if (this.data.entity.sourceName === 'eurofotbal') {
      return this.data.kind === 'leagues'
        ? {
            examples: [
              {
                label: 'League page',
                url: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
              },
            ],
          }
        : {
            examples: [
              {
                label: 'Team page',
                url: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
              },
            ],
            detail: 'Eurofotbal player source pages are not available.',
          };
    }
    return this.data.kind === 'leagues'
      ? {
          examples: [
            {
              label: 'League page',
              url: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
            },
          ],
        }
      : {
          examples: [
            {
              label: 'Team page',
              url: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
            },
            {
              label: 'Player page',
              url: 'https://www.worldfootball.net/person/pe599828/oscar-altamirano/',
            },
          ],
        };
  }
}
