import { Datatype, type Field } from 'fifatables';

import type {
  ObjectDeleteRequest,
  ObjectDeleteResult,
  ObjectDependency,
  ObjectDetail,
  ObjectKind,
  ObjectListPage,
  ObjectListRequest,
  ObjectReadRequest,
  ObjectReference,
  ObjectSection,
  SaveObjectRequest,
  SaveObjectResult,
  TableRowValues,
  TableValue,
  ValidationIssue,
} from '../shared/contracts';
import { defaultValueFor, fieldDescriptor, fieldsFor, tableForName } from '../shared/table-config';
import type { DatabaseSync, SQLInputValue } from './runtime-sqlite';
import { validateRows } from './validation';

type SqlRow = Record<string, SQLInputValue>;

interface RootDefinition {
  table: string;
  key: string;
  name: string;
  creatable: boolean;
}

interface ListDefinition extends RootDefinition {
  select: string;
  search: string[];
  sorts: Record<string, string>;
}

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const ROOTS: Record<ObjectKind, RootDefinition> = {
  countries: { table: 'nations', key: 'nationid', name: 'nationname', creatable: true },
  stadiums: { table: 'stadiums', key: 'stadiumid', name: 'name', creatable: false },
  leagues: { table: 'leagues', key: 'leagueid', name: 'leaguename', creatable: true },
  teams: { table: 'teams', key: 'teamid', name: 'teamname', creatable: true },
  players: { table: 'players', key: 'playerid', name: 'playerid', creatable: false },
  referees: { table: 'referee', key: 'refereeid', name: 'surname', creatable: true },
};

const playerNameExpression = (
  firstName: string,
  dcFirstName: string,
  lastName: string,
  dcLastName: string,
): string => `
  trim(
    coalesce(${firstName}.name, ${dcFirstName}.name, '')
    || ' ' ||
    coalesce(${lastName}.name, ${dcLastName}.name, '')
  )`;

const playerName = playerNameExpression('first_name', 'dc_first_name', 'last_name', 'dc_last_name');

const playerNameJoins = (source: string, prefix = ''): string => `
  LEFT JOIN playernames ${prefix}first_name
    ON ${prefix}first_name.nameid = ${source}.firstnameid
  LEFT JOIN dcplayernames ${prefix}dc_first_name
    ON ${prefix}dc_first_name.nameid = ${source}.firstnameid
  LEFT JOIN playernames ${prefix}last_name
    ON ${prefix}last_name.nameid = ${source}.lastnameid
  LEFT JOIN dcplayernames ${prefix}dc_last_name
    ON ${prefix}dc_last_name.nameid = ${source}.lastnameid`;

const LISTS: Record<ObjectKind, ListDefinition> = {
  countries: {
    ...ROOTS.countries,
    select:
      'source.nationid AS id, source.nationname AS name, source.confederation, source.isocountrycode',
    search: ['source.nationname', 'source.isocountrycode'],
    sorts: {
      id: 'source.nationid',
      name: 'source.nationname',
      confederation: 'source.confederation',
    },
  },
  stadiums: {
    ...ROOTS.stadiums,
    select:
      "source.stadiumid AS id, source.name AS name, source.countrycode, coalesce(n.nationname, '') AS country",
    search: ['source.name', 'n.nationname'],
    sorts: { id: 'source.stadiumid', name: 'source.name', country: 'n.nationname' },
  },
  leagues: {
    ...ROOTS.leagues,
    select:
      "source.leagueid AS id, source.leaguename AS name, source.level, source.countryid, coalesce(n.nationname, '') AS country",
    search: ['source.leaguename', 'n.nationname'],
    sorts: {
      id: 'source.leagueid',
      name: 'source.leaguename',
      level: 'source.level',
      country: 'n.nationname',
    },
  },
  teams: {
    ...ROOTS.teams,
    select: 'source.teamid AS id, source.teamname AS name, source.overallrating',
    search: ['source.teamname'],
    sorts: { id: 'source.teamid', name: 'source.teamname', overallrating: 'source.overallrating' },
  },
  players: {
    ...ROOTS.players,
    select: `source.playerid AS id, ${playerName} AS name, source.birthdate, source.height,
      source.weight, source.nationality, coalesce(n.nationname, '') AS country`,
    search: [playerName, 'n.nationname', 'CAST(source.playerid AS TEXT)'],
    sorts: {
      id: 'source.playerid',
      name: playerName,
      birthdate: 'source.birthdate',
      height: 'source.height',
      weight: 'source.weight',
      country: 'n.nationname',
    },
  },
  referees: {
    ...ROOTS.referees,
    select: `source.refereeid AS id, trim(source.firstname || ' ' || source.surname) AS name,
      source.birthdate, source.height, source.weight, source.nationalitycode,
      coalesce(n.nationname, '') AS country`,
    search: ['source.firstname', 'source.surname', 'n.nationname'],
    sorts: {
      id: 'source.refereeid',
      name: 'source.surname',
      birthdate: 'source.birthdate',
      height: 'source.height',
      weight: 'source.weight',
      country: 'n.nationname',
    },
  },
};

