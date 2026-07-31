import { DOCUMENT } from '@angular/common';
import { computed, inject, Service, signal } from '@angular/core';
import type {
  EntityKind,
  ExportColumnMapping,
  ExportColumnSelection,
  ExportFieldNameConfiguration,
  ExportFieldNamePresetPreference,
  ExportFieldNameStyle,
  ExportVisibilityPresetPreference,
} from '../../../shared/downloader/contracts';
import {
  camelCaseExportFieldNames,
  cloneExportColumns,
  cloneExportFieldNames,
  createExportFieldNames,
  defaultExportColumns,
  exportColumnDefinitions,
  exportEntityKinds,
  exportFieldNamePattern,
  fullExportColumns,
  reservedExportFieldNames,
  snakeCaseExportFieldNames,
  validateExportColumns,
  validateExportFieldNames,
} from '../../../shared/downloader/export-schema';
import { DesktopApi } from './downloader-api';

export const EXPORT_COLUMN_PRESETS_STORAGE_KEY = 'qdb-downloader.export-column-presets';
export const defaultExportVisibilityPresetId = 'default';
export const fullExportVisibilityPresetId = 'full';
export const camelCaseExportFieldNamePresetId = 'camel-case';
export const snakeCaseExportFieldNamePresetId = 'snake-case';

export interface ExportVisibilityPreset extends ExportVisibilityPresetPreference {
  builtIn: boolean;
}

export interface ExportFieldNamePreset extends ExportFieldNamePresetPreference {
  builtIn: boolean;
}

interface LegacyPresetCollection {
  version: 1 | 2;
  presets: readonly LegacyPreset[];
}

interface LegacyPreset {
  id: string;
  name: string;
  columns: unknown;
}

const builtInVisibilityPresets = (): readonly ExportVisibilityPreset[] => [
  {
    id: defaultExportVisibilityPresetId,
    name: 'Default',
    columns: defaultExportColumns(),
    builtIn: true,
  },
  {
    id: fullExportVisibilityPresetId,
    name: 'Full',
    columns: fullExportColumns(),
    builtIn: true,
  },
];

const builtInFieldNamePresets = (): readonly ExportFieldNamePreset[] => [
  {
    id: camelCaseExportFieldNamePresetId,
    name: 'Camel case',
    fieldNames: camelCaseExportFieldNames(),
    builtIn: true,
  },
  {
    id: snakeCaseExportFieldNamePresetId,
    name: 'Snake case',
    fieldNames: snakeCaseExportFieldNames(),
    builtIn: true,
  },
];

const uniqueName = (name: string, existing: ReadonlySet<string>): string => {
  if (!existing.has(name.toLocaleLowerCase())) return name;
  let candidate = `${name} (custom)`;
  let suffix = 2;
  while (existing.has(candidate.toLocaleLowerCase())) {
    candidate = `${name} (custom ${suffix++})`;
  }
  return candidate;
};

@Service()
export class ExportColumnPresetsService {
  private readonly document = inject(DOCUMENT);
  private readonly desktopApi = inject(DesktopApi);
  private readonly customVisibilityPresets = signal<readonly ExportVisibilityPresetPreference[]>(
    [],
  );
  private readonly customFieldNamePresets = signal<readonly ExportFieldNamePresetPreference[]>([]);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | undefined>(undefined);

  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly visibilityPresets = computed<readonly ExportVisibilityPreset[]>(() => [
    ...builtInVisibilityPresets(),
    ...this.customVisibilityPresets().map(({ id, name, columns }) => ({
      id,
      name,
      columns: cloneExportColumns(columns),
      builtIn: false,
    })),
  ]);
  readonly fieldNamePresets = computed<readonly ExportFieldNamePreset[]>(() => [
    ...builtInFieldNamePresets(),
    ...this.customFieldNamePresets().map(({ id, name, fieldNames }) => ({
      id,
      name,
      fieldNames: cloneExportFieldNames(fieldNames),
      builtIn: false,
    })),
  ]);

  private readonly initialization = this.initialize();

  whenInitialized(): Promise<void> {
    return this.initialization;
  }

