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
  templateUrl: './clear-projects-dialog.html',
})
export class ClearProjectsDialog {
  protected readonly data = inject<ClearProjectsDialogData>(MAT_DIALOG_DATA);
  protected readonly formatUiCount = formatUiCount;
}
