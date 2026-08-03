import {
  type FieldConflict,
  type FieldResolution,
  type FieldResolutions,
  type PlayerInput,
  type PlayerMatchGroup,
  type PlayerSourceRecord,
  type SourceName,
  sourceNames,
} from './contracts.js';

export const defaultSourcePriority = [...sourceNames];

export const normalizeSourcePriority = (value: unknown): SourceName[] => {
  if (!Array.isArray(value)) return [...defaultSourcePriority];
  const unique = new Set(value);
  return value.length === sourceNames.length &&
    unique.size === sourceNames.length &&
    value.every((sourceName) => sourceNames.includes(sourceName as SourceName))
    ? (value as SourceName[])
    : [...defaultSourcePriority];
};

export const normalizePersonName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const supportingMatches = (left: PlayerSourceRecord, right: PlayerSourceRecord): number => {
  let matches = 0;
  if (left.countryCode3 && right.countryCode3 && left.countryCode3 === right.countryCode3) {
    matches += 1;
  }
  if (
    left.height !== undefined &&
    right.height !== undefined &&
    Math.abs(left.height - right.height) <= 1
  ) {
    matches += 1;
  }
  if (left.positionDetail && right.positionDetail && left.positionDetail === right.positionDetail) {
    matches += 1;
  }
  if (left.foot && right.foot && left.foot === right.foot) matches += 1;
  return matches;
};

export const isStrongPlayerMatch = (
  left: PlayerSourceRecord,
  right: PlayerSourceRecord,
): boolean => {
  if (left.sourceName === right.sourceName) return false;
  if (normalizePersonName(left.name) !== normalizePersonName(right.name)) return false;
  if (left.birthdate && right.birthdate) return left.birthdate === right.birthdate;
  return supportingMatches(left, right) >= 2;
};

const componentFrom = (
  start: PlayerSourceRecord,
  remaining: Map<string, PlayerSourceRecord>,
): PlayerSourceRecord[] => {
  const component: PlayerSourceRecord[] = [];
  const pending = [start];
  while (pending.length) {
    const current = pending.pop();
    if (!current || !remaining.delete(current.id)) continue;
    component.push(current);
    for (const candidate of remaining.values()) {
      if (isStrongPlayerMatch(current, candidate)) pending.push(candidate);
    }
  }
  return component;
};

