import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { sourceLabels, type ProjectSummary } from '../../../../../shared/downloader/contracts';
import { AppStore } from '../../../core/app-store';
import { ConfirmDialog } from '../../../core/confirm-dialog';
import { DesktopApi } from '../../../core/desktop-api';
import { DesktopApi as DownloaderApi } from '../../../core/downloader-api';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ReferenceDatePipe } from '../../../shared/reference-date-pipe';

@Component({
  selector: 'app-overview-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PageHeader,
    ReferenceDatePipe,
    RouterLink,
  ],
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.css',
})
export class OverviewPage {
  private readonly api = inject(DownloaderApi);
  private readonly desktop = inject(DesktopApi);
  private readonly store = inject(AppStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? '';
  private readonly loadedProject = signal<ProjectSummary | undefined>(undefined);
  protected readonly project = computed(() => {
    const updatedProject = this.api.projectUpdated();
    return updatedProject?.id === this.projectId ? updatedProject : this.loadedProject();
  });
  protected readonly sourceText = computed(() => {
    const sourceNames = this.project()?.sourceNames ?? [];
    return sourceNames.length
      ? sourceNames.map((sourceName) => sourceLabels[sourceName]).join(', ')
      : 'No sources imported';
  });
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  protected async deleteProject(project: ProjectSummary): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Delete ${project.name}?`,
          message: `This permanently removes all Source DB and Combined DB records and ${project.databaseCount ?? 0} managed FIFA database files. Original imports remain untouched.`,
          confirmLabel: 'Delete project',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    try {
      const result = await this.store.operation(() => this.desktop.removeProject(project.id));
      await this.store.refreshProjects();
      await this.router.navigate(['/projects']);
      if (result.failedExportDirectories.length) {
        this.snackBar.open(
          `Project deleted, but these export folders could not be removed: ${result.failedExportDirectories.join(', ')}`,
          'Dismiss',
          { duration: 10_000 },
        );
      }
    } catch {
      // Store exposes the error.
    }
  }

  private async load(): Promise<void> {
    const result = await this.api.getProjectSummary(this.projectId);
    if (result.ok) this.loadedProject.set(result.value);
    else this.error.set(result.error.message);
  }
}
