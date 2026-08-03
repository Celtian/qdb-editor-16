import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import type { ProjectDescriptor } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-projects-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.css',
})
export class ProjectsPage {
  protected readonly store = inject(AppStore);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en');
    return query
      ? this.store
          .projects()
          .filter((project) => project.name.toLocaleLowerCase('en').includes(query))
      : this.store.projects();
  });

  constructor() {
    void this.store.refreshProjects();
  }

  protected queryChanged(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }

  protected async remove(project: ProjectDescriptor): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Delete ${project.name}?`,
          message: `This permanently removes the project, all Source DB and Combined DB records, and its ${project.databaseCount} managed FIFA database files. Original imports remain untouched. Export folders created during this application session will also be cleaned up where possible.`,
          confirmLabel: 'Delete project',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    try {
      const result = await this.store.operation(() => this.desktop.removeProject(project.id));
      await this.store.refreshProjects();
      if (result.failedExportDirectories.length) {
        this.snackBar.open(
          `Project deleted, but ${result.failedExportDirectories.length} export folder${result.failedExportDirectories.length === 1 ? '' : 's'} could not be removed: ${result.failedExportDirectories.join(', ')}`,
          'Dismiss',
          { duration: 10_000 },
        );
      }
    } catch {
      // Store exposes the error.
    }
  }
}