  async createVisibility(
    name: string,
    columns: ExportColumnSelection,
  ): Promise<ExportVisibilityPreset | undefined> {
    const normalizedName = name.trim();
    if (
      !normalizedName ||
      normalizedName.length > 60 ||
      this.hasVisibilityName(normalizedName) ||
      validateExportColumns(columns).length > 0
    ) {
      return undefined;
    }
    const preset: ExportVisibilityPresetPreference = {
      id: `custom-${globalThis.crypto.randomUUID()}`,
      name: normalizedName,
      columns: cloneExportColumns(columns),
    };
    const persisted = await this.persistVisibility([...this.customVisibilityPresets(), preset]);
    if (!persisted) return undefined;
    return { ...preset, columns: cloneExportColumns(preset.columns), builtIn: false };
  }

  async updateVisibility(
    id: string,
    name: string,
    columns: ExportColumnSelection,
  ): Promise<boolean> {
    const normalizedName = name.trim();
    if (
      builtInVisibilityPresets().some((preset) => preset.id === id) ||
      !normalizedName ||
      normalizedName.length > 60 ||
      this.hasVisibilityName(normalizedName, id) ||
      validateExportColumns(columns).length > 0 ||
      !this.customVisibilityPresets().some((preset) => preset.id === id)
    ) {
      return false;
    }
    return this.persistVisibility(
      this.customVisibilityPresets().map((preset) =>
        preset.id === id
          ? { ...preset, name: normalizedName, columns: cloneExportColumns(columns) }
          : preset,
      ),
    );
  }

  async deleteVisibility(id: string): Promise<boolean> {
    const next = this.customVisibilityPresets().filter((preset) => preset.id !== id);
    return next.length !== this.customVisibilityPresets().length && this.persistVisibility(next);
  }

  async createFieldNames(
    name: string,
    fieldNames: ExportFieldNameConfiguration,
  ): Promise<ExportFieldNamePreset | undefined> {
    const normalizedName = name.trim();
    if (
      !normalizedName ||
      normalizedName.length > 60 ||
      this.hasFieldNameName(normalizedName) ||
      validateExportFieldNames(fieldNames).length > 0
    ) {
      return undefined;
    }
    const preset: ExportFieldNamePresetPreference = {
      id: `custom-${globalThis.crypto.randomUUID()}`,
      name: normalizedName,
      fieldNames: cloneExportFieldNames(fieldNames),
    };
    const persisted = await this.persistFieldNames([...this.customFieldNamePresets(), preset]);
    if (!persisted) return undefined;
    return {
      ...preset,
      fieldNames: cloneExportFieldNames(preset.fieldNames),
      builtIn: false,
    };
  }

  async updateFieldNames(
    id: string,
    name: string,
    fieldNames: ExportFieldNameConfiguration,
  ): Promise<boolean> {
    const normalizedName = name.trim();
    if (
      builtInFieldNamePresets().some((preset) => preset.id === id) ||
      !normalizedName ||
      normalizedName.length > 60 ||
      this.hasFieldNameName(normalizedName, id) ||
      validateExportFieldNames(fieldNames).length > 0 ||
      !this.customFieldNamePresets().some((preset) => preset.id === id)
    ) {
      return false;
    }
    return this.persistFieldNames(
      this.customFieldNamePresets().map((preset) =>
        preset.id === id
          ? { ...preset, name: normalizedName, fieldNames: cloneExportFieldNames(fieldNames) }
          : preset,
      ),
    );
  }

  async deleteFieldNames(id: string): Promise<boolean> {
    const next = this.customFieldNamePresets().filter((preset) => preset.id !== id);
    return next.length !== this.customFieldNamePresets().length && this.persistFieldNames(next);
  }

  hasVisibilityName(name: string, excludedId?: string): boolean {
    const normalizedName = name.toLocaleLowerCase();
    return this.visibilityPresets().some(
      (preset) => preset.id !== excludedId && preset.name.toLocaleLowerCase() === normalizedName,
    );
  }

  hasFieldNameName(name: string, excludedId?: string): boolean {
    const normalizedName = name.toLocaleLowerCase();
    return this.fieldNamePresets().some(
      (preset) => preset.id !== excludedId && preset.name.toLocaleLowerCase() === normalizedName,
    );
  }