const SECTION_FIELDS: Partial<Record<ObjectKind, Partial<Record<ObjectSection, string[]>>>> = {
  countries: {
    root: ['nationid', 'nationname', 'confederation', 'isocountrycode'],
  },
  stadiums: {
    root: ['stadiumid', 'name', 'countrycode'],
  },
  leagues: {
    root: ['leagueid', 'leaguename', 'level', 'countryid'],
  },
  teams: {
    root: ['teamid', 'teamname'],
    identity: [
      'teamname',
      'transferbudget',
      'domesticprestige',
      'internationalprestige',
      'teamcolor1r',
      'teamcolor1g',
      'teamcolor1b',
      'teamcolor2r',
      'teamcolor2g',
      'teamcolor2b',
      'teamcolor3r',
      'teamcolor3g',
      'teamcolor3b',
      'balltype',
      'rivalteam',
    ],
    traits: ['trait1'],
    tactics: [
      'buspositioning',
      'busbuildupspeed',
      'buspassing',
      'busdribbling',
      'ccpositioning',
      'ccshooting',
      'ccpassing',
      'cccrossing',
      'defdefenderline',
      'defmentality',
      'defteamwidth',
      'defaggression',
    ],
    location: ['latitude', 'longitude', 'utcoffset'],
  },
  players: {
    root: ['playerid'],
    identity: [
      'height',
      'weight',
      'nationality',
      'bodytypecode',
      'gender',
      'birthdate',
      'preferredfoot',
      'weakfootabilitytypecode',
      'isretiring',
      'usercaneditname',
      'preferredposition1',
      'preferredposition2',
      'preferredposition3',
      'preferredposition4',
    ],
    appearance: [
      'skintonecode',
      'skintypecode',
      'eyecolorcode',
      'eyebrowcode',
      'facialhairtypecode',
      'facialhaircolorcode',
      'hairtypecode',
      'haircolorcode',
      'headtypecode',
      'sideburnscode',
      'emotion',
      'faceposercode',
      'hashighqualityhead',
      'headclasscode',
    ],
    gear: [
      'hasseasonaljersey',
      'jerseystylecode',
      'jerseyfit',
      'jerseysleevelengthcode',
      'socklengthcode',
      'shoedesigncode',
      'shoetypecode',
      'shoecolorcode1',
      'shoecolorcode2',
      'gkglovetypecode',
      'shortstyle',
      'accessorycolourcode1',
      'accessorycolourcode2',
      'accessorycolourcode3',
      'accessorycolourcode4',
      'accessorycode1',
      'accessorycode2',
      'accessorycode3',
      'accessorycode4',
    ],
    traits: ['trait1', 'trait2'],
    skills: [
      'overallrating',
      'potential',
      'internationalrep',
      'weakfootabilitytypecode',
      'skillmoves',
      'acceleration',
      'aggression',
      'agility',
      'balance',
      'ballcontrol',
      'crossing',
      'curve',
      'dribbling',
      'finishing',
      'freekickaccuracy',
      'gkdiving',
      'gkhandling',
      'gkkicking',
      'gkpositioning',
      'gkreflexes',
      'headingaccuracy',
      'interceptions',
      'jumping',
      'longpassing',
      'longshots',
      'marking',
      'penalties',
      'positioning',
      'reactions',
      'shortpassing',
      'shotpower',
      'slidingtackle',
      'sprintspeed',
      'stamina',
      'standingtackle',
      'strength',
      'vision',
      'volleys',
    ],
    behaviour: [
      'animfreekickstartposcode',
      'animpenaltieskickstylecode',
      'animpenaltiesmotionstylecode',
      'animpenaltiesstartposcode',
      'attackingworkrate',
      'defensiveworkrate',
      'gkickstyle',
      'gksavetype',
      'finishingcode1',
      'finishingcode2',
      'runningcode1',
      'runningcode2',
      'skillmoves',
    ],
    contract: ['contractvaliduntil', 'playerjointeamdate'],
  },
  referees: {
    root: ['refereeid', 'firstname', 'surname', 'height', 'weight', 'nationalitycode', 'birthdate'],
    identity: [
      'firstname',
      'surname',
      'height',
      'weight',
      'nationalitycode',
      'bodytypecode',
      'gender',
      'birthdate',
      'foulstrictness',
      'cardstrictness',
      'isreal',
    ],
    appearance: [
      'skintonecode',
      'skintypecode',
      'eyecolorcode',
      'eyebrowcode',
      'facialhairtypecode',
      'facialhaircolorcode',
      'hairtypecode',
      'haircolorcode',
      'headtypecode',
      'sideburnscode',
      'headclasscode',
      'wrinkleid',
    ],
    gear: [
      'jerseysleevelengthcode',
      'shoedesigncode',
      'shoetypecode',
      'shoecolorcode1',
      'shoecolorcode2',
    ],
    leagues: ['leagueid'],
  },
};

