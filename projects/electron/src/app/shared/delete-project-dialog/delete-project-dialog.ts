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
  template: `
    <h2 mat-dialog-title>Delete project?</h2>
    <mat-dialog-content>
      <p class="warning-heading">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <strong>{{ data.name }}</strong>
      </p>
      <p>
        This permanently removes all leagues, teams, and players in this project. Export folders
        created for it during this app session will also be removed when possible.
      </p>
      <p>This action cannot be undone.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        Delete project
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
      color: #ba1a1a;
    }
    .delete-button {
      background-color: #ba1a1a;
      color: #fff;
    }
  `,
})
export class DeleteProjectDialog {
  protected readonly data = inject<DeleteProjectDialogData>(MAT_DIALOG_DATA);
}
