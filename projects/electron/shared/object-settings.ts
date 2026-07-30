import type { DatabaseObjectSettings } from './contracts';

export const DEFAULT_DATABASE_OBJECT_SETTINGS: DatabaseObjectSettings = {
  ids: {
    league: 1,
    team: 1,
    country: 1,
    player: 0,
    referee: 1,
  },
  dates: { date: 158229, now: true },
  referee: {
    foulsStyle: { 0: 5, 1: 70, 2: 25 },
    cardsStyle: { 0: 5, 1: 70, 2: 25 },
    jerseySleeve: { 0: 95, 1: 5 },
  },
  traits: {
    teamTraits: { 0: 86, 1: 10, 2: 3, 3: 1 },
    playerTraits: { 0: 69, 1: 18, 2: 9, 3: 3, 4: 1 },
  },
  shoes: { shoeType: { 0: 10, 1: 90 } },
  kit: {
    jerseyFit: { 0: 90, 1: 10 },
    jerseyStyle: { 0: 90, 1: 10 },
    jerseySleeveLength: { 0: 50, 1: 30, 2: 10, 3: 5, 4: 5 },
    sockLength: { 0: 70, 1: 20, 2: 10 },
    winterAccessories: { 0: 70, 1: 10, 2: 10, 3: 5, 4: 5 },
  },
  tactics: {
    busPositioning: { 0: 95, 1: 5 },
    ccPositioning: { 0: 90, 1: 10 },
    defDefenderLine: { 0: 95, 1: 5 },
  },
  animations: {
    freeKickStart: { 0: 80, 1: 10, 2: 10, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    penaltiesStart: { 0: 50, 1: 25, 2: 25, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    penaltiesMotionStyle: { 0: 90, 1: 10, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    penaltiesKickStyle: { 0: 70, 1: 15, 2: 15 },
  },
};

export const cloneDefaultDatabaseObjectSettings = (): DatabaseObjectSettings =>
  structuredClone(DEFAULT_DATABASE_OBJECT_SETTINGS);
