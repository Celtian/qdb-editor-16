import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';

import type { DeleteProjectResult } from '../../../../shared/downloader/contracts';
import { formatUiCount } from '../../../../shared/downloader/ui-format';

export interface DeleteProjectDialogData {
  name: string;
}

export const projectDeletionMessage = (result: DeleteProjectResult): string => {
  const failed = result.failedExportDirectories.length;
  if (failed) {
    return `Project deleted. ${formatUiCount(failed, 'export folder')} could not be removed.`;
  }
  const deleted = result.deletedExportCount;
  return deleted
    ? `Project and ${formatUiCount(deleted, 'export folder')} deleted.`
    : 'Project deleted.';
};

export const projectDeletionNotificationConfig = (
  result: DeleteProjectResult,
): MatSnackBarConfig =>
  result.failedExportDirectories.length
    ? { duration: 8000, panelClass: ['warning-snackbar'] }
    : { duration: 4000 };

@Component({
  selector: 'app-delete-project-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './delete-project-dialog.html',
  styleUrl: './delete-project-dialog.css',
})
export class DeleteProjectDialog {
  protected readonly data = inject<DeleteProjectDialogData>(MAT_DIALOG_DATA);
}
