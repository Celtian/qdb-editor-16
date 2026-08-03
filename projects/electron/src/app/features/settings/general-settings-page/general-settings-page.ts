import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { DesktopApi } from '../../../core/downloader-api';
import { type ThemePreference, ThemeService } from '../../../core/theme.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import {
  ClearProjectsDialog,
  type ClearProjectsDialogData,
  allProjectsDeletionMessage,
  allProjectsDeletionNotificationConfig,
} from '../clear-projects-dialog/clear-projects-dialog';

@Component({
  selector: 'app-general-settings-page',
  imports: [DecimalPipe, MatButtonModule, MatCardModule, MatIconModule, MatRadioModule, PageHeader],
  templateUrl: './general-settings-page.html',
  styleUrl: './general-settings-page.css',
})
export class GeneralSettingsPage {
  private readonly api = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly projectCount = signal<number | undefined>(undefined);
  protected readonly loadingProjects = signal(true);
  protected readonly clearingProjects = signal(false);
  protected readonly projectCountError = signal('');
  protected readonly canClearProjects = computed(
    () => (this.projectCount() ?? 0) > 0 && !this.loadingProjects() && !this.clearingProjects(),
  );
  protected readonly themeOptions = [
    {
      value: 'system',
      icon: 'brightness_auto',
      label: 'System',
      description: 'Follow your operating system appearance.',
    },
    {
      value: 'light',
      icon: 'light_mode',
      label: 'Light',
      description: 'Always use the light appearance.',
    },
    {
      value: 'dark',
      icon: 'dark_mode',
      label: 'Dark',
      description: 'Always use the dark appearance.',
    },
  ] as const satisfies readonly {
    value: ThemePreference;
    icon: string;
    label: string;
    description: string;
  }[];

  constructor() {
    void this.loadProjectCount();
  }

  protected selectTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
  }

  protected confirmClearProjects(): void {
    const projectCount = this.projectCount();
    if (!projectCount || !this.canClearProjects()) return;
    this.dialog
      .open<ClearProjectsDialog, ClearProjectsDialogData, boolean>(ClearProjectsDialog, {
        data: { projectCount },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.clearAllProjects();
      });
  }

  private async loadProjectCount(): Promise<void> {
    this.loadingProjects.set(true);
    const result = await this.api.listProjects();
    this.loadingProjects.set(false);
    if (result.ok) {
      this.projectCount.set(result.value.length);
      this.projectCountError.set('');
      return;
    }
    this.projectCountError.set(result.error.message);
  }

  private async clearAllProjects(): Promise<void> {
    if (this.clearingProjects()) return;
    this.clearingProjects.set(true);
    const result = await this.api.deleteAllProjects();
    this.clearingProjects.set(false);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.projectCount.set(0);
    this.snackBar.open(
      allProjectsDeletionMessage(result.value),
      'Dismiss',
      allProjectsDeletionNotificationConfig(result.value),
    );
    await this.router.navigate(['/'], { replaceUrl: true });
  }
}
