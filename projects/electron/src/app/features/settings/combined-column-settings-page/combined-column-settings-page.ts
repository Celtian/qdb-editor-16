import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import type { CombinedEntityKind } from '../../../../../shared/downloader/contracts';
import { PageHeader } from '../../../shared/page-header/page-header';
import { CombinedEntityColumnPreferences } from '../../project/combined-entity-page/combined-entity-column-preferences';
import {
  combinedColumnsByEntity,
  defaultCombinedColumnPreference,
} from '../../project/combined-entity-page/combined-entity-columns';
import type { ColumnPreference } from '../../project/entity-column-editor/column-layout';
import { EntityColumnEditor } from '../../project/entity-column-editor/entity-column-editor';

const entityKinds = [
  'leagues',
  'teams',
  'players',
] as const satisfies readonly CombinedEntityKind[];

@Component({
  selector: 'app-combined-column-settings-page',
  imports: [
    EntityColumnEditor,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
  ],
  templateUrl: './combined-column-settings-page.html',
  styleUrl: '../column-settings-page/column-settings-page.css',
})
export class CombinedColumnSettingsPage {
  private readonly columnPreferences = inject(CombinedEntityColumnPreferences);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly entities = entityKinds;
  protected readonly columns = combinedColumnsByEntity;
  protected readonly defaultPreference = defaultCombinedColumnPreference;
  protected readonly entityLabels: Record<CombinedEntityKind, string> = {
    leagues: 'Leagues',
    teams: 'Teams',
    players: 'Players',
  };
  protected readonly entitySingularLabels: Record<CombinedEntityKind, string> = {
    leagues: 'league',
    teams: 'team',
    players: 'player',
  };
  protected readonly layouts = {
    leagues: signal(this.columnPreferences.load('leagues')),
    teams: signal(this.columnPreferences.load('teams')),
    players: signal(this.columnPreferences.load('players')),
  };

  protected save(entity: CombinedEntityKind, preference: ColumnPreference): void {
    this.layouts[entity].set(preference);
    this.columnPreferences.save(entity, preference);
  }

  protected reset(entity: CombinedEntityKind): void {
    if (!this.columnPreferences.reset(entity)) {
      this.snackBar.open(
        `${this.entityLabels[entity]} combined column layout could not be reset.`,
        'Dismiss',
        { duration: 6000 },
      );
      return;
    }
    this.layouts[entity].set(defaultCombinedColumnPreference(entity));
    this.snackBar.open(`${this.entityLabels[entity]} combined column layout reset.`, 'Dismiss', {
      duration: 3000,
    });
  }

  protected resetAll(): void {
    if (!this.columnPreferences.resetAll()) {
      this.snackBar.open('Combined finder column layouts could not be reset.', 'Dismiss', {
        duration: 6000,
      });
      return;
    }
    for (const entity of this.entities) {
      this.layouts[entity].set(defaultCombinedColumnPreference(entity));
    }
    this.snackBar.open('Combined finder column layouts reset.', 'Dismiss', { duration: 3000 });
  }
}
