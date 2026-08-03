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
  templateUrl: './delete-team-dialog.html',
  styleUrl: './delete-team-dialog.css',
})
export class DeleteTeamDialog {
  protected readonly data = inject<DeleteTeamDialogData>(MAT_DIALOG_DATA);
  protected readonly bulk = this.data.bulk ?? false;
  protected readonly teamCount = this.data.teamCount ?? 1;
  protected readonly formatUiCount = formatUiCount;
}
