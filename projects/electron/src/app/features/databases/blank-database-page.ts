import {
  Component,
  type OnChanges,
  type SimpleChanges,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
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
  selector: 'app-blank-database-page',
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
  templateUrl: './blank-database-page.html',
})
export class BlankDatabasePage implements OnChanges {
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  private readonly model = signal({ name: '' });
  protected readonly databaseForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Database name is required.' });
    maxLength(schema.name, 80, { message: 'Use 80 characters or fewer.' });
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId']) this.model.set({ name: '' });
  }

  protected save(): void {
    void submit(this.databaseForm, async () => {
      const projectId = this.projectId();
      try {
        const database = await this.store.operation(() =>
          this.desktop.createBlankDatabase({ projectId, name: this.model().name }),
        );
        await this.store.refreshDatabases(projectId);
        await this.router.navigate(['/projects', projectId, 'fifa', database.id, 'tables']);
      } catch {
        // Store exposes the error.
      }
    });
  }
}