const DEPENDENCIES: Partial<
  Record<ObjectKind, { table: string; field: string; target?: string }[]>
> = {
  countries: [
    { table: 'leagues', field: 'countryid' },
    { table: 'players', field: 'nationality' },
    { table: 'referee', field: 'nationalitycode' },
    { table: 'stadiums', field: 'countrycode' },
    { table: 'rowteamnationlinks', field: 'nationid' },
    { table: 'teamnationlinks', field: 'nationid' },
  ],
  stadiums: [{ table: 'teamstadiumlinks', field: 'stadiumid' }],
  leagues: [
    { table: 'leaguerefereelinks', field: 'leagueid' },
    { table: 'leagueteamlinks', field: 'leagueid' },
    { table: 'referee', field: 'leagueid' },
  ],
  teams: [
    { table: 'formations', field: 'teamid' },
    { table: 'leagueteamlinks', field: 'teamid' },
    { table: 'manager', field: 'teamid' },
    { table: 'previousteam', field: 'previousteamid' },
    { table: 'rivals', field: 'teamid1' },
    { table: 'rivals', field: 'teamid2' },
    { table: 'rowteamnationlinks', field: 'teamid' },
    { table: 'teamnationlinks', field: 'teamid' },
    { table: 'teamplayerlinks', field: 'teamid' },
    { table: 'teamstadiumlinks', field: 'teamid' },
    { table: 'teams', field: 'rivalteam' },
  ],
  players: [
    { table: 'player_grudgelove', field: 'playerid' },
    { table: 'playerloans', field: 'playerid' },
    { table: 'previousteam', field: 'playerid' },
    { table: 'teamplayerlinks', field: 'playerid' },
  ],
  referees: [{ table: 'leaguerefereelinks', field: 'refereeid' }],
};

const READABLE_SECTIONS: Record<ObjectKind, readonly ObjectSection[]> = {
  countries: ['root'],
  stadiums: ['root'],
  leagues: ['root', 'teams', 'referees'],
  teams: [
    'root',
    'identity',
    'traits',
    'tactics',
    'manager',
    'stadium',
    'location',
    'players',
    'jersey-numbers',
  ],
  players: ['identity', 'contract', 'appearance', 'gear', 'traits', 'skills', 'behaviour'],
  referees: ['root', 'identity', 'appearance', 'gear', 'leagues'],
};

