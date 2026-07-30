import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  type OnChanges,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
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
export class TablesPage implements OnChanges {
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  protected readonly databaseId = input.required<string>();
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('en');
    return query
      ? this.store.tables().filter((table) => table.name.includes(query))
      : this.store.tables();
  });
  private initializeSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId']) return;
    const sequence = ++this.initializeSequence;
    this.query.set('');
    void this.initialize(this.projectId(), this.databaseId(), sequence);
  }

  private async initialize(projectId: string, databaseId: string, sequence: number): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    if (sequence !== this.initializeSequence) return;
    await this.store.refreshDatabases(projectId);
    if (sequence !== this.initializeSequence) return;
    await this.store.refreshTables(databaseId);
  }
}
