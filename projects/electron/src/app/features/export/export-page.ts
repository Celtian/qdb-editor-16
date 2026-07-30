import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';
import type { ExportDatabaseResult, ValidationReport } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-export-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
  ],
  templateUrl: './export-page.html',
})
export class ExportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly databaseId = this.route.snapshot.paramMap.get('databaseId')!;
  protected readonly targetPath = signal('');
  protected readonly report = signal<ValidationReport | undefined>(undefined);
  protected readonly result = signal<ExportDatabaseResult | undefined>(undefined);

  constructor() {
    this.store.selectContext(this.projectId, this.databaseId);
    void this.loadReport();
  }

  protected async chooseFolder(): Promise<void> {
    try {
      const path = await this.store.operation(() => this.desktop.selectExportDirectory());
      if (path) {
        this.targetPath.set(path);
        this.result.set(undefined);
      }
    } catch {
      // Store exposes the error.
    }
  }

  protected async export(): Promise<void> {
    if (!this.targetPath()) return;
    const report = this.report();
    if (report?.errorCount) {
      const confirmed = await this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Export with validation errors?',
            message:
              'The export will preserve current values without correcting them. FIFA or DB Master may reject invalid data.',
            confirmLabel: 'Export anyway',
          },
        })
        .afterClosed()
        .toPromise();
      if (!confirmed) return;
    }
    try {
      this.result.set(
        await this.store.operation(() =>
          this.desktop.exportDatabase({
            databaseId: this.databaseId,
            targetParentPath: this.targetPath(),
          }),
        ),
      );
    } catch {
      // Store exposes the error.
    }
  }

  protected reveal(): void {
    const path = this.result()?.outputPath;
    if (path) void this.desktop.revealExport(path);
  }

  private async loadReport(): Promise<void> {
    try {
      this.report.set(
        await this.store.operation(() => this.desktop.getValidation(this.databaseId)),
      );
    } catch {
      // Store exposes the error.
    }
  }
}
