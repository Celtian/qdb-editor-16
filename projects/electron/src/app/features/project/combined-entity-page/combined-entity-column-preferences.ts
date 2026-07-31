import { Service } from '@angular/core';
import type { CombinedEntityKind } from '../../../../../shared/downloader/contracts';
import type { ColumnPreference } from '../entity-column-editor/column-layout';
import {
  combinedColumnsByEntity,
  defaultCombinedColumnPreference,
  type CombinedEntityColumnKey,
} from './combined-entity-columns';

export const combinedEntityColumnPreferenceKey = (entity: CombinedEntityKind): string =>
  `qdb-downloader.visible-columns.combined.${entity}`;

const entityKinds = [
  'leagues',
  'teams',
  'players',
] as const satisfies readonly CombinedEntityKind[];

@Service()
export class CombinedEntityColumnPreferences {
  load(entity: CombinedEntityKind): ColumnPreference {
    const defaults = defaultCombinedColumnPreference(entity);
    try {
      const stored = window.localStorage.getItem(combinedEntityColumnPreferenceKey(entity));
      if (stored === null) return defaults;
      const value: unknown = JSON.parse(stored);
      if (!this.isStoredPreference(value)) return defaults;
      return this.normalize(entity, value.order, value.visible, true);
    } catch {
      return defaults;
    }
  }

  save(entity: CombinedEntityKind, preference: ColumnPreference): void {
    try {
      window.localStorage.setItem(
        combinedEntityColumnPreferenceKey(entity),
        JSON.stringify(this.normalize(entity, preference.order, preference.visible, true)),
      );
    } catch {
      // Column preferences are optional when local storage is unavailable.
    }
  }

  reset(entity: CombinedEntityKind): boolean {
    try {
      window.localStorage.removeItem(combinedEntityColumnPreferenceKey(entity));
      return true;
    } catch {
      return false;
    }
  }

  resetAll(): boolean {
    try {
      for (const entity of entityKinds) {
        window.localStorage.removeItem(combinedEntityColumnPreferenceKey(entity));
      }
      return true;
    } catch {
      return false;
    }
  }

  private isStoredPreference(
    value: unknown,
  ): value is { version: 1; order: unknown[]; visible: unknown[] } {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      candidate['version'] === 1 &&
      Array.isArray(candidate['order']) &&
      Array.isArray(candidate['visible'])
    );
  }

  private normalize(
    entity: CombinedEntityKind,
    orderValues: readonly unknown[],
    visibleValues: readonly unknown[],
    showNewDefaults: boolean,
  ): ColumnPreference {
    const definitions = combinedColumnsByEntity[entity];
    const defaultOrder = definitions.map(({ key }) => key);
    const validKeys = new Set(defaultOrder);
    const order: CombinedEntityColumnKey[] = [];
    const ordered = new Set<CombinedEntityColumnKey>();
    const toCurrentKey = (value: unknown): CombinedEntityColumnKey | undefined =>
      typeof value === 'string' && validKeys.has(value as CombinedEntityColumnKey)
        ? (value as CombinedEntityColumnKey)
        : undefined;

    for (const value of orderValues) {
      const key = toCurrentKey(value);
      if (!key || ordered.has(key)) continue;
      ordered.add(key);
      order.push(key);
    }

    const selected = new Set(
      visibleValues.map(toCurrentKey).filter((value): value is CombinedEntityColumnKey => !!value),
    );
    for (const column of definitions) {
      if (!ordered.has(column.key)) {
        this.insertInDefaultOrder(order, defaultOrder, column.key);
        ordered.add(column.key);
        if (showNewDefaults && column.defaultVisible) selected.add(column.key);
      }
      if (column.required) selected.add(column.key);
    }

    return {
      version: 1,
      order,
      visible: order.filter((key) => selected.has(key)),
    };
  }

  private insertInDefaultOrder(
    order: CombinedEntityColumnKey[],
    defaultOrder: readonly CombinedEntityColumnKey[],
    key: CombinedEntityColumnKey,
  ): void {
    const defaultIndex = defaultOrder.indexOf(key);
    for (let index = defaultIndex - 1; index >= 0; index -= 1) {
      const previousIndex = order.indexOf(defaultOrder[index]);
      if (previousIndex >= 0) {
        order.splice(previousIndex + 1, 0, key);
        return;
      }
    }
    for (let index = defaultIndex + 1; index < defaultOrder.length; index += 1) {
      const nextIndex = order.indexOf(defaultOrder[index]);
      if (nextIndex >= 0) {
        order.splice(nextIndex, 0, key);
        return;
      }
    }
    order.push(key);
  }
}
