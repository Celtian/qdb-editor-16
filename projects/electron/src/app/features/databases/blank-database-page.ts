import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
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
export class BlankDatabasePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  private readonly model = signal({ name: '' });
  protected readonly databaseForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Database name is required.' });
    maxLength(schema.name, 80, { message: 'Use 80 characters or fewer.' });
  });

  protected save(): void {
    void submit(this.databaseForm, async () => {
      try {
        const database = await this.store.operation(() =>
          this.desktop.createBlankDatabase({ projectId: this.projectId, name: this.model().name }),
        );
        await this.store.refreshDatabases(this.projectId);
        await this.router.navigate([
          '/projects',
          this.projectId,
          'databases',
          database.id,
          'tables',
        ]);
      } catch {
        // Store exposes the error.
      }
    });
  }
}