const WRITABLE_SECTIONS: Record<ObjectKind, readonly ObjectSection[]> = {
  countries: ['root'],
  stadiums: [],
  leagues: ['root'],
  teams: [
    'root',
    'identity',
    'traits',
    'tactics',
    'manager',
    'stadium',
    'location',
    'jersey-numbers',
  ],
  players: ['identity', 'contract', 'appearance', 'gear', 'traits', 'skills', 'behaviour'],
  referees: ['root', 'identity', 'appearance', 'gear', 'leagues'],
};

const numeric = (value: SQLInputValue | undefined): number =>
  typeof value === 'bigint' ? Number(value) : Number(value ?? 0);

const scalar = (value: SQLInputValue | undefined): TableValue =>
  typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'string' || typeof value === 'number'
      ? value
      : '';

const valuesFromRow = (row: SqlRow, fields: readonly Field[]): TableRowValues =>
  Object.fromEntries(fields.map((field) => [field.name, scalar(row[field.name])]));

const normalized = (field: Field, value: TableValue | undefined): TableValue => {
  if (value === undefined) return defaultValueFor(field);
  if (field.type === Datatype.String) return String(value);
  const candidate = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  if (candidate === '') return '';
  const number = typeof candidate === 'number' ? candidate : Number(candidate);
  return Number.isFinite(number) ? number : String(value);
};

const joinFor = (kind: ObjectKind): string => {
  if (kind === 'stadiums') return ' LEFT JOIN nations n ON n.nationid = source.countrycode';
  if (kind === 'leagues') return ' LEFT JOIN nations n ON n.nationid = source.countryid';
  if (kind === 'players')
    return `${playerNameJoins('source')} LEFT JOIN nations n ON n.nationid = source.nationality`;
  if (kind === 'referees') return ' LEFT JOIN nations n ON n.nationid = source.nationalitycode';
  return '';
};

export class FifaObjects {
  constructor(private readonly database: DatabaseSync) {}

  list(request: ObjectListRequest): ObjectListPage {
    const definition = LISTS[request.kind];
    const pageSize = Number.isFinite(request.pageSize)
      ? Math.min(100, Math.max(1, Math.trunc(request.pageSize)))
      : 25;
    const pageIndex = Number.isFinite(request.pageIndex)
      ? Math.max(0, Math.trunc(request.pageIndex))
      : 0;
    const query = request.query.trim();
    const where = query
      ? `WHERE ${definition.search.map((field) => `CAST(${field} AS TEXT) LIKE ?`).join(' OR ')}`
      : '';
    const parameters = query ? definition.search.map(() => `%${query}%`) : [];
    const sort =
      (request.sortField && definition.sorts[request.sortField]) ??
      definition.sorts['id'] ??
      `source.${quote(definition.key)}`;
    const direction = request.sortDirection === 'desc' ? 'DESC' : 'ASC';
    const from = `${quote(definition.table)} source${joinFor(request.kind)}`;
    const total = numeric(
      this.database.prepare(`SELECT count(*) AS value FROM ${from} ${where}`).get(...parameters)?.[
        'value'
      ],
    );
    const rows = this.database
      .prepare(
        `SELECT ${definition.select} FROM ${from} ${where}
         ORDER BY ${sort} ${direction}, source.__row_order ASC LIMIT ? OFFSET ?`,
      )
      .all(...parameters, pageSize, pageIndex * pageSize) as SqlRow[];
    return {
      kind: request.kind,
      total,
      items: rows.map((row) => ({
        id: numeric(row['id']),
        name: String(row['name'] || `#${numeric(row['id'])}`),
        values: Object.fromEntries(
          Object.entries(row)
            .filter(([key]) => !['id', 'name', '__row_id', '__row_order'].includes(key))
            .map(([key, value]) => [key, scalar(value)]),
        ),
      })),
    };
  }

