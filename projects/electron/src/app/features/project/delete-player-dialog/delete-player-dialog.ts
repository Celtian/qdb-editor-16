import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface DeletePlayerDialogData {
  bulk?: boolean;
  name?: string;
  playerCount?: number;
}

@Component({
  selector: 'app-delete-player-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      {{
        bulk ? 'Delete selected ' + (playerCount === 1 ? 'player?' : 'players?') : 'Delete player?'
      }}
    </h2>
    <mat-dialog-content>
      <p class="warning-heading">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <strong>{{ bulk ? formatUiCount(playerCount, 'player') + ' selected' : data.name }}</strong>
      </p>
      <p>
        This permanently deletes
        {{ bulk ? formatUiCount(playerCount, 'player') : 'the player' }}.
      </p>
      <p>This action cannot be undone.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        {{ bulk ? 'Delete ' + formatUiCount(playerCount, 'player') : 'Delete player' }}
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
export class DeletePlayerDialog {
  protected readonly data = inject<DeletePlayerDialogData>(MAT_DIALOG_DATA);
  protected readonly bulk = this.data.bulk ?? false;
  protected readonly playerCount = this.data.playerCount ?? 1;
  protected readonly formatUiCount = formatUiCount;
}
