import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import type { EntityKind } from '../../../../../shared/downloader/contracts';
import { PageHeader } from '../../../shared/page-header/page-header';
import type { ColumnPreference } from '../../project/entity-column-editor/column-layout';
import { EntityColumnEditor } from '../../project/entity-column-editor/entity-column-editor';
import { EntityColumnPreferences } from '../../project/entity-table-page/entity-column-preferences';
import {
  columnsByEntity,
  defaultColumnPreference,
} from '../../project/entity-table-page/entity-table-columns';

const entityKinds = ['leagues', 'teams', 'players'] as const satisfies readonly EntityKind[];

@Component({
  selector: 'app-column-settings-page',
  imports: [
    EntityColumnEditor,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
  ],
  templateUrl: './column-settings-page.html',
  styleUrl: './column-settings-page.css',
})
export class ColumnSettingsPage {
  private readonly columnPreferences = inject(EntityColumnPreferences);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly entities = entityKinds;
  protected readonly columns = columnsByEntity;
  protected readonly defaultPreference = defaultColumnPreference;
  protected readonly entityLabels: Record<EntityKind, string> = {
    leagues: 'Leagues',
    teams: 'Teams',
    players: 'Players',
  };
  protected readonly entitySingularLabels: Record<EntityKind, string> = {
    leagues: 'league',
    teams: 'team',
    players: 'player',
  };
  protected readonly layouts = {
    leagues: signal<ColumnPreference>(this.columnPreferences.load('leagues')),
    teams: signal<ColumnPreference>(this.columnPreferences.load('teams')),
    players: signal<ColumnPreference>(this.columnPreferences.load('players')),
  };

  protected save(entity: EntityKind, preference: ColumnPreference): void {
    this.layouts[entity].set(preference);
    this.columnPreferences.save(entity, preference);
  }

  protected reset(entity: EntityKind): void {
    if (!this.columnPreferences.reset(entity)) {
      this.snackBar.open(
        `${this.entityLabels[entity]} column layout could not be reset.`,
        'Dismiss',
        {
          duration: 6000,
        },
      );
      return;
    }
    this.layouts[entity].set(defaultColumnPreference(entity));
    this.snackBar.open(`${this.entityLabels[entity]} column layout reset.`, 'Dismiss', {
      duration: 3000,
    });
  }

  protected resetAll(): void {
    if (!this.columnPreferences.resetAll()) {
      this.snackBar.open('Finder column layouts could not be reset.', 'Dismiss', {
        duration: 6000,
      });
      return;
    }
    for (const entity of this.entities) {
      this.layouts[entity].set(defaultColumnPreference(entity));
    }
    this.snackBar.open('Finder column layouts reset.', 'Dismiss', { duration: 3000 });
  }
}
