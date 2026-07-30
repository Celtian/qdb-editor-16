import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
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
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en');
    return query
      ? this.store
          .projects()
          .filter((project) => project.name.toLocaleLowerCase('en').includes(query))
      : this.store.projects();
  });

  protected async remove(project: ProjectDescriptor): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Delete ${project.name}?`,
          message: `This permanently removes the project and its ${project.databaseCount} managed database files. Original imports and external exports are not affected.`,
          confirmLabel: 'Delete project',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    try {
      await this.store.operation(() => this.desktop.removeProject(project.id));
      await this.store.refreshProjects();
    } catch {
      // Store exposes the error.
    }
  }
}
