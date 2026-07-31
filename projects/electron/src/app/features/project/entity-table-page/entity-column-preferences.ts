import { Service } from '@angular/core';
import type { EntityKind } from '../../../../../shared/downloader/contracts';
import type { ColumnPreference } from '../entity-column-editor/column-layout';
import {
  columnsByEntity,
  defaultColumnPreference,
  type EntityColumnPreference,
  type EntityColumnKey,
} from './entity-table-columns';

export const entityColumnPreferenceKey = (entity: EntityKind): string =>
  `qdb-downloader.visible-columns.${entity}`;

const entityKinds = ['leagues', 'teams', 'players'] as const satisfies readonly EntityKind[];

@Service()
export class EntityColumnPreferences {
  load(entity: EntityKind): EntityColumnPreference {
    const defaults = defaultColumnPreference(entity);
    try {
      const stored = window.localStorage.getItem(entityColumnPreferenceKey(entity));
      if (stored === null) return defaults;
      const value: unknown = JSON.parse(stored);
      if (Array.isArray(value)) return this.normalize(entity, defaults.order, value, false);
      if (!this.isStoredPreference(value)) return defaults;
      return this.normalize(entity, value.order, value.visible, true);
    } catch {
      return defaults;
    }
  }

  save(entity: EntityKind, preference: ColumnPreference): void {
    try {
      window.localStorage.setItem(
        entityColumnPreferenceKey(entity),
        JSON.stringify(this.normalize(entity, preference.order, preference.visible, true)),
      );
    } catch {
      // Column preferences are optional when local storage is unavailable.
    }
  }

  reset(entity: EntityKind): boolean {
    try {
      window.localStorage.removeItem(entityColumnPreferenceKey(entity));
      return true;
    } catch {
      return false;
    }
  }

  resetAll(): boolean {
    try {
      for (const entity of entityKinds) {
        window.localStorage.removeItem(entityColumnPreferenceKey(entity));
      }
      return true;
    } catch {
      return false;
    }
  }

  private isStoredPreference(
    value: unknown,
  ): value is { version: 2; order: unknown[]; visible: unknown[] } {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate['version'] === 2 &&
      Array.isArray(candidate['order']) &&
      Array.isArray(candidate['visible'])
    );
  }

  private normalize(
    entity: EntityKind,
    orderValues: readonly unknown[],
    visibleValues: readonly unknown[],
    showNewDefaults: boolean,
  ): EntityColumnPreference {
    const definitions = columnsByEntity[entity];
    const validKeys = new Set(definitions.map((column) => column.key));
    const order: EntityColumnKey[] = [];
    const ordered = new Set<EntityColumnKey>();
    const toCurrentKey = (value: unknown): EntityColumnKey | undefined => {
      const renamed = value === 'externalId' ? 'sourceId' : value;
      return typeof renamed === 'string' && validKeys.has(renamed as EntityColumnKey)
        ? (renamed as EntityColumnKey)
        : undefined;
    };

    for (const value of orderValues) {
      const key = toCurrentKey(value);
      if (!key) continue;
      if (ordered.has(key)) continue;
      ordered.add(key);
      order.push(key);
    }

    const selected = new Set(
      visibleValues.map(toCurrentKey).filter((value): value is EntityColumnKey => Boolean(value)),
    );
    for (const column of definitions) {
      if (!ordered.has(column.key)) {
        if (column.key === 'badge') {
          const nameIndex = order.indexOf('name');
          order.splice(nameIndex < 0 ? 0 : nameIndex + 1, 0, column.key);
        } else if (column.key === 'leagueCountry' || column.key === 'teamCountry') {
          const sourceIndex = order.indexOf('sourceName');
          order.splice(sourceIndex < 0 ? order.length : sourceIndex + 1, 0, column.key);
        } else if (column.key === 'tier') {
          const countryIndex = order.indexOf('leagueCountry');
          order.splice(countryIndex < 0 ? order.length : countryIndex + 1, 0, column.key);
        } else if (column.key === 'weight') {
          const heightIndex = order.indexOf('height');
          order.splice(heightIndex < 0 ? order.length : heightIndex + 1, 0, column.key);
        } else {
          order.push(column.key);
        }
        ordered.add(column.key);
        if (showNewDefaults && column.defaultVisible) selected.add(column.key);
      }
      if (column.required) selected.add(column.key);
    }

    return {
      version: 2,
      order,
      visible: order.filter((column) => selected.has(column)),
    };
  }
}
