import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import type { DeleteLeagueMode } from '../../../../../shared/downloader/contracts';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface DeleteLeagueDialogData {
  bulk?: boolean;
  name?: string;
  leagueCount?: number;
  teamCount: number;
  playerCount: number;
}

@Component({
  selector: 'app-delete-league-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatRadioModule],
  templateUrl: './delete-league-dialog.html',
  styleUrl: './delete-league-dialog.css',
})
export class DeleteLeagueDialog {
  protected readonly data = inject<DeleteLeagueDialogData>(MAT_DIALOG_DATA);
  protected readonly leagueCount = this.data.leagueCount ?? 1;
  protected readonly bulk = this.data.bulk ?? false;
  protected readonly mode = signal<DeleteLeagueMode>('league-only');
  protected readonly formatUiCount = formatUiCount;

  protected selectMode(mode: DeleteLeagueMode): void {
    this.mode.set(mode);
  }
}