  private async initialize(): Promise<void> {
    const [visibilityResult, fieldNameResult] = await Promise.all([
      this.desktopApi.getExportVisibilityPresets(),
      this.desktopApi.getExportFieldNamePresets(),
    ]);
    const legacy = this.readLegacyCollection();
    const migrated = legacy ? this.splitLegacyCollection(legacy) : undefined;
    let visibilityInitialized = false;
    let fieldNamesInitialized = false;

    if (visibilityResult.ok && visibilityResult.value !== undefined) {
      this.customVisibilityPresets.set(visibilityResult.value);
      visibilityInitialized = true;
    } else if (visibilityResult.ok) {
      const persisted = await this.persistVisibility(migrated?.visibility ?? []);
      visibilityInitialized = persisted;
      if (!persisted && migrated) this.customVisibilityPresets.set(migrated.visibility);
    } else if (migrated) {
      this.customVisibilityPresets.set(migrated.visibility);
    }

    if (fieldNameResult.ok && fieldNameResult.value !== undefined) {
      this.customFieldNamePresets.set(fieldNameResult.value);
      fieldNamesInitialized = true;
    } else if (fieldNameResult.ok) {
      const persisted = await this.persistFieldNames(migrated?.fieldNames ?? []);
      fieldNamesInitialized = persisted;
      if (!persisted && migrated) this.customFieldNamePresets.set(migrated.fieldNames);
    } else if (migrated) {
      this.customFieldNamePresets.set(migrated.fieldNames);
    }

    if (legacy && visibilityInitialized && fieldNamesInitialized) {
      try {
        this.document.defaultView?.localStorage.removeItem(EXPORT_COLUMN_PRESETS_STORAGE_KEY);
      } catch {
        // The SQLite migration is complete even when legacy storage is unavailable.
      }
    }
    if (!visibilityInitialized || !fieldNamesInitialized) {
      this.errorState.set('Export presets could not be loaded or saved.');
    }
    this.loadingState.set(false);
  }

  private async persistVisibility(
    presets: readonly ExportVisibilityPresetPreference[],
  ): Promise<boolean> {
    const result = await this.desktopApi.updateExportVisibilityPresets(
      presets.map(({ id, name, columns }) => ({
        id,
        name,
        columns: cloneExportColumns(columns),
      })),
    );
    if (!result.ok) {
      this.errorState.set(result.error.message);
      return false;
    }
    this.customVisibilityPresets.set(result.value);
    this.errorState.set(undefined);
    return true;
  }

  private async persistFieldNames(
    presets: readonly ExportFieldNamePresetPreference[],
  ): Promise<boolean> {
    const result = await this.desktopApi.updateExportFieldNamePresets(
      presets.map(({ id, name, fieldNames }) => ({
        id,
        name,
        fieldNames: cloneExportFieldNames(fieldNames),
      })),
    );
    if (!result.ok) {
      this.errorState.set(result.error.message);
      return false;
    }
    this.customFieldNamePresets.set(result.value);
    this.errorState.set(undefined);
    return true;
  }

