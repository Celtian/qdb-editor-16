import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ProjectSummary } from '../../../../../shared/downloader/contracts';
import { DesktopApi } from '../../../core/downloader-api';
import {
  DeleteProjectDialog,
  type DeleteProjectDialogData,
  projectDeletionMessage,
  projectDeletionNotificationConfig,
} from '../../../shared/delete-project-dialog/delete-project-dialog';
import { ReferenceDatePipe } from '../../../shared/reference-date-pipe';
import {
  CreateProjectDialog,
  type CreateProjectValue,
} from '../create-project-dialog/create-project-dialog';
import {
  RenameProjectDialog,
  type RenameProjectValue,
} from '../../project/rename-project-dialog/rename-project-dialog';

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
    MatMenuModule,
    MatProgressSpinnerModule,
    ReferenceDatePipe,
    RouterLink,
  ],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.css',
})
export class ProjectsPage {
  private readonly api = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
  protected readonly projects = signal<ProjectSummary[]>([]);
  protected readonly search = signal('');
  protected readonly showSearch = computed(() => this.projects().length > 5);
  protected readonly visibleProjects = computed(() => {
    const projects = this.projects();
    const search = this.search().trim().toLocaleLowerCase();
    if (projects.length <= 5 || !search) return projects;
    return projects.filter((project) => project.name.toLocaleLowerCase().includes(search));
  });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly deletingProjectId = signal<string | undefined>(undefined);

  constructor() {
    void this.loadProjects();
  }

  protected createProject(): void {
    this.dialog
      .open<CreateProjectDialog, undefined, CreateProjectValue>(CreateProjectDialog, {
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((value) => {
        if (value) void this.saveProject(value);
      });
  }

  protected setSearch(value: string): void {
    this.search.set(value);
  }

  protected clearSearch(): void {
    this.search.set('');
  }

  protected renameProject(project: ProjectSummary): void {
    this.dialog
      .open<RenameProjectDialog, { name: string }, RenameProjectValue>(RenameProjectDialog, {
        data: { name: project.name },
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((value) => {
        if (value && value.name !== project.name) {
          void this.saveProjectName(project.id, value.name);
        }
      });
  }

  protected deleteProject(project: ProjectSummary): void {
    if (this.deletingProjectId()) return;
    this.dialog
      .open<DeleteProjectDialog, DeleteProjectDialogData, boolean>(DeleteProjectDialog, {
        data: { name: project.name },
        role: 'alertdialog',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.removeProject(project.id);
      });
  }

  private async loadProjects(): Promise<void> {
    this.loading.set(true);
    const result = await this.api.listProjects();
    this.loading.set(false);
    if (result.ok) {
      this.setProjects(result.value);
      this.error.set('');
    } else {
      this.error.set(result.error.message);
    }
  }

  private async saveProject(value: CreateProjectValue): Promise<void> {
    const result = await this.api.createProject(value.name, value.referenceDate);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.setProjects(
      [...this.projects(), result.value].sort(
        (left, right) =>
          right.referenceDate.localeCompare(left.referenceDate) ||
          left.name.localeCompare(right.name),
      ),
    );
    this.snackBar.open('Snapshot project created.', 'Dismiss', { duration: 3000 });
  }

  private async saveProjectName(projectId: string, name: string): Promise<void> {
    const result = await this.api.renameProject(projectId, name);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.setProjects(
      this.projects().map((project) => (project.id === projectId ? result.value : project)),
    );
    this.snackBar.open('Project renamed.', 'Dismiss', { duration: 3000 });
  }

  private async removeProject(projectId: string): Promise<void> {
    if (this.deletingProjectId()) return;
    this.deletingProjectId.set(projectId);
    const result = await this.api.deleteProject(projectId);
    this.deletingProjectId.set(undefined);
    if (!result.ok) {
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      return;
    }
    this.setProjects(this.projects().filter((project) => project.id !== projectId));
    this.mainContent()?.nativeElement.focus();
    this.snackBar.open(
      projectDeletionMessage(result.value),
      'Dismiss',
      projectDeletionNotificationConfig(result.value),
    );
  }

  private setProjects(projects: ProjectSummary[]): void {
    this.projects.set(projects);
    if (projects.length <= 5) this.search.set('');
  }
}
