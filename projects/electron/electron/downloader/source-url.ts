import { eurofotbal, soccerway, transfermarkt, worldfootball } from 'soccerbot';
import type { EntityKind, SourceName } from '../../shared/downloader/contracts.js';

export const buildSourceUrl = (
  sourceName: SourceName,
  entity: EntityKind,
  sourceId: string,
  season?: string,
): string | undefined => {
  const id = sourceId.trim();
  if (!id) return undefined;
  switch (sourceName) {
    case 'eurofotbal':
      if (entity === 'leagues') return eurofotbal.leagueUrl(id);
      if (entity === 'teams') return eurofotbal.teamUrl(id);
      return undefined;
    case 'soccerway':
      if (entity === 'leagues') return soccerway.leagueUrl(id);
      if (entity === 'teams') return soccerway.teamUrl(id);
      return soccerway.playerUrl(id);
    case 'worldfootball':
      if (entity === 'leagues') return worldfootball.leagueUrl(id);
      if (entity === 'teams') return worldfootball.teamUrl(id);
      return worldfootball.playerUrl(id);
    case 'transfermarkt':
      if (entity === 'leagues') return transfermarkt.leagueUrl(id, season);
      if (entity === 'teams') return transfermarkt.teamUrl(id, season);
      return undefined;
  }
};
