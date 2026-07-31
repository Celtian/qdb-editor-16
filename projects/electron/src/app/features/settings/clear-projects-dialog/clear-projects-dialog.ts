import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';
import type { DeleteAllProjectsResult } from '../../../../../shared/downloader/contracts';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface ClearProjectsDialogData {
  projectCount: number;
}

export const allProjectsDeletionMessage = (result: DeleteAllProjectsResult): string => {
  const projects = formatUiCount(result.deletedProjectCount, 'project');
  const failed = result.failedExportDirectories.length;
  if (failed) {
    return `${projects} deleted. ${formatUiCount(failed, 'export folder')} could not be removed.`;
  }
  const deletedExports = result.deletedExportCount;
  return deletedExports
    ? `${projects} and ${formatUiCount(deletedExports, 'export folder')} deleted.`
    : `${projects} deleted.`;
};

export const allProjectsDeletionNotificationConfig = (
  result: DeleteAllProjectsResult,
): MatSnackBarConfig =>
  result.failedExportDirectories.length
    ? { duration: 8000, panelClass: ['warning-snackbar'] }
    : { duration: 4000 };

@Component({
  selector: 'app-clear-projects-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Clear all projects?</h2>
    <mat-dialog-content>
      <p class="deletion-impact">
        This will permanently delete
        {{ formatUiCount(data.projectCount, 'project') }} and all related data.
      </p>
      <p class="warning-heading">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <strong>This action cannot be undone.</strong>
      </p>
      <p>
        Every league, team, and player in these projects will be removed. Export folders created
        during this app session will also be removed when possible.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        Clear all projects
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .deletion-impact {
      font-weight: 500;
    }
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
export class ClearProjectsDialog {
  protected readonly data = inject<ClearProjectsDialogData>(MAT_DIALOG_DATA);
  protected readonly formatUiCount = formatUiCount;
}
