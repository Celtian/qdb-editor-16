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
  template: `
    <h2 mat-dialog-title>Change tier for selected leagues</h2>
    <mat-dialog-content>
      <p>Apply one tier to {{ leagueLabel }}.</p>
      @if (data.mixedTiers) {
        <p class="hint">The selected leagues currently have different tiers.</p>
      }
      <form id="change-league-tier-form" (submit)="$event.preventDefault(); save()">
        <mat-form-field appearance="outline">
          <mat-label>Tier</mat-label>
          <mat-select [formField]="tierForm.tier" aria-label="Tier for selected leagues">
            <mat-option [value]="0">No tier</mat-option>
            @for (tier of tierOptions; track tier) {
              <mat-option [value]="tier">Tier {{ tier }}</mat-option>
            }
          </mat-select>
          <mat-hint>Select “No tier” to clear every selected league.</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button matButton="filled" form="change-league-tier-form" type="submit">
        {{ actionLabel() }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
    .hint {
      color: var(--muted-text);
    }
  `,
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
