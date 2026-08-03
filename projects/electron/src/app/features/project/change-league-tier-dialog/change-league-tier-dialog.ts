import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { leagueTiers } from '../../../../../shared/downloader/contracts';
import { formatUiCount } from '../../../../../shared/downloader/ui-format';

export interface ChangeLeagueTierDialogData {
  leagueCount: number;
  tier?: number;
  mixedTiers: boolean;
}

@Component({
  selector: 'app-change-league-tier-dialog',
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './change-league-tier-dialog.html',
  styleUrl: './change-league-tier-dialog.css',
})
export class ChangeLeagueTierDialog {
  protected readonly data = inject<ChangeLeagueTierDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ChangeLeagueTierDialog, number>);
  protected readonly tierOptions = leagueTiers;
  protected readonly leagueLabel = formatUiCount(this.data.leagueCount, 'league');
  protected readonly model = signal({ tier: this.data.tier ?? 0 });
  protected readonly tierForm = form(this.model);
  protected readonly actionLabel = computed(() =>
    this.model().tier === 0 ? 'Clear tier' : 'Apply tier',
  );

  protected save(): void {
    void submit(this.tierForm, async () => {
      await Promise.resolve();
      this.dialogRef.close(this.model().tier);
    });
  }
}
