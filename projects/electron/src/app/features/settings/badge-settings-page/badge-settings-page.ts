import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  CustomBadge,
  CustomBadgeSummary,
} from '../../../../../shared/downloader/custom-badge';
import {
  entityStatusSettingLimits,
  type EntityStatusSettings,
} from '../../../../../shared/downloader/entity-status';
import { formatUiNumber } from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import { EntityStatusSettingsService } from '../../../core/entity-status-settings.service';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';
import { PageHeader } from '../../../shared/page-header/page-header';
import {
  CustomBadgeDialog,
  type CustomBadgeDialogData,
  type CustomBadgeDialogValue,
} from '../custom-badge-dialog/custom-badge-dialog';
import { DeleteCustomBadgeDialog } from '../delete-custom-badge-dialog/delete-custom-badge-dialog';

@Component({
  selector: 'app-badge-settings-page',
  imports: [
    CustomBadgeView,
    DecimalPipe,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSliderModule,
    PageHeader,
  ],
  templateUrl: './badge-settings-page.html',
  styleUrl: './badge-settings-page.css',
})
export class BadgeSettingsPage {
  private readonly api = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly entityStatusSettings = inject(EntityStatusSettingsService);
  protected readonly customBadges = signal<CustomBadgeSummary[]>([]);
  protected readonly customBadgesLoading = signal(true);
  protected readonly customBadgesError = signal('');
  protected readonly badgeSettingsModel = signal<EntityStatusSettings>({
    ...this.entityStatusSettings.settings(),
  });
  protected readonly badgeSettingsForm = form(this.badgeSettingsModel, (path) => {
    min(path.newDays, entityStatusSettingLimits.newDays.min);
    max(path.newDays, entityStatusSettingLimits.newDays.max);
    min(path.oldMonths, entityStatusSettingLimits.oldMonths.min);
    max(path.oldMonths, entityStatusSettingLimits.oldMonths.max);
  });
  protected readonly badgeSettingLimits = entityStatusSettingLimits;
  protected readonly formatUiNumber = formatUiNumber;

  constructor() {
    void this.loadCustomBadges();
  }

  protected setNewDays(newDays: number): void {
    this.saveBadgeSettings({ ...this.badgeSettingsModel(), newDays });
  }

  protected setOldMonths(oldMonths: number): void {
    this.saveBadgeSettings({ ...this.badgeSettingsModel(), oldMonths });
  }

  protected dayUnit(value: number): string {
    return value === 1 ? 'day' : 'days';
  }

  protected monthUnit(value: number): string {
    return value === 1 ? 'month' : 'months';
  }

  protected createCustomBadge(): void {
    this.openCustomBadgeDialog();
  }

  protected editCustomBadge(badge: CustomBadge): void {
    this.openCustomBadgeDialog(badge);
  }

  protected confirmDeleteCustomBadge(badge: CustomBadgeSummary): void {
    this.dialog
      .open<DeleteCustomBadgeDialog, CustomBadgeSummary, boolean>(DeleteCustomBadgeDialog, {
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

  private openCustomBadgeDialog(badge?: CustomBadge): void {
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

  private async saveCustomBadge(value: CustomBadgeDialogValue, badge?: CustomBadge): Promise<void> {
    const result = badge
      ? await this.api.updateCustomBadge({ id: badge.id, ...value })
      : await this.api.createCustomBadge(value);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    await this.loadCustomBadges();
    this.snackBar.open(badge ? 'Custom badge updated.' : 'Custom badge created.', 'Dismiss', {
      duration: 3000,
    });
  }

  private async deleteCustomBadge(badge: CustomBadgeSummary): Promise<void> {
    const result = await this.api.deleteCustomBadge(badge.id);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    await this.loadCustomBadges();
    this.snackBar.open('Custom badge deleted.', 'Dismiss', { duration: 3000 });
  }

  private async loadCustomBadges(): Promise<void> {
    this.customBadgesLoading.set(true);
    const result = await this.api.listCustomBadges();
    this.customBadgesLoading.set(false);
    if (!result.ok) {
      this.customBadgesError.set(result.error.message);
      return;
    }
    this.customBadgesError.set('');
    this.customBadges.set(result.value);
  }

  private saveBadgeSettings(settings: EntityStatusSettings): void {
    this.badgeSettingsModel.set(settings);
    this.entityStatusSettings.setSettings(settings);
  }
}