export const identifyPlayers = (
  players: readonly PlayerSourceRecord[],
  priority: readonly SourceName[],
): PlayerMatchGroup[] => {
  const priorityIndex = new Map(priority.map((sourceName, index) => [sourceName, index]));
  const sorted = [...players].sort(
    (left, right) =>
      (priorityIndex.get(left.sourceName) ?? 99) - (priorityIndex.get(right.sourceName) ?? 99) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
  const remaining = new Map(sorted.map((player) => [player.id, player]));
  const groups: PlayerMatchGroup[] = [];
  for (const player of sorted) {
    if (!remaining.has(player.id)) continue;
    const component = componentFrom(player, remaining);
    const providers = component.map(({ sourceName }) => sourceName);
    const ambiguous = new Set(providers).size !== providers.length;
    if (ambiguous) {
      for (const candidate of component) {
        groups.push({
          id: crypto.randomUUID(),
          players: [candidate],
          automatic: false,
          ambiguous: true,
        });
      }
      continue;
    }
    groups.push({
      id: crypto.randomUUID(),
      players: component,
      automatic: component.length > 1,
      ambiguous: false,
    });
  }
  return groups;
};

const empty = (value: unknown): boolean => value === undefined || value === null || value === '';

export const resolveValue = <Value extends string | number | undefined>(
  values: readonly { sourceName: SourceName; value: Value }[],
  priority: readonly SourceName[],
  resolution?: FieldResolution,
): Value => {
  if (resolution?.mode === 'custom') return resolution.value as Value;
  const preferred =
    resolution?.mode === 'source'
      ? values.find(({ sourceName }) => sourceName === resolution.sourceName)
      : undefined;
  if (preferred && !empty(preferred.value)) return preferred.value;
  for (const sourceName of priority) {
    const candidate = values.find((value) => value.sourceName === sourceName);
    if (candidate && !empty(candidate.value)) return candidate.value;
  }
  return undefined as Value;
};

const removeDiacritics = (value: string): string => value.normalize('NFKD').replace(/\p{M}+/gu, '');

export const resolveNameValue = (
  values: readonly { sourceName: SourceName; value: string | undefined }[],
  priority: readonly SourceName[],
  resolution?: FieldResolution,
): string | undefined => {
  const preferred = resolveValue(values, priority, resolution);
  if (resolution || !preferred) return preferred;
  const comparablePreferred = removeDiacritics(preferred);
  for (const sourceName of priority) {
    const candidate = values.find((value) => value.sourceName === sourceName)?.value;
    if (
      candidate &&
      candidate !== removeDiacritics(candidate) &&
      removeDiacritics(candidate) === comparablePreferred
    ) {
      return candidate;
    }
  }
  return preferred;
};

export const playerFields = [
  'name',
  'firstName',
  'lastName',
  'jerseyNumber',
  'position',
  'positionDetail',
  'birthdate',
  'height',
  'weight',
  'foot',
  'joined',
  'contractExpires',
  'marketValue',
  'countryName',
  'countryCode2',
  'countryCode3',
  'minutesPlayed',
] as const satisfies readonly (keyof PlayerInput)[];

const playerNameFields = ['name', 'firstName', 'lastName'] as const;
type PlayerNameField = (typeof playerNameFields)[number];
const isPlayerNameField = (field: (typeof playerFields)[number]): field is PlayerNameField =>
  playerNameFields.includes(field as PlayerNameField);

export const resolvePlayer = (
  group: PlayerMatchGroup,
  priority: readonly SourceName[],
  resolutions: FieldResolutions = {},
): PlayerInput => {
  const result: Record<string, string | number | undefined> = {};
  for (const field of playerFields) {
    result[field] = isPlayerNameField(field)
      ? resolveNameValue(
          group.players.map((player) => ({
            sourceName: player.sourceName,
            value: player[field],
          })),
          priority,
          resolutions[field],
        )
      : resolveValue(
          group.players.map((player) => ({
            sourceName: player.sourceName,
            value: player[field],
          })),
          priority,
          resolutions[field],
        );
  }
  for (const fields of [
    ['countryName', 'countryCode2', 'countryCode3'],
    ['position', 'positionDetail'],
  ] as const) {
    const explicitSource = fields
      .map((field) => resolutions[field])
      .find(
        (resolution): resolution is Extract<FieldResolution, { mode: 'source' }> =>
          resolution?.mode === 'source',
      )?.sourceName;
    const atomicSource =
      explicitSource ??
      priority.find((sourceName) =>
        group.players.some(
          (player) =>
            player.sourceName === sourceName && fields.some((field) => !empty(player[field])),
        ),
      );
    if (!atomicSource) continue;
    const player = group.players.find(({ sourceName }) => sourceName === atomicSource);
    for (const field of fields) {
      if (resolutions[field]?.mode === 'custom') continue;
      result[field] = player?.[field];
    }
  }
  return result as unknown as PlayerInput;
};

export const collectPlayerConflicts = (
  groups: readonly PlayerMatchGroup[],
  priority: readonly SourceName[],
  resolutions: Readonly<Partial<Record<string, FieldResolutions>>> = {},
): FieldConflict[] =>
  groups.flatMap((group) =>
    playerFields.flatMap((field) => {
      const values = group.players
        .map((player) => ({
          sourceName: player.sourceName,
          value: player[field],
        }))
        .filter(({ value }) => !empty(value));
      if (new Set(values.map(({ value }) => String(value))).size <= 1) return [];
      return [
        {
          entity: 'player' as const,
          entityId: group.id,
          field,
          values,
          resolution: resolutions[group.id]?.[field],
          resolvedValue: isPlayerNameField(field)
            ? resolveNameValue(
                values.map(({ sourceName, value }) => ({
                  sourceName,
                  value: typeof value === 'string' ? value : undefined,
                })),
                priority,
                resolutions[group.id]?.[field],
              )
            : resolveValue(values, priority, resolutions[group.id]?.[field]),
        },
      ];
    }),
  );
