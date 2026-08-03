import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import type { LegacyMigrationPreview, LegacyMigrationResult } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-legacy-migration-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './legacy-migration-page.html',
})
export class LegacyMigrationPage {
  private readonly desktop = inject(DesktopApi);
  private readonly store = inject(AppStore);
  protected readonly sourcePath = signal('');
  protected readonly preview = signal<LegacyMigrationPreview | undefined>(undefined);
  protected readonly result = signal<LegacyMigrationResult | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.detect();
  }

  protected async chooseFile(): Promise<void> {
    const path = await this.desktop.selectLegacyDownloaderDatabase();
    if (path) await this.loadPreview(path);
  }

  protected async refreshPreview(): Promise<void> {
    const path = this.sourcePath();
    if (path) await this.loadPreview(path);
  }

  protected async migrate(): Promise<void> {
    const preview = this.preview();
    if (!preview || preview.alreadyMigrated) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set(undefined);
    try {
      const result = await this.desktop.migrateLegacyDownloader({
        sourcePath: preview.sourcePath,
        sourceIdentity: preview.sourceIdentity,
      });
      await this.store.refreshProjects();
      await this.loadPreview(preview.sourcePath);
      this.result.set(result);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async detect(): Promise<void> {
    try {
      const path = await this.desktop.detectLegacyDownloaderDatabase();
      if (path) await this.loadPreview(path);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  private async loadPreview(path: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.result.set(undefined);
    try {
      const preview = await this.desktop.previewLegacyDownloaderMigration(path);
      this.sourcePath.set(path);
      this.preview.set(preview);
    } catch (error) {
      this.preview.set(undefined);
      this.sourcePath.set(path);
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }
}
