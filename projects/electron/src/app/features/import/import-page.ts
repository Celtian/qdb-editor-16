import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ImportCandidate, SourceFileSelection } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-import-page',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatChip,
    MatChipSet,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatStepperModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './import-page.html',
  styleUrl: './import-page.css',
})
export class ImportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  private readonly stepper = viewChild(MatStepper);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly sourceKind = signal<'text-folder' | 't3db'>('text-folder');
  protected readonly candidate = signal<ImportCandidate | undefined>(undefined);
  protected readonly databaseFile = signal<SourceFileSelection | undefined>(undefined);
  protected readonly metadataFile = signal<SourceFileSelection | undefined>(undefined);
  protected readonly sourceReady = computed(() =>
    this.sourceKind() === 'text-folder'
      ? this.candidate() !== undefined
      : this.databaseFile() !== undefined && this.metadataFile() !== undefined,
  );
  protected readonly selectedSourcePath = computed(() =>
    this.candidate()?.originalPaths.join(' · '),
  );
  private readonly model = signal({ name: '' });
  protected readonly importForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Database name is required.' });
    maxLength(schema.name, 80, { message: 'Use 80 characters or fewer.' });
  });

  protected changeKind(kind: 'text-folder' | 't3db'): void {
    if (this.sourceKind() === kind) return;
    this.sourceKind.set(kind);
    this.candidate.set(undefined);
    this.databaseFile.set(undefined);
    this.metadataFile.set(undefined);
    this.model.set({ name: '' });
  }

  protected async chooseTextFolder(): Promise<void> {
    try {
      const candidate = await this.store.operation(() => this.desktop.selectTextSource());
      if (candidate) this.useCandidate(candidate);
    } catch {
      // Store exposes the error.
    }
  }

  protected async chooseDatabaseFile(): Promise<void> {
    try {
      const file = await this.store.operation(() => this.desktop.selectT3dbDatabaseFile());
      if (file) {
        this.databaseFile.set(file);
        this.clearCandidate();
      }
    } catch {
      // Store exposes the error.
    }
  }

  protected async chooseMetadataFile(): Promise<void> {
    try {
      const file = await this.store.operation(() => this.desktop.selectT3dbMetadataFile());
      if (file) {
        this.metadataFile.set(file);
        this.clearCandidate();
      }
    } catch {
      // Store exposes the error.
    }
  }

  protected async continueSource(): Promise<void> {
    if (!this.sourceReady() || this.store.loading()) return;
    if (this.candidate()) {
      this.stepper()?.next();
      return;
    }
    const database = this.databaseFile();
    const metadata = this.metadataFile();
    if (!database || !metadata) return;
    try {
      const candidate = await this.store.operation(() =>
        this.desktop.prepareT3dbSource({
          databaseFileId: database.id,
          metadataFileId: metadata.id,
        }),
      );
      this.useCandidate(candidate);
      this.stepper()?.next();
    } catch {
      // Store exposes the error.
    }
  }

  protected import(): void {
    const candidate = this.candidate();
    if (!candidate) return;
    void submit(this.importForm, async () => {
      try {
        const result = await this.store.operation(() =>
          this.desktop.importDatabase({
            projectId: this.projectId,
            selectionId: candidate.selectionId,
            name: this.model().name,
          }),
        );
        await this.store.refreshDatabases(this.projectId);
        await this.router.navigate([
          '/projects',
          this.projectId,
          'databases',
          result.database.id,
          'validation',
        ]);
      } catch {
        // Store exposes the error.
      }
    });
  }

  private useCandidate(candidate: ImportCandidate): void {
    this.candidate.set(candidate);
    this.model.set({ name: candidate.suggestedName });
  }

  private clearCandidate(): void {
    this.candidate.set(undefined);
    this.model.set({ name: '' });
  }
}
