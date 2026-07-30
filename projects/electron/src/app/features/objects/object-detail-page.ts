import {
  Component,
  computed,
  inject,
  input,
  type OnChanges,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule, type MatSelectionListChange } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type {
  DatabaseObjectSettings,
  ObjectDetail,
  ObjectKind,
  ObjectReference,
  ObjectSection,
  TableRowValues,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';
import { OBJECT_CONFIG } from './object-config';
import { CITY_PRESETS } from './team-location-data';
import { ObjectValueField } from './object-value-field';
import type { ObjectDirtyComponent } from './object-unsaved.guard';

@Component({
  selector: 'app-object-detail-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatSelectModule,
    MatTabsModule,
    NgOptimizedImage,
    ObjectValueField,
    PageHeader,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './object-detail-page.html',
  styleUrl: './object-detail-page.css',
})
export class ObjectDetailPage implements OnChanges, ObjectDirtyComponent {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  readonly projectId = input.required<string>();
  readonly databaseId = input.required<string>();
  readonly kind = input.required<ObjectKind>();
  readonly id = input.required<number, string | number>({ transform: Number });
  readonly section = input.required<ObjectSection>();
  protected readonly detail = signal<ObjectDetail | undefined>(undefined);
  protected readonly values = signal<TableRowValues>({});
  protected readonly relationIds = signal<number[]>([]);
  protected readonly related = signal<ObjectReference[]>([]);
  private readonly objectSettings = signal<DatabaseObjectSettings | undefined>(undefined);
  protected readonly dirty = signal(false);
  protected readonly config = computed(() => OBJECT_CONFIG[this.kind()]);
  protected readonly cityPresets = CITY_PRESETS;
  protected readonly stadiumImageUrl = computed(() => {
    if (this.kind() !== 'teams' || this.section() !== 'stadium') return undefined;
    const stadiumId = Number(this.values()['stadiumid']);
    return stadiumId > 0 ? `stadiums/600x233/${stadiumId}.png` : undefined;
  });
  protected readonly mapPosition = computed(() => {
    const latitude = Number(this.values()['latitude'] ?? 0);
    const longitude = Number(this.values()['longitude'] ?? 0);
    return {
      left: `${Math.min(100, Math.max(0, ((longitude + 180) / 360) * 100))}%`,
      top: `${Math.min(100, Math.max(0, ((90 - latitude) / 180) * 100))}%`,
    };
  });
  private loadSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      !changes['projectId'] &&
      !changes['databaseId'] &&
      !changes['kind'] &&
      !changes['id'] &&
      !changes['section']
    )
      return;
    this.store.selectContext(this.projectId(), this.databaseId());
    this.detail.set(undefined);
    this.dirty.set(false);
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  protected fieldValue(name: string, fallback: TableValue): TableValue {
    return this.values()[name] ?? fallback;
  }

  protected updateValue(name: string, value: TableValue): void {
    if (this.values()[name] === value) return;
    this.values.update((current) => ({ ...current, [name]: value }));
    this.dirty.set(true);
  }

  protected locationPresetChanged(index: number): void {
    const preset = this.cityPresets[index];
    if (!preset) return;
    this.values.update((current) => ({
      ...current,
      latitude: preset.latitude,
      longitude: preset.longitude,
      utcoffset: preset.utcoffset,
    }));
    this.dirty.set(true);
  }

  protected relationsChanged(event: MatSelectionListChange): void {
    this.relationIds.set(
      event.source.selectedOptions.selected.map((option) => Number(option.value)),
    );
    this.dirty.set(true);
  }

  protected relationSelected(id: number): boolean {
    return this.relationIds().includes(id);
  }

  protected updateRelated(id: number, name: string, value: TableValue): void {
    this.related.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, values: { ...item.values, [name]: value } } : item,
      ),
    );
    this.dirty.set(true);
  }

  protected reset(): void {
    const detail = this.detail();
    if (!detail) return;
    this.values.set({ ...detail.values });
    this.relationIds.set([...detail.relationIds]);
    this.related.set(detail.related.map((item) => ({ ...item, values: { ...item.values } })));
    this.dirty.set(false);
  }

  protected randomize(): void {
    const detail = this.detail();
    if (!detail || detail.readOnly) return;
    const randomized = Object.fromEntries(
      detail.fields.map((field) => {
        if (field.type === 'string') return [field.name, this.fieldValue(field.name, '')];
        const min = field.range?.min ?? 0;
        const max = field.range?.max ?? 100;
        const value =
          field.type === 'int'
            ? Math.round(min + Math.random() * (max - min))
            : min + Math.random() * (max - min);
        return [field.name, value];
      }),
    );
    const settings = this.objectSettings();
    if (settings) {
      const weighted: Record<string, Record<string, number>> = {
        foulstrictness: settings.referee.foulsStyle,
        cardstrictness: settings.referee.cardsStyle,
        jerseysleevelengthcode:
          this.kind() === 'referees'
            ? settings.referee.jerseySleeve
            : settings.kit.jerseySleeveLength,
        shoetypecode: settings.shoes.shoeType,
        jerseyfit: settings.kit.jerseyFit,
        jerseystylecode: settings.kit.jerseyStyle,
        socklengthcode: settings.kit.sockLength,
        buspositioning: settings.tactics.busPositioning,
        ccpositioning: settings.tactics.ccPositioning,
        defdefenderline: settings.tactics.defDefenderLine,
        animfreekickstartposcode: settings.animations.freeKickStart,
        animpenaltiesstartposcode: settings.animations.penaltiesStart,
        animpenaltiesmotionstylecode: settings.animations.penaltiesMotionStyle,
        animpenaltieskickstylecode: settings.animations.penaltiesKickStyle,
      };
      for (const [name, weights] of Object.entries(weighted))
        if (name in randomized) randomized[name] = this.weightedChoice(weights);
      if ('trait1' in randomized)
        randomized['trait1'] = this.randomTraitMask(
          this.kind() === 'teams' ? settings.traits.teamTraits : settings.traits.playerTraits,
        );
      if ('playerjointeamdate' in randomized)
        randomized['playerjointeamdate'] = settings.dates.date;
    }
    this.values.update((current) => ({ ...current, ...randomized }));
    this.dirty.set(true);
  }

  protected async save(acceptWarnings: boolean): Promise<void> {
    const detail = this.detail();
    if (!detail || detail.readOnly) return;
    try {
      const result = await this.store.operation(() =>
        this.desktop.saveObject({
          databaseId: this.databaseId(),
          kind: this.kind(),
          id: this.id(),
          section: this.section(),
          values: this.values(),
          relationIds: this.relationIds(),
          related: this.related().map((item) => ({ id: item.id, values: item.values })),
          acceptWarnings,
        }),
      );
      if (result.warnings.length && !acceptWarnings) {
        const confirmed = await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Save with validation warnings?',
                message: result.warnings.map((warning) => warning.message).join(' '),
                confirmLabel: 'Save anyway',
              },
            })
            .afterClosed(),
        );
        if (confirmed) await this.save(true);
        return;
      }
      await Promise.all([this.load(), this.store.refreshTables(this.databaseId())]);
    } catch {
      // The store exposes the error.
    }
  }

  protected relatedDestination(): ObjectKind | undefined {
    if (this.kind() === 'leagues' && this.section() === 'teams') return 'teams';
    if (this.kind() === 'leagues' && this.section() === 'referees') return 'referees';
    if (this.kind() === 'teams' && ['players', 'jersey-numbers'].includes(this.section()))
      return 'players';
    return undefined;
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    try {
      const [detail, settings] = await this.store.operation(() =>
        Promise.all([
          this.desktop.readObject({
            databaseId: this.databaseId(),
            kind: this.kind(),
            id: this.id(),
            section: this.section(),
          }),
          this.desktop.getDatabaseObjectSettings(this.databaseId()),
        ]),
      );
      if (sequence !== this.loadSequence) return;
      this.detail.set(detail);
      this.values.set({ ...detail.values });
      this.relationIds.set([...detail.relationIds]);
      this.related.set(detail.related.map((item) => ({ ...item, values: { ...item.values } })));
      this.objectSettings.set(settings);
      this.dirty.set(false);
    } catch {
      // The store exposes the error.
    }
  }

  private weightedChoice(weights: Record<string, number>): number {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!total) return Number(entries[0]?.[0] ?? 0);
    let value = Math.random() * total;
    for (const [key, weight] of entries) {
      value -= weight;
      if (value <= 0) return Number(key);
    }
    return Number(entries.at(-1)?.[0] ?? 0);
  }

  private randomTraitMask(weights: Record<string, number>): number {
    const count = this.weightedChoice(weights);
    const bits = new Set<number>();
    while (bits.size < Math.min(30, count)) bits.add(Math.floor(Math.random() * 30));
    return [...bits].reduce((mask, bit) => mask | (1 << bit), 0);
  }
}
