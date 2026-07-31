import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface DeleteTeamDialogData {
  bulk?: boolean;
  name?: string;
  teamCount?: number;
  playerCount: number;
}

@Component({
  selector: 'app-delete-team-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      {{ bulk ? 'Delete selected ' + (teamCount === 1 ? 'team?' : 'teams?') : 'Delete team?' }}
    </h2>
    <mat-dialog-content>
      <p class="warning-heading">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <strong>{{ bulk ? formatUiCount(teamCount, 'team') + ' selected' : data.name }}</strong>
      </p>
      <p>
        This permanently deletes
        {{ bulk ? formatUiCount(teamCount, 'team') : 'the team' }} and all
        {{ formatUiCount(data.playerCount, 'player') }} attached to
        {{ bulk ? (teamCount === 1 ? 'it' : 'them') : 'it' }}.
      </p>
      <p>This action cannot be undone.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        {{ bulk ? 'Delete ' + formatUiCount(teamCount, 'team') : 'Delete team' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .warning-heading {
      align-items: center;
      display: flex;
      gap: 0.65rem;
    }
    .warning-heading mat-icon {
      color: var(--mat-sys-error);
    }
    .delete-button:not(:disabled) {
      background-color: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class DeleteTeamDialog {
  protected readonly data = inject<DeleteTeamDialogData>(MAT_DIALOG_DATA);
  protected readonly bulk = this.data.bulk ?? false;
  protected readonly teamCount = this.data.teamCount ?? 1;
  protected readonly formatUiCount = formatUiCount;
}
