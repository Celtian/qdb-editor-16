import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import {
  type DeleteSourceDataResult,
  type SourceDataDeletionCounts,
  type SourceName,
  sourceLabels,
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
  templateUrl: './delete-source-data-dialog.html',
  styleUrl: './delete-source-data-dialog.css',
})
export class DeleteSourceDataDialog {
  protected readonly data = inject<DeleteSourceDataDialogData>(MAT_DIALOG_DATA);
  protected readonly sourceLabels = sourceLabels;
  protected readonly sourceDataDeletionPreviewMessage = sourceDataDeletionPreviewMessage;
}
