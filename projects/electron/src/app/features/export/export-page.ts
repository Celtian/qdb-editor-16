import {
  Component,
  inject,
  input,
  type OnChanges,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
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
export class ExportPage implements OnChanges {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  protected readonly databaseId = input.required<string>();
  protected readonly targetPath = signal('');
  protected readonly report = signal<ValidationReport | undefined>(undefined);
  protected readonly result = signal<ExportDatabaseResult | undefined>(undefined);
  private loadSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId']) return;
    const sequence = ++this.loadSequence;
    const databaseId = this.databaseId();
    this.targetPath.set('');
    this.report.set(undefined);
    this.result.set(undefined);
    this.store.selectContext(this.projectId(), databaseId);
    void this.loadReport(databaseId, sequence);
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
    const databaseId = this.databaseId();
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
            databaseId,
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

  private async loadReport(databaseId: string, sequence: number): Promise<void> {
    try {
      const report = await this.store.operation(() => this.desktop.getValidation(databaseId));
      if (sequence === this.loadSequence) this.report.set(report);
    } catch {
      // Store exposes the error.
    }
  }
}
