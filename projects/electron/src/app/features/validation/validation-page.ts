import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
    MatExpansionModule,
    MatIconModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './validation-page.html',
})
export class ValidationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly databaseId = this.route.snapshot.paramMap.get('databaseId')!;
  protected readonly report = signal<ValidationReport | undefined>(undefined);

  constructor() {
    this.store.selectContext(this.projectId, this.databaseId);
    void this.load();
  }

  protected async validate(): Promise<void> {
    try {
      this.report.set(
        await this.store.operation(() => this.desktop.validateDatabase(this.databaseId)),
      );
      await this.store.refreshTables(this.databaseId);
    } catch {
      // Store exposes the error.
    }
  }

  private async load(): Promise<void> {
    try {
      this.report.set(
        await this.store.operation(() => this.desktop.getValidation(this.databaseId)),
      );
    } catch {
      // Store exposes the error.
    }
  }
}
