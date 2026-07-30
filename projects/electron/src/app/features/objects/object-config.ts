import type { FieldDescriptor, ObjectKind, ObjectSection } from '../../../../shared/contracts';

export interface ObjectKindConfig {
  label: string;
  singular: string;
  icon: string;
  columns: { key: string; label: string }[];
  canCreate: boolean;
  canEditRoot: boolean;
  canDelete: boolean;
  hasDetail: boolean;
  sections: { id: ObjectSection; label: string; icon: string }[];
}

export const OBJECT_KINDS: readonly ObjectKind[] = [
  'countries',
  'stadiums',
  'leagues',
  'teams',
  'players',
  'referees',
];

export const OBJECT_CONFIG: Record<ObjectKind, ObjectKindConfig> = {
  countries: {
    label: 'Countries',
    singular: 'country',
    icon: 'flag',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'isocountrycode', label: 'ISO code' },
      { key: 'confederation', label: 'Confederation' },
    ],
    canCreate: true,
    canEditRoot: true,
    canDelete: true,
    hasDetail: false,
    sections: [],
  },
  stadiums: {
    label: 'Stadiums',
    singular: 'stadium',
    icon: 'stadium',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'country', label: 'Country' },
    ],
    canCreate: false,
    canEditRoot: false,
    canDelete: false,
    hasDetail: false,
    sections: [],
  },
  leagues: {
    label: 'Leagues',
    singular: 'league',
    icon: 'emoji_events',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'country', label: 'Country' },
      { key: 'level', label: 'Level' },
    ],
    canCreate: true,
    canEditRoot: true,
    canDelete: true,
    hasDetail: true,
    sections: [
      { id: 'teams', label: 'Teams', icon: 'shield' },
      { id: 'referees', label: 'Referees', icon: 'sports' },
    ],
  },
  teams: {
    label: 'Teams',
    singular: 'team',
    icon: 'shield',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'overallrating', label: 'Overall' },
    ],
    canCreate: true,
    canEditRoot: true,
    canDelete: true,
    hasDetail: true,
    sections: [
      { id: 'identity', label: 'Identity', icon: 'badge' },
      { id: 'traits', label: 'Traits', icon: 'star' },
      { id: 'tactics', label: 'Tactics', icon: 'tune' },
      { id: 'manager', label: 'Manager', icon: 'person' },
      { id: 'stadium', label: 'Stadium', icon: 'stadium' },
      { id: 'location', label: 'Location', icon: 'location_on' },
      { id: 'players', label: 'Players', icon: 'directions_run' },
      { id: 'jersey-numbers', label: 'Jersey numbers', icon: 'format_list_numbered' },
    ],
  },
  players: {
    label: 'Players',
    singular: 'player',
    icon: 'directions_run',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'country', label: 'Country' },
      { key: 'birthdate', label: 'Birthdate' },
      { key: 'height', label: 'Height' },
      { key: 'weight', label: 'Weight' },
    ],
    canCreate: false,
    canEditRoot: false,
    canDelete: false,
    hasDetail: true,
    sections: [
      { id: 'identity', label: 'Identity', icon: 'badge' },
      { id: 'contract', label: 'Contract', icon: 'contract' },
      { id: 'appearance', label: 'Appearance', icon: 'face' },
      { id: 'gear', label: 'Gear', icon: 'checkroom' },
      { id: 'traits', label: 'Traits', icon: 'star' },
      { id: 'skills', label: 'Skills', icon: 'speed' },
      { id: 'behaviour', label: 'Behaviour', icon: 'psychology' },
    ],
  },
  referees: {
    label: 'Referees',
    singular: 'referee',
    icon: 'sports',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'country', label: 'Country' },
      { key: 'birthdate', label: 'Birthdate' },
      { key: 'height', label: 'Height' },
      { key: 'weight', label: 'Weight' },
    ],
    canCreate: true,
    canEditRoot: true,
    canDelete: true,
    hasDetail: true,
    sections: [
      { id: 'identity', label: 'Identity', icon: 'badge' },
      { id: 'appearance', label: 'Appearance', icon: 'face' },
      { id: 'gear', label: 'Gear', icon: 'checkroom' },
      { id: 'leagues', label: 'Leagues', icon: 'emoji_events' },
    ],
  },
};

const integerField = (
  name: string,
  defaultValue: number,
  min: number,
  max: number,
  unique = false,
): FieldDescriptor => ({
  name,
  type: 'int',
  defaultValue,
  unique,
  range: { min, max },
});

const textField = (name: string): FieldDescriptor => ({
  name,
  type: 'string',
  defaultValue: '',
  unique: false,
});

export const createFields = (kind: ObjectKind): FieldDescriptor[] => {
  switch (kind) {
    case 'countries':
      return [
        integerField('nationid', 1, 1, 250, true),
        textField('nationname'),
        integerField('confederation', 1, 1, 7),
        textField('isocountrycode'),
      ];
    case 'leagues':
      return [
        integerField('leagueid', 1, 1, 3000, true),
        textField('leaguename'),
        integerField('level', 1, 1, 7),
        integerField('countryid', 1, 1, 250),
      ];
    case 'teams':
      return [integerField('teamid', 1, 1, 200000, true), textField('teamname')];
    case 'referees':
      return [
        integerField('refereeid', 1, 1, 200000, true),
        textField('firstname'),
        textField('surname'),
        integerField('height', 180, 150, 215),
        integerField('weight', 80, 50, 115),
        integerField('nationalitycode', 1, 1, 250),
        integerField('birthdate', 148733, 0, 1048575),
      ];
    default:
      return [];
  }
};