  private readLegacyCollection(): LegacyPresetCollection | undefined {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(
        EXPORT_COLUMN_PRESETS_STORAGE_KEY,
      );
      if (!stored) return undefined;
      const value: unknown = JSON.parse(stored);
      if (typeof value !== 'object' || value === null) return undefined;
      const candidate = value as Record<string, unknown>;
      if (
        (candidate['version'] !== 1 && candidate['version'] !== 2) ||
        !Array.isArray(candidate['presets'])
      ) {
        return undefined;
      }
      return {
        version: candidate['version'],
        presets: candidate['presets'].filter(this.isLegacyPreset),
      };
    } catch {
      return undefined;
    }
  }

  private readonly isLegacyPreset = (value: unknown): value is LegacyPreset => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate['id'] === 'string' &&
      candidate['id'].startsWith('custom-') &&
      typeof candidate['name'] === 'string' &&
      typeof candidate['columns'] === 'object' &&
      candidate['columns'] !== null
    );
  };

  private splitLegacyCollection(collection: LegacyPresetCollection): {
    visibility: ExportVisibilityPresetPreference[];
    fieldNames: ExportFieldNamePresetPreference[];
  } {
    const visibility: ExportVisibilityPresetPreference[] = [];
    const fieldNames: ExportFieldNamePresetPreference[] = [];
    const ids = new Set<string>();
    const visibilityNames = new Set(
      builtInVisibilityPresets().map(({ name }) => name.toLocaleLowerCase()),
    );
    const fieldNameNames = new Set(
      builtInFieldNamePresets().map(({ name }) => name.toLocaleLowerCase()),
    );
    for (const preset of collection.presets) {
      const originalName = preset.name.trim();
      if (!originalName || ids.has(preset.id)) continue;
      ids.add(preset.id);
      const visibilityName = uniqueName(originalName, visibilityNames);
      const fieldNameName = uniqueName(originalName, fieldNameNames);
      visibilityNames.add(visibilityName.toLocaleLowerCase());
      fieldNameNames.add(fieldNameName.toLocaleLowerCase());
      visibility.push({
        id: preset.id,
        name: visibilityName,
        columns: this.legacyVisibility(preset.columns, collection.version),
      });
      fieldNames.push({
        id: preset.id,
        name: fieldNameName,
        fieldNames: this.legacyFieldNames(preset.columns, collection.version),
      });
    }
    return { visibility, fieldNames };
  }

  private legacyVisibility(value: unknown, version: 1 | 2): ExportColumnSelection {
    const source =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const defaults = defaultExportColumns();
    return {
      leagues: this.legacySelectedKeys('leagues', source['leagues'], defaults.leagues, version),
      teams: this.legacySelectedKeys('teams', source['teams'], defaults.teams, version),
      players: this.legacySelectedKeys('players', source['players'], defaults.players, version),
    };
  }

  private legacySelectedKeys<Entity extends EntityKind>(
    entity: Entity,
    value: unknown,
    fallback: ExportColumnSelection[Entity],
    version: 1 | 2,
  ): ExportColumnSelection[Entity] {
    if (!Array.isArray(value)) return [...fallback] as ExportColumnSelection[Entity];
    const selected = new Set(
      value.flatMap((item) => {
        if (version === 1 && typeof item === 'string') return [item];
        if (typeof item !== 'object' || item === null) return [];
        const sourceKey = (item as Record<string, unknown>)['sourceKey'];
        return typeof sourceKey === 'string' ? [sourceKey] : [];
      }),
    );
    const normalized = exportColumnDefinitions[entity]
      .filter(({ key }) => selected.has(key))
      .map(({ key }) => key) as ExportColumnSelection[Entity];
    return normalized.length > 0 ? normalized : ([...fallback] as ExportColumnSelection[Entity]);
  }

  private legacyFieldNames(value: unknown, version: 1 | 2): ExportFieldNameConfiguration {
    const source =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const style: ExportFieldNameStyle =
      version === 2 && source['nameStyle'] === 'snake_case' ? 'snake_case' : 'camelCase';
    const fieldNames = createExportFieldNames(style);
    if (version === 1) return fieldNames;
    for (const entity of exportEntityKinds) {
      this.applyLegacyAliases(entity, fieldNames, source[entity]);
    }
    return validateExportFieldNames(fieldNames).length === 0
      ? fieldNames
      : createExportFieldNames(style);
  }

  private applyLegacyAliases<Entity extends EntityKind>(
    entity: Entity,
    fieldNames: ExportFieldNameConfiguration,
    value: unknown,
  ): void {
    if (!Array.isArray(value)) return;
    const aliases = new Map<string, string>();
    const allowed = new Set<string>(exportColumnDefinitions[entity].map(({ key }) => key));
    const reserved = new Set(reservedExportFieldNames.map((name) => name.toLocaleLowerCase()));
    const aliasNames = new Set<string>();
    for (const item of value) {
      if (typeof item !== 'object' || item === null) continue;
      const mapping = item as Record<string, unknown>;
      const sourceKey = mapping['sourceKey'];
      const outputName = mapping['outputName'];
      if (
        typeof sourceKey !== 'string' ||
        typeof outputName !== 'string' ||
        !allowed.has(sourceKey) ||
        !exportFieldNamePattern.test(outputName) ||
        reserved.has(outputName.toLocaleLowerCase()) ||
        aliasNames.has(outputName.toLocaleLowerCase())
      ) {
        continue;
      }
      aliases.set(sourceKey, outputName);
      aliasNames.add(outputName.toLocaleLowerCase());
    }
    const used = new Set(aliasNames);
    fieldNames[entity] = (fieldNames[entity] as ExportColumnMapping[]).map((mapping) => {
      const alias = aliases.get(mapping.sourceKey);
      if (alias) return { ...mapping, outputName: alias };
      let outputName = mapping.outputName;
      if (used.has(outputName.toLocaleLowerCase())) {
        const baseName = `${outputName}_field`;
        outputName = baseName;
        let suffix = 2;
        while (used.has(outputName.toLocaleLowerCase())) {
          outputName = `${baseName}_${suffix++}`;
        }
      }
      used.add(outputName.toLocaleLowerCase());
      return { ...mapping, outputName };
    }) as ExportFieldNameConfiguration[Entity];
  }
}
