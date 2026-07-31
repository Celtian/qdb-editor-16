export interface ColumnDefinition {
  readonly key: string;
  readonly label: string;
  readonly defaultVisible: boolean;
  readonly required: boolean;
}

export interface ColumnPreference {
  readonly version: number;
  readonly order: readonly string[];
  readonly visible: readonly string[];
}

export type ColumnVisibility = Record<string, boolean>;

export function toColumnVisibility(
  columns: readonly ColumnDefinition[],
  visibleColumns: readonly string[],
): ColumnVisibility {
  const visible = new Set(visibleColumns);
  return Object.fromEntries(columns.map(({ key }) => [key, visible.has(key)]));
}

export function fromColumnVisibility(
  definitions: readonly ColumnDefinition[],
  visibility: ColumnVisibility,
): string[] {
  return definitions
    .filter((column) => column.required || visibility[column.key])
    .map((column) => column.key);
}
