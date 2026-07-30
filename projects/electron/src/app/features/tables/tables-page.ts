import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppStore } from '../../core/app-store';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-tables-page',
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './tables-page.html',
})
export class TablesPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly databaseId = this.route.snapshot.paramMap.get('databaseId')!;
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en');
    return query
      ? this.store.tables().filter((table) => table.name.includes(query))
      : this.store.tables();
  });

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    await this.store.refreshDatabases(this.projectId);
    await this.store.refreshTables(this.databaseId);
  }
}