  read(request: ObjectReadRequest): ObjectDetail {
    if (!READABLE_SECTIONS[request.kind].includes(request.section))
      throw new Error(`Invalid ${request.kind} object section.`);
    const root = ROOTS[request.kind];
    const rootRow = this.rowByKey(root.table, root.key, request.id);
    if (!rootRow) throw new Error('The object was not found.');
    const title = this.title(request.kind, rootRow);

    if (request.kind === 'leagues' && ['teams', 'referees'].includes(request.section))
      return this.leagueRelations(request, title);
    if (request.kind === 'teams' && request.section === 'players')
      return this.teamPlayers(request, title, false);
    if (request.kind === 'teams' && request.section === 'jersey-numbers')
      return this.teamPlayers(request, title, true);

    let table = root.table;
    let key = root.key;
    if (request.kind === 'teams' && request.section === 'manager') {
      table = 'manager';
      key = 'teamid';
    } else if (request.kind === 'teams' && request.section === 'stadium') {
      table = 'teamstadiumlinks';
      key = 'teamid';
    }

    const fields = this.sectionFields(request.kind, request.section, table, key);
    const row = this.rowByKey(table, key, request.id);
    const values = row
      ? valuesFromRow(row, fields)
      : Object.fromEntries(fields.map((field) => [field.name, defaultValueFor(field)]));
    const relationIds = this.relationIds(request);
    return {
      kind: request.kind,
      id: request.id,
      title,
      section: request.section,
      fields: fields.map(fieldDescriptor),
      values,
      relationIds,
      related: this.relationOptions(request),
      readOnly: request.kind === 'stadiums',
    };
  }

  save(request: SaveObjectRequest): SaveObjectResult {
    if (!WRITABLE_SECTIONS[request.kind].includes(request.section))
      throw new Error(`Saving the ${request.kind} ${request.section} section is not available.`);
    const root = ROOTS[request.kind];
    if (request.section === 'root' && request.id === undefined && !root.creatable)
      throw new Error(`Creating ${request.kind} is not available.`);

    let table = root.table;
    let key = root.key;
    let id = request.id;
    if (request.kind === 'teams' && request.section === 'manager') {
      table = 'manager';
      key = 'teamid';
    } else if (request.kind === 'teams' && request.section === 'stadium') {
      table = 'teamstadiumlinks';
      key = 'teamid';
    }

    const tableFields = fieldsFor(table);
    if (id === undefined) id = numeric(request.values[root.key] as number);
    if (!Number.isInteger(id) || id < 0) throw new Error('A valid object identifier is required.');

    const existing = this.rowByKey(table, key, id);
    const complete = Object.fromEntries(
      tableFields.map((field) => [
        field.name,
        normalized(
          field,
          request.values[field.name] ??
            (existing ? scalar(existing[field.name]) : field.name === key ? id : undefined),
        ),
      ]),
    );
    const warnings = this.candidateWarnings(table, existing, complete);
    if (request.kind === 'teams' && request.section === 'jersey-numbers') {
      const linkFields = fieldsFor('teamplayerlinks');
      const jerseyField = linkFields.find((field) => field.name === 'jerseynumber');
      if (!jerseyField) throw new Error('The jersey-number field is unavailable.');
      for (const related of request.related ?? []) {
        const link = this.database
          .prepare('SELECT * FROM teamplayerlinks WHERE teamid = ? AND playerid = ? LIMIT 1')
          .get(id, related.id) as SqlRow | undefined;
        if (!link) throw new Error(`Player ${related.id} is not linked to team ${id}.`);
        warnings.push(
          ...this.candidateWarnings('teamplayerlinks', link, {
            ...valuesFromRow(link, linkFields),
            jerseynumber: normalized(jerseyField, related.values['jerseynumber']),
          }),
        );
      }
    }
    if (request.kind === 'players' && request.section === 'contract')
      this.assertRelationTargets('teams', 'teamid', request.relationIds ?? []);
    if (request.kind === 'referees' && request.section === 'leagues')
      this.assertRelationTargets('leagues', 'leagueid', request.relationIds ?? []);
    const errors = warnings.filter((issue) => issue.severity === 'error');
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '));
    const nonBlocking = warnings.filter((issue) => issue.severity === 'warning');
    if (nonBlocking.length && !request.acceptWarnings) return { id, warnings: nonBlocking };

    this.transaction(() => {
      this.writeRow(table, existing, complete, tableFields);
      if (request.kind === 'players' && request.section === 'contract')
        this.replaceLinks('teamplayerlinks', 'playerid', id!, 'teamid', request.relationIds ?? []);
      if (request.kind === 'referees' && request.section === 'leagues')
        this.replaceLinks(
          'leaguerefereelinks',
          'refereeid',
          id!,
          'leagueid',
          request.relationIds ?? [],
        );
      if (request.kind === 'teams' && request.section === 'jersey-numbers' && request.related)
        for (const related of request.related) {
          const jerseyField = fieldsFor('teamplayerlinks').find(
            (field) => field.name === 'jerseynumber',
          );
          if (!jerseyField) throw new Error('The jersey-number field is unavailable.');
          this.database
            .prepare(
              'UPDATE teamplayerlinks SET jerseynumber = ? WHERE teamid = ? AND playerid = ?',
            )
            .run(normalized(jerseyField, related.values['jerseynumber']), id!, related.id);
        }
    });
    return { id, warnings: nonBlocking };
  }

