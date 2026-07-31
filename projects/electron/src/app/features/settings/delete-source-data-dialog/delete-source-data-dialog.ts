import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  sourceLabels,
  type DeleteSourceDataResult,
  type SourceDataDeletionCounts,
  type SourceName,
} from '../../../../../shared/downloader/contracts';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface DeleteSourceDataDialogData {
  sourceNames: SourceName[];
  counts: SourceDataDeletionCounts;
}

const sourceDataCountsMessage = (counts: SourceDataDeletionCounts): string =>
  `${formatUiCount(counts.leagues, 'league')}, ${formatUiCount(
    counts.teams,
    'team',
  )}, and ${formatUiCount(counts.players, 'player')}`;

export const sourceDataDeletionPreviewMessage = (counts: SourceDataDeletionCounts): string =>
  `This will delete ${sourceDataCountsMessage(counts)}.`;

export const sourceDataDeletionMessage = (result: DeleteSourceDataResult): string =>
  `Deleted ${sourceDataCountsMessage(result.deleted)}.`;

@Component({
  selector: 'app-delete-source-data-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Delete selected source data?</h2>
    <mat-dialog-content>
      <p class="deletion-impact">{{ sourceDataDeletionPreviewMessage(data.counts) }}</p>
      <p class="warning-heading">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <strong>This action cannot be undone.</strong>
      </p>
      <p>The following sources will be removed from the current project:</p>
      <ul>
        @for (sourceName of data.sourceNames; track sourceName) {
          <li>{{ sourceLabels[sourceName] }}</li>
        }
      </ul>
      <p>
        Deleting a team also permanently deletes every player attached to it, even if that player
        came from another source. Teams from other sources under a deleted league will be kept
        without a league.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        Delete selected data
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .warning-heading {
      align-items: center;
      display: flex;
      gap: 0.65rem;
    }
    .deletion-impact {
      font-weight: 500;
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
export class DeleteSourceDataDialog {
  protected readonly data = inject<DeleteSourceDataDialogData>(MAT_DIALOG_DATA);
  protected readonly sourceLabels = sourceLabels;
  protected readonly sourceDataDeletionPreviewMessage = sourceDataDeletionPreviewMessage;
}
