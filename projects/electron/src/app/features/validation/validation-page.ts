import { DatePipe, DecimalPipe } from '@angular/common';
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
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ValidationReport } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-validation-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './validation-page.html',
  styleUrl: './validation-page.css',
})
export class ValidationPage implements OnChanges {
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  protected readonly databaseId = input.required<string>();
  protected readonly report = signal<ValidationReport | undefined>(undefined);
  private loadSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId']) return;
    const sequence = ++this.loadSequence;
    const databaseId = this.databaseId();
    this.report.set(undefined);
    this.store.selectContext(this.projectId(), databaseId);
    void this.load(databaseId, sequence);
  }

  protected async validate(): Promise<void> {
    const databaseId = this.databaseId();
    const sequence = ++this.loadSequence;
    try {
      const report = await this.store.operation(() => this.desktop.validateDatabase(databaseId));
      if (sequence !== this.loadSequence) return;
      this.report.set(report);
      await this.store.refreshTables(databaseId);
    } catch {
      // Store exposes the error.
    }
  }

  private async load(databaseId: string, sequence: number): Promise<void> {
    try {
      const report = await this.store.operation(() => this.desktop.getValidation(databaseId));
      if (sequence === this.loadSequence) this.report.set(report);
    } catch {
      // Store exposes the error.
    }
  }
}