  delete(request: ObjectDeleteRequest): ObjectDeleteResult {
    const root = ROOTS[request.kind];
    if (!root.creatable) throw new Error(`Deleting ${request.kind} is not available.`);
    if (!this.rowByKey(root.table, root.key, request.id))
      throw new Error('The object was not found.');
    const dependencies: ObjectDependency[] = [];
    for (const relation of DEPENDENCIES[request.kind] ?? []) {
      if (!this.hasField(relation.table, relation.field)) continue;
      const rows = this.database
        .prepare(
          `SELECT __row_id FROM ${quote(relation.table)} WHERE ${quote(relation.field)} = ? LIMIT 6`,
        )
        .all(request.id) as { __row_id: number }[];
      if (!rows.length) continue;
      const count = numeric(
        this.database
          .prepare(
            `SELECT count(*) AS value FROM ${quote(relation.table)} WHERE ${quote(relation.field)} = ?`,
          )
          .get(request.id)?.['value'],
      );
      dependencies.push({
        table: relation.table,
        field: relation.field,
        count,
        sampleIds: rows.slice(0, 5).map((row) => Number(row.__row_id)),
      });
    }
    if (dependencies.length) return { deleted: false, dependencies };
    const result = this.database
      .prepare(`DELETE FROM ${quote(root.table)} WHERE ${quote(root.key)} = ?`)
      .run(request.id);
    return result.changes === 1
      ? { deleted: true, dependencies: [] }
      : { deleted: false, dependencies: [] };
  }

  private title(kind: ObjectKind, row: SqlRow): string {
    if (kind === 'players') {
      const result = this.database
        .prepare(
          `SELECT ${playerName} AS name FROM players source
           ${playerNameJoins('source')} WHERE source.playerid = ?`,
        )
        .get(numeric(row['playerid']));
      return String(result?.['name'] || `Player ${numeric(row['playerid'])}`);
    }
    if (kind === 'referees')
      return `${String(row['firstname'] ?? '')} ${String(row['surname'] ?? '')}`.trim();
    const root = ROOTS[kind];
    return String(row[root.name] || `${kind} ${numeric(row[root.key])}`);
  }

  private sectionFields(
    kind: ObjectKind,
    section: ObjectSection,
    table: string,
    key: string,
  ): Field[] {
    const all = fieldsFor(table);
    const configured = SECTION_FIELDS[kind]?.[section];
    if (configured) return configured.flatMap((name) => all.filter((field) => field.name === name));
    if (section === 'root') return all;
    return all.filter((field) => field.name !== key);
  }

