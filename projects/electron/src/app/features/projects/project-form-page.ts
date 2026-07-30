import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-project-form-page',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './project-form-page.html',
  styleUrl: './project-form-page.css',
})
export class ProjectFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
  protected readonly editing = Boolean(this.projectId);
  protected readonly model = signal({
    name: '',
    referenceDate: new Date().toISOString().slice(0, 10),
  });
  protected readonly projectForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Project name is required.' });
    maxLength(schema.name, 80, { message: 'Use 80 characters or fewer.' });
    required(schema.referenceDate, { message: 'Reference date is required.' });
    pattern(schema.referenceDate, /^\d{4}-\d{2}-\d{2}$/, {
      message: 'Use a valid date.',
    });
  });

  constructor() {
    void this.initialize();
  }

  protected save(): void {
    void submit(this.projectForm, async () => {
      try {
        const project = await this.store.operation(() =>
          this.editing
            ? this.desktop.updateProject({ id: this.projectId, ...this.model() })
            : this.desktop.createProject(this.model()),
        );
        await this.store.refreshProjects();
        await this.router.navigate(['/projects', project.id]);
      } catch {
        // Store exposes the error.
      }
    });
  }

  private async initialize(): Promise<void> {
    if (!this.editing) return;
    if (!this.store.projects().length) await this.store.refreshProjects();
    const project = this.store.projects().find((candidate) => candidate.id === this.projectId);
    if (project) this.model.set({ name: project.name, referenceDate: project.referenceDate });
  }
}
