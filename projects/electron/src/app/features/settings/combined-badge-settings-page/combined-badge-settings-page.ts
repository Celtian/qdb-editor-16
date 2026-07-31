import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  CombinedCustomBadge,
  CombinedCustomBadgeSummary,
} from '../../../../../shared/downloader/combined-custom-badge';
import { DesktopApi } from '../../../core/downloader-api';
import {
  CombinedEntityStatusBadge,
  combinedEntityStatuses,
  combinedEntityStatusDetails,
} from '../../../shared/combined-entity-status-badge/combined-entity-status-badge';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import { PageHeader } from '../../../shared/page-header/page-header';
import {
  CustomBadgeDialog,
  type CustomBadgeDialogData,
  type CustomBadgeDialogValue,
} from '../custom-badge-dialog/custom-badge-dialog';
import { DeleteCustomBadgeDialog } from '../delete-custom-badge-dialog/delete-custom-badge-dialog';

@Component({
  selector: 'app-combined-badge-settings-page',
  imports: [
    CombinedEntityStatusBadge,
    CustomBadgeView,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeader,
  ],
  templateUrl: './combined-badge-settings-page.html',
  styleUrl: '../badge-settings-page/badge-settings-page.css',
})
export class CombinedBadgeSettingsPage {
  private readonly api = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly customBadges = signal<CombinedCustomBadgeSummary[]>([]);
  protected readonly customBadgesLoading = signal(true);
  protected readonly customBadgesError = signal('');
  protected readonly builtInStatuses = combinedEntityStatuses;
  protected readonly builtInStatusDetails = combinedEntityStatusDetails;

  constructor() {
    void this.loadCustomBadges();
  }

  protected createCustomBadge(): void {
    this.openCustomBadgeDialog();
  }

  protected editCustomBadge(badge: CombinedCustomBadge): void {
    this.openCustomBadgeDialog(badge);
  }

  protected confirmDeleteCustomBadge(badge: CombinedCustomBadgeSummary): void {
    this.dialog
      .open<DeleteCustomBadgeDialog, CombinedCustomBadgeSummary, boolean>(DeleteCustomBadgeDialog, {
        data: badge,
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.deleteCustomBadge(badge);
      });
  }

  protected retryCustomBadges(): void {
    void this.loadCustomBadges();
  }

  private openCustomBadgeDialog(badge?: CombinedCustomBadge): void {
    this.dialog
      .open<CustomBadgeDialog, CustomBadgeDialogData, CustomBadgeDialogValue>(CustomBadgeDialog, {
        data: { badge },
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((value) => {
        if (value) void this.saveCustomBadge(value, badge);
      });
  }

  private async saveCustomBadge(
    value: CustomBadgeDialogValue,
    badge?: CombinedCustomBadge,
  ): Promise<void> {
    const result = badge
      ? await this.api.updateCombinedCustomBadge({ id: badge.id, ...value })
      : await this.api.createCombinedCustomBadge(value);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    await this.loadCustomBadges();
    this.snackBar.open(
      badge ? 'Combined custom badge updated.' : 'Combined custom badge created.',
      'Dismiss',
      { duration: 3000 },
    );
  }

  private async deleteCustomBadge(badge: CombinedCustomBadgeSummary): Promise<void> {
    const result = await this.api.deleteCombinedCustomBadge(badge.id);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    await this.loadCustomBadges();
    this.snackBar.open('Combined custom badge deleted.', 'Dismiss', { duration: 3000 });
  }

  private async loadCustomBadges(): Promise<void> {
    this.customBadgesLoading.set(true);
    const result = await this.api.listCombinedCustomBadges();
    this.customBadgesLoading.set(false);
    if (!result.ok) {
      this.customBadgesError.set(result.error.message);
      return;
    }
    this.customBadgesError.set('');
    this.customBadges.set(result.value);
  }
}
