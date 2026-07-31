import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import type { CustomBadgeSummary } from '../../../../../shared/downloader/custom-badge';
import { CustomBadge } from '../../../shared/custom-badge/custom-badge';

@Component({
  selector: 'app-delete-custom-badge-dialog',
  imports: [CustomBadge, DecimalPipe, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Delete custom badge?</h2>
    <mat-dialog-content>
      <p><app-custom-badge [badge]="badge" /></p>
      @if (badge.assignmentCount) {
        <p>
          This also removes the badge from {{ badge.assignmentCount | number }}
          {{ badge.assignmentCount === 1 ? 'record' : 'records' }} across all projects.
        </p>
      } @else {
        <p>This badge is not assigned to any records.</p>
      }
      <p>This action cannot be undone.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button class="delete-button" matButton="filled" [mat-dialog-close]="true" type="button">
        Delete badge
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .delete-button {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
export class DeleteCustomBadgeDialog {
  protected readonly badge = inject<CustomBadgeSummary>(MAT_DIALOG_DATA);
}
