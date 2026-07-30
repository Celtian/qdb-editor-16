import {
  Component,
  computed,
  inject,
  input,
  type OnChanges,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { FormField, form, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
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
export class ProjectFormPage implements OnChanges {
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input<string>();
  protected readonly editing = computed(() => Boolean(this.projectId()));
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
  private initializeSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId']) return;
    const projectId = this.projectId();
    const sequence = ++this.initializeSequence;
    if (!projectId) {
      this.model.set({ name: '', referenceDate: new Date().toISOString().slice(0, 10) });
      return;
    }
    void this.initialize(projectId, sequence);
  }

  protected save(): void {
    void submit(this.projectForm, async () => {
      const projectId = this.projectId();
      try {
        const project = await this.store.operation(() =>
          projectId
            ? this.desktop.updateProject({ id: projectId, ...this.model() })
            : this.desktop.createProject(this.model()),
        );
        await this.store.refreshProjects();
        await this.router.navigate(['/projects', project.id]);
      } catch {
        // Store exposes the error.
      }
    });
  }

  private async initialize(projectId: string, sequence: number): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    if (sequence !== this.initializeSequence) return;
    const project = this.store.projects().find((candidate) => candidate.id === projectId);
    if (project) this.model.set({ name: project.name, referenceDate: project.referenceDate });
  }
}