  private leagueRelations(request: ObjectReadRequest, title: string): ObjectDetail {
    const teams = request.section === 'teams';
    const linkTable = teams ? 'leagueteamlinks' : 'leaguerefereelinks';
    const targetTable = teams ? 'teams' : 'referee';
    const targetKey = teams ? 'teamid' : 'refereeid';
    const targetName = teams
      ? 'target.teamname'
      : "trim(target.firstname || ' ' || target.surname)";
    const rows = this.database
      .prepare(
        `SELECT target.${quote(targetKey)} AS id, ${targetName} AS name
         FROM ${quote(linkTable)} link
         JOIN ${quote(targetTable)} target ON target.${quote(targetKey)} = link.${quote(targetKey)}
         WHERE link.leagueid = ? ORDER BY name COLLATE NOCASE`,
      )
      .all(request.id) as SqlRow[];
    return this.relatedDetail(request, title, rows);
  }

  private teamPlayers(
    request: ObjectReadRequest,
    title: string,
    jerseyNumbers: boolean,
  ): ObjectDetail {
    const linkedPlayerName = playerNameExpression(
      'linked_first_name',
      'linked_dc_first_name',
      'linked_last_name',
      'linked_dc_last_name',
    );
    const rows = this.database
      .prepare(
        `SELECT players.playerid AS id, ${linkedPlayerName} AS name,
          links.jerseynumber
         FROM teamplayerlinks links
         JOIN players ON players.playerid = links.playerid
         ${playerNameJoins('players', 'linked_')}
         WHERE links.teamid = ? ORDER BY links.jerseynumber, players.playerid`,
      )
      .all(request.id) as SqlRow[];
    const detail = this.relatedDetail(request, title, rows);
    return {
      ...detail,
      fields: jerseyNumbers
        ? [
            {
              name: 'jerseynumber',
              type: 'int',
              defaultValue: 0,
              unique: false,
              range: { min: 1, max: 99 },
            },
          ]
        : [],
      readOnly: !jerseyNumbers,
    };
  }

  private relatedDetail(request: ObjectReadRequest, title: string, rows: SqlRow[]): ObjectDetail {
    return {
      kind: request.kind,
      id: request.id,
      title,
      section: request.section,
      fields: [],
      values: {},
      relationIds: rows.map((row) => numeric(row['id'])),
      related: rows.map((row) => ({
        id: numeric(row['id']),
        name: String(row['name'] || `#${numeric(row['id'])}`),
        values: Object.fromEntries(
          Object.entries(row)
            .filter(([key]) => !['id', 'name'].includes(key))
            .map(([key, value]) => [key, scalar(value)]),
        ),
      })),
      readOnly: true,
    };
  }

  private relationIds(request: ObjectReadRequest): number[] {
    if (request.kind === 'players' && request.section === 'contract')
      return (
        this.database
          .prepare('SELECT teamid AS id FROM teamplayerlinks WHERE playerid = ? ORDER BY teamid')
          .all(request.id) as SqlRow[]
      ).map((row) => numeric(row['id']));
    if (request.kind === 'referees' && request.section === 'leagues')
      return (
        this.database
          .prepare(
            'SELECT leagueid AS id FROM leaguerefereelinks WHERE refereeid = ? ORDER BY leagueid',
          )
          .all(request.id) as SqlRow[]
      ).map((row) => numeric(row['id']));
    return [];
  }

  private relationOptions(request: ObjectReadRequest): ObjectReference[] {
    let table: string | undefined;
    let key = '';
    let name = '';
    if (request.kind === 'players' && request.section === 'contract') {
      table = 'teams';
      key = 'teamid';
      name = 'teamname';
    } else if (request.kind === 'referees' && request.section === 'leagues') {
      table = 'leagues';
      key = 'leagueid';
      name = 'leaguename';
    }
    if (!table) return [];
    return (
      this.database
        .prepare(
          `SELECT ${quote(key)} AS id, ${quote(name)} AS name FROM ${quote(table)}
           ORDER BY ${quote(name)} COLLATE NOCASE`,
        )
        .all() as SqlRow[]
    ).map((row) => ({
      id: numeric(row['id']),
      name: String(row['name']),
      values: {},
    }));
  }

