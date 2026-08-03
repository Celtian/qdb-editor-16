import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import type { CustomBadgeSummary } from '../../../../../shared/downloader/custom-badge';
import { CustomBadge } from '../../../shared/custom-badge/custom-badge';

@Component({
  selector: 'app-delete-custom-badge-dialog',
  imports: [CustomBadge, DecimalPipe, MatButtonModule, MatDialogModule],
  templateUrl: './delete-custom-badge-dialog.html',
})
export class DeleteCustomBadgeDialog {
  protected readonly badge = inject<CustomBadgeSummary>(MAT_DIALOG_DATA);
}
