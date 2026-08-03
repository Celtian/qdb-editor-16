import {
  Component,
  type OnChanges,
  type SimpleChanges,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

import { firstValueFrom } from 'rxjs';

import type {
  DatabaseObjectSettings,
  FieldDescriptor,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';
import type { ObjectDirtyComponent } from '../objects/object-unsaved.guard';
import { ObjectValueField } from '../objects/object-value-field';

type SettingsGroup = keyof DatabaseObjectSettings;

interface SettingsEntry {
  path: string[];
  label: string;
  value: number;
}

const GROUPS: { id: SettingsGroup; label: string; icon: string }[] = [
  { id: 'ids', label: 'IDs', icon: 'tag' },
  { id: 'dates', label: 'Dates', icon: 'event' },
  { id: 'referee', label: 'Referee', icon: 'sports' },
  { id: 'traits', label: 'Traits', icon: 'star' },
  { id: 'shoes', label: 'Shoes', icon: 'steps' },
  { id: 'kit', label: 'Kit', icon: 'checkroom' },
  { id: 'tactics', label: 'Tactics', icon: 'tune' },
  { id: 'animations', label: 'Animations', icon: 'animation' },
];

const field: FieldDescriptor = {
  name: 'value',
  type: 'int',
  defaultValue: 0,
  unique: false,
  range: { min: 0, max: 1_000_000 },
};

const entries = (value: unknown, path: string[] = []): SettingsEntry[] => {
  if (typeof value === 'number' || typeof value === 'boolean')
    return [
      {
        path,
        label: path
          .join(' · ')
          .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/(^|\s)\S/g, (character) => character.toLocaleUpperCase('en')),
        value: typeof value === 'boolean' ? Number(value) : value,
      },
    ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => entries(child, [...path, key]));
};

@Component({
  selector: 'app-object-settings-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTabsModule,
    ObjectValueField,
    PageHeader,
  ],
  templateUrl: './object-settings-page.html',
})
export class ObjectSettingsPage implements OnChanges, ObjectDirtyComponent {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  readonly projectId = input.required<string>();
  readonly databaseId = input.required<string>();
  protected readonly groups = GROUPS;
  protected readonly field = field;
  protected readonly settings = signal<DatabaseObjectSettings | undefined>(undefined);
  protected readonly original = signal<DatabaseObjectSettings | undefined>(undefined);
  protected readonly dirty = computed(
    () => JSON.stringify(this.settings()) !== JSON.stringify(this.original()),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId']) return;
    this.store.selectContext(this.projectId(), this.databaseId());
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  protected groupEntries(group: SettingsGroup): SettingsEntry[] {
    return entries(this.settings()?.[group], [group]);
  }

  protected update(path: string[], rawValue: TableValue): void {
    const number = Number(rawValue);
    if (!Number.isFinite(number)) return;
    this.settings.update((current) => {
      if (!current) return current;
      const next = structuredClone(current) as unknown as Record<string, unknown>;
      let target = next;
      for (const key of path.slice(0, -1)) {
        const child = target[key];
        if (!child || typeof child !== 'object' || Array.isArray(child)) return current;
        target = child as Record<string, unknown>;
      }
      const last = path.at(-1);
      if (!last) return current;
      target[last] = typeof target[last] === 'boolean' ? Boolean(number) : number;
      return next as unknown as DatabaseObjectSettings;
    });
  }

  protected reset(): void {
    const original = this.original();
    if (original) this.settings.set(structuredClone(original));
  }

  protected async save(): Promise<void> {
    const settings = this.settings();
    if (!settings) return;
    try {
      const saved = await this.store.operation(() =>
        this.desktop.saveDatabaseObjectSettings(this.databaseId(), settings),
      );
      this.settings.set(structuredClone(saved));
      this.original.set(structuredClone(saved));
    } catch {
      // The store exposes the error.
    }
  }

  protected async restoreDefaults(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Restore object settings?',
            message: 'All generation and randomization settings for this database will be reset.',
            confirmLabel: 'Restore defaults',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    try {
      const restored = await this.store.operation(() =>
        this.desktop.restoreDatabaseObjectSettings(this.databaseId()),
      );
      this.settings.set(structuredClone(restored));
      this.original.set(structuredClone(restored));
    } catch {
      // The store exposes the error.
    }
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.store.operation(() =>
        this.desktop.getDatabaseObjectSettings(this.databaseId()),
      );
      this.settings.set(structuredClone(settings));
      this.original.set(structuredClone(settings));
    } catch {
      // The store exposes the error.
    }
  }
}