  private rowByKey(table: string, key: string, id: number): SqlRow | undefined {
    if (!this.hasField(table, key)) return undefined;
    return this.database
      .prepare(`SELECT * FROM ${quote(table)} WHERE ${quote(key)} = ? LIMIT 1`)
      .get(id) as SqlRow | undefined;
  }

  private hasField(table: string, field: string): boolean {
    try {
      return fieldsFor(tableForName(table)).some((candidate) => candidate.name === field);
    } catch {
      return false;
    }
  }

  private candidateWarnings(
    table: string,
    existing: SqlRow | undefined,
    values: TableRowValues,
  ): ValidationIssue[] {
    const fields = fieldsFor(table);
    const rowId = existing ? numeric(existing['__row_id']) : -1;
    const rows = (
      this.database.prepare(`SELECT * FROM ${quote(table)} ORDER BY __row_order`).all() as SqlRow[]
    )
      .filter((row) => numeric(row['__row_id']) !== rowId)
      .map((row) => ({
        rowId: numeric(row['__row_id']),
        values: valuesFromRow(row, fields),
      }));
    return validateRows(table, [...rows, { rowId, values }], fields).filter((issue) =>
      issue.samples.some((sample) => sample.rowId === rowId),
    );
  }

  private writeRow(
    table: string,
    existing: SqlRow | undefined,
    values: TableRowValues,
    fields: Field[],
  ): void {
    const parameters = fields.map((field) => values[field.name] as SQLInputValue);
    if (existing) {
      this.database
        .prepare(
          `UPDATE ${quote(table)} SET ${fields
            .map((field) => `${quote(field.name)} = ?`)
            .join(', ')} WHERE __row_id = ?`,
        )
        .run(...parameters, numeric(existing['__row_id']));
      return;
    }
    const rowOrder = numeric(
      this.database
        .prepare(`SELECT coalesce(max(__row_order), -1) + 1 AS value FROM ${quote(table)}`)
        .get()?.['value'],
    );
    this.database
      .prepare(
        `INSERT INTO ${quote(table)} (__row_order, ${fields.map((field) => quote(field.name)).join(', ')})
         VALUES (${['?', ...fields.map(() => '?')].join(', ')})`,
      )
      .run(rowOrder, ...parameters);
  }

  private replaceLinks(
    table: string,
    ownerField: string,
    ownerId: number,
    targetField: string,
    targetIds: number[],
  ): void {
    const uniqueIds = [...new Set(targetIds.filter((id) => Number.isInteger(id) && id >= 0))];
    const fields = fieldsFor(table);
    const existing = this.database
      .prepare(`SELECT * FROM ${quote(table)} WHERE ${quote(ownerField)} = ?`)
      .all(ownerId) as SqlRow[];
    const selected = new Set(uniqueIds);
    for (const row of existing) {
      const targetId = numeric(row[targetField]);
      if (selected.has(targetId)) {
        selected.delete(targetId);
        continue;
      }
      this.database
        .prepare(`DELETE FROM ${quote(table)} WHERE __row_id = ?`)
        .run(numeric(row['__row_id']));
    }
    for (const targetId of selected) {
      const values = Object.fromEntries(
        fields.map((field) => [
          field.name,
          field.name === ownerField
            ? ownerId
            : field.name === targetField
              ? targetId
              : field.name === 'artificialkey'
                ? this.nextArtificialKey(table)
                : defaultValueFor(field),
        ]),
      );
      this.writeRow(table, undefined, values, fields);
    }
  }

  private assertRelationTargets(table: string, key: string, ids: number[]): void {
    for (const id of new Set(ids)) {
      if (!Number.isSafeInteger(id) || id < 0 || !this.rowByKey(table, key, id))
        throw new Error(`Related ${table} object ${id} was not found.`);
    }
  }

  private nextArtificialKey(table: string): number {
    if (!this.hasField(table, 'artificialkey')) return 0;
    return numeric(
      this.database
        .prepare(`SELECT coalesce(max(artificialkey), -1) + 1 AS value FROM ${quote(table)}`)
        .get()?.['value'],
    );
  }

  private transaction(action: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      action();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
