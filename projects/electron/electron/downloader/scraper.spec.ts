import { eurofotbal, soccerway, transfermarkt, worldfootball } from 'soccerbot';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  SoccerBotPositionDetail,
  SoccerBotPositionGroup,
} from 'soccerbot/es5/shared/interfaces.js';
import { ApplicationError } from './errors.js';
import {
  deriveEurofotbalLeagueName,
  deriveSoccerwayLeagueName,
  deriveWorldFootballLeagueName,
  normalizePlayer,
  parseEurofotbalIdentifier,
  parseSoccerwayIdentifier,
  parseSourceIdentifier,
  parseTransfermarktIdentifier,
  parseTransfermarktLeagueName,
  parseWorldFootballIdentifier,
  SoccerbotScraper,
} from './scraper.js';
import { buildSourceUrl } from './source-url.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Transfermarkt identifiers', () => {
  test('accepts IDs and supported league/team URLs', () => {
    expect(parseTransfermarktIdentifier('GB1', 'league')).toBe('GB1');
    expect(
      parseTransfermarktIdentifier(
        'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1',
        'league',
      ),
    ).toBe('GB1');
    expect(
      parseTransfermarktIdentifier(
        'https://www.transfermarkt.com/manchester-city/startseite/verein/281',
        'team',
      ),
    ).toBe('281');
  });

  test('extracts a clean league name from a Transfermarkt page title', () => {
    expect(
      parseTransfermarktLeagueName('<title>Premier League 25/26 | Transfermarkt</title>'),
    ).toBe('Premier League');
    expect(
      parseTransfermarktLeagueName('<title>Women&#39;s League 2025/26 | Transfermarkt</title>'),
    ).toBe("Women's League");
    expect(parseTransfermarktLeagueName('<main>No title</main>')).toBeUndefined();
  });

  test('rejects malformed IDs, unrelated hosts, and mismatched URLs', () => {
    for (const [value, kind] of [
      ['bad id', 'team'],
      ['https://example.com/team/281', 'team'],
      ['https://www.transfermarkt.com/league/GB1', 'league'],
    ] as const) {
      expect(() => parseTransfermarktIdentifier(value, kind)).toThrow(ApplicationError);
    }
  });
});

describe('Soccerway identifiers and URLs', () => {
  test('accepts raw IDs and extracts IDs from generated league and team URLs', () => {
    const leagueId = 'czech-republic/chance-liga/standings/bNFMkskm';
    const teamId = 'slavia-prague/viXGgnyB';

    expect(parseSoccerwayIdentifier(leagueId, 'league')).toBe(leagueId);
    expect(
      parseSoccerwayIdentifier(
        `https://www.soccerway.com/${leagueId}/standings/overall/`,
        'league',
      ),
    ).toBe(leagueId);
    expect(parseSoccerwayIdentifier(teamId, 'team')).toBe(teamId);
    expect(
      parseSoccerwayIdentifier(`https://www.soccerway.com/team/${teamId}/squad/`, 'team'),
    ).toBe(teamId);
    expect(deriveSoccerwayLeagueName(leagueId)).toBe('Chance Liga');
  });

  test('builds every supported provider and entity URL through Soccerbot', () => {
    expect(buildSourceUrl('transfermarkt', 'leagues', 'GB1', '2026')).toBe(
      'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1/plus?saison_id=2026',
    );
    expect(buildSourceUrl('transfermarkt', 'teams', '281', '2026')).toBe(
      'https://www.transfermarkt.com/slug/kader/verein/281/plus/1?saison_id=2026',
    );
    expect(buildSourceUrl('transfermarkt', 'players', '10')).toBeUndefined();
    expect(buildSourceUrl('soccerway', 'leagues', 'czech/chance/standings/id')).toBe(
      'https://www.soccerway.com/czech/chance/standings/id/standings/overall/',
    );
    expect(buildSourceUrl('soccerway', 'teams', 'slavia/id')).toBe(
      'https://www.soccerway.com/team/slavia/id/squad/',
    );
    expect(buildSourceUrl('soccerway', 'players', 'kolar/id')).toBe(
      'https://www.soccerway.com/player/kolar/id/',
    );
    expect(buildSourceUrl('worldfootball', 'leagues', 'co7093/mexico-lp---serie-b', '2026')).toBe(
      'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
    );
    expect(buildSourceUrl('worldfootball', 'teams', 'te237557/artesanos-metepec', '2026')).toBe(
      'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
    );
    expect(buildSourceUrl('worldfootball', 'players', 'pe599828/oscar-altamirano')).toBe(
      'https://www.worldfootball.net/person/pe599828/oscar-altamirano/',
    );
    expect(buildSourceUrl('eurofotbal', 'leagues', 'chance-liga/2026-2027', '2026')).toBe(
      'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
    );
    expect(buildSourceUrl('eurofotbal', 'teams', 'cesko/sparta-praha', '2026')).toBe(
      'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
    );
    expect(buildSourceUrl('eurofotbal', 'players', 'cesko/example-player')).toBeUndefined();
  });

  test('rejects URLs and IDs that do not match the chosen provider or entity', () => {
    for (const [value, kind] of [
      ['slavia-prague/viXGgnyB', 'league'],
      ['czech-republic/chance-liga/standings/bNFMkskm', 'team'],
      ['https://example.com/team/slavia-prague/viXGgnyB/squad/', 'team'],
      ['https://www.transfermarkt.com/slug/kader/verein/281/plus/1', 'team'],
    ] as const) {
      expect(() => parseSoccerwayIdentifier(value, kind)).toThrow(ApplicationError);
    }
    expect(() =>
      parseSourceIdentifier(
        'transfermarkt',
        'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
        'team',
      ),
    ).toThrow(ApplicationError);
  });

  test('dispatches Soccerway league previews without forwarding or returning a season', async () => {
    const league = vi.spyOn(soccerway, 'league').mockResolvedValue({
      ok: true,
      data: [{ id: 'slavia-prague/viXGgnyB', name: 'Slavia Prague' }],
    });
    const scraper = new SoccerbotScraper();

    await expect(
      scraper.previewLeague({
        sourceName: 'soccerway',
        identifierOrUrl: 'czech-republic/chance-liga/standings/bNFMkskm',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
      name: 'Chance Liga',
      season: undefined,
      sourceUrl:
        'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
      teams: [
        {
          sourceId: 'slavia-prague/viXGgnyB',
          name: 'Slavia Prague',
          season: undefined,
          sourceUrl: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
        },
      ],
    });
    expect(league).toHaveBeenCalledWith('czech-republic/chance-liga/standings/bNFMkskm');
  });

  test('dispatches Soccerway team previews and normalizes its player path IDs', async () => {
    const team = vi.spyOn(soccerway, 'team').mockResolvedValue({
      ok: true,
      data: [{ id: 'kolar-ondrej/xfBGcS1U', name: 'Ondřej Kolář' }],
    });
    const scraper = new SoccerbotScraper();

    await expect(
      scraper.previewTeam({
        sourceName: 'soccerway',
        identifierOrUrl: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
        name: 'Slavia Prague',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'slavia-prague/viXGgnyB',
      name: 'Slavia Prague',
      season: undefined,
      sourceUrl: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
      players: [{ sourceId: 'kolar-ondrej/xfBGcS1U', name: 'Ondřej Kolář' }],
    });
    expect(team).toHaveBeenCalledWith('slavia-prague/viXGgnyB');
  });

  test('requires four-digit Transfermarkt seasons and forwards valid values', async () => {
    const team = vi.spyOn(transfermarkt, 'team').mockResolvedValue({ ok: true, data: [] });
    const scraper = new SoccerbotScraper();
    await expect(
      scraper.previewTeam({
        sourceName: 'transfermarkt',
        identifierOrUrl: '281',
        name: 'Manchester City',
        season: '26',
      }),
    ).rejects.toThrow('Season must be a four-digit year.');
    await expect(
      scraper.previewTeam({
        sourceName: 'transfermarkt',
        identifierOrUrl: '281',
        name: 'Manchester City',
        season: '2026',
      }),
    ).resolves.toMatchObject({
      season: '2026',
      sourceUrl: 'https://www.transfermarkt.com/slug/kader/verein/281/plus/1?saison_id=2026',
    });
    expect(team).toHaveBeenCalledWith('281', '2026');
  });
});

describe('WorldFootball identifiers and previews', () => {
  test('accepts canonical IDs and URLs and derives a league name from the slug', () => {
    const leagueId = 'co7093/mexico-lp---serie-b';
    const teamId = 'te237557/artesanos-metepec';

    expect(parseWorldFootballIdentifier(leagueId, 'league')).toBe(leagueId);
    expect(
      parseWorldFootballIdentifier(
        `https://www.worldfootball.net/competition/${leagueId}/`,
        'league',
      ),
    ).toBe(leagueId);
    expect(parseWorldFootballIdentifier(teamId, 'team')).toBe(teamId);
    expect(
      parseWorldFootballIdentifier(`https://www.worldfootball.net/teams/${teamId}/squad/`, 'team'),
    ).toBe(teamId);
    expect(deriveWorldFootballLeagueName(leagueId)).toBe('Mexico Lp Serie B');
  });

  test('rejects malformed, mismatched, unrelated, and LiveFutbol identifiers', () => {
    for (const [value, kind] of [
      ['co7093/mexico-lp---serie-b', 'team'],
      ['te237557/artesanos-metepec', 'league'],
      ['https://example.com/competition/co7093/mexico-lp---serie-b/', 'league'],
      ['https://www.livefutbol.com/teams/te237557/artesanos-metepec/squad/', 'team'],
      ['https://www.worldfootball.net/person/pe599828/oscar-altamirano/', 'team'],
    ] as const) {
      expect(() => parseWorldFootballIdentifier(value, kind)).toThrow(ApplicationError);
    }
  });

  test('dispatches seasonless league and team previews with canonical source URLs', async () => {
    const league = vi.spyOn(worldfootball, 'league').mockResolvedValue({
      ok: true,
      data: [{ id: 'te237557/artesanos-metepec', name: 'Artesanos Metepec' }],
    });
    const team = vi.spyOn(worldfootball, 'team').mockResolvedValue({
      ok: true,
      data: [{ id: 'pe599828/oscar-altamirano', name: 'Óscar Altamirano' }],
    });
    const scraper = new SoccerbotScraper();

    await expect(
      scraper.previewLeague({
        sourceName: 'worldfootball',
        identifierOrUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'co7093/mexico-lp---serie-b',
      name: 'Mexico Lp Serie B',
      season: undefined,
      sourceUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
      teams: [
        {
          sourceId: 'te237557/artesanos-metepec',
          name: 'Artesanos Metepec',
          season: undefined,
          sourceUrl: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
        },
      ],
    });
    await expect(
      scraper.previewTeam({
        sourceName: 'worldfootball',
        identifierOrUrl: 'te237557/artesanos-metepec',
        name: 'Artesanos Metepec',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'te237557/artesanos-metepec',
      name: 'Artesanos Metepec',
      season: undefined,
      sourceUrl: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
      players: [{ sourceId: 'pe599828/oscar-altamirano', name: 'Óscar Altamirano' }],
    });
    expect(league).toHaveBeenCalledWith('co7093/mexico-lp---serie-b');
    expect(team).toHaveBeenCalledWith('te237557/artesanos-metepec');
  });

  test('reports progress and stops a WorldFootball league import after the active squad', async () => {
    const scraper = new SoccerbotScraper();
    const team = vi.spyOn(worldfootball, 'team').mockImplementation(() => {
      scraper.cancel('worldfootball-job');
      return Promise.resolve({ ok: true, data: [] });
    });
    const progress = vi.fn();

    await expect(
      scraper.previewTeams(
        'worldfootball',
        'worldfootball-job',
        [
          {
            sourceId: 'te237557/artesanos-metepec',
            name: 'Artesanos Metepec',
            sourceUrl: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
          },
          {
            sourceId: 'te162876/sporting-caneramy',
            name: 'Sporting Caneramy',
            sourceUrl: 'https://www.worldfootball.net/teams/te162876/sporting-caneramy/squad/',
          },
        ],
        progress,
      ),
    ).resolves.toHaveLength(1);
    expect(team).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenNthCalledWith(1, {
      jobId: 'worldfootball-job',
      completed: 1,
      total: 2,
      currentTeam: 'Artesanos Metepec',
      canceled: false,
    });
    expect(progress).toHaveBeenNthCalledWith(2, {
      jobId: 'worldfootball-job',
      completed: 1,
      total: 2,
      currentTeam: 'Sporting Caneramy',
      canceled: true,
    });
  });

  test('returns a provider-specific error when WorldFootball cannot load a league', async () => {
    vi.spyOn(worldfootball, 'league').mockResolvedValue({
      ok: false,
      errors: new Error('Blocked'),
    });

    await expect(
      new SoccerbotScraper().previewLeague({
        sourceName: 'worldfootball',
        identifierOrUrl: 'co7093/mexico-lp---serie-b',
      }),
    ).rejects.toThrow('WorldFootball league could not be loaded.');
  });
});

describe('Eurofotbal identifiers and previews', () => {
  test('accepts canonical IDs and URLs and derives a league name from the slug', () => {
    const leagueId = 'chance-liga/2026-2027';
    const teamId = 'cesko/sparta-praha';

    expect(parseEurofotbalIdentifier(leagueId, 'league')).toBe(leagueId);
    expect(
      parseEurofotbalIdentifier(`https://www.eurofotbal.cz/${leagueId}/tabulky/`, 'league'),
    ).toBe(leagueId);
    expect(parseEurofotbalIdentifier(teamId, 'team')).toBe(teamId);
    expect(
      parseEurofotbalIdentifier(`https://www.eurofotbal.cz/kluby/${teamId}/soupiska`, 'team'),
    ).toBe(teamId);
    expect(deriveEurofotbalLeagueName(leagueId)).toBe('Chance Liga');
  });

  test('rejects malformed, mismatched, unrelated, and player URLs', () => {
    for (const [value, kind] of [
      ['chance-liga', 'league'],
      ['https://example.com/chance-liga/2026-2027/tabulky/', 'league'],
      ['https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska', 'league'],
      ['https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/', 'team'],
      ['https://www.eurofotbal.cz/hraci/cesko/example-player/', 'team'],
    ] as const) {
      expect(() => parseEurofotbalIdentifier(value, kind)).toThrow(ApplicationError);
    }
  });

  test('dispatches seasonless league and team previews with canonical source URLs', async () => {
    const league = vi.spyOn(eurofotbal, 'league').mockResolvedValue({
      ok: true,
      data: [{ id: 'cesko/sparta-praha', name: 'Sparta Praha' }],
    });
    const team = vi.spyOn(eurofotbal, 'team').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'cesko/example-player',
          name: 'Example Player',
          jerseyNumber: 10,
          position: SoccerBotPositionGroup.MIDFIELDER,
        },
      ],
    });
    const scraper = new SoccerbotScraper();

    await expect(
      scraper.previewLeague({
        sourceName: 'eurofotbal',
        identifierOrUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'chance-liga/2026-2027',
      name: 'Chance Liga',
      season: undefined,
      sourceUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
      teams: [
        {
          sourceId: 'cesko/sparta-praha',
          name: 'Sparta Praha',
          season: undefined,
          sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
        },
      ],
    });
    await expect(
      scraper.previewTeam({
        sourceName: 'eurofotbal',
        identifierOrUrl: 'cesko/sparta-praha',
        name: 'Sparta Praha',
        season: '2026',
      }),
    ).resolves.toEqual({
      sourceId: 'cesko/sparta-praha',
      name: 'Sparta Praha',
      season: undefined,
      sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
      players: [
        {
          sourceId: 'cesko/example-player',
          name: 'Example Player',
          jerseyNumber: 10,
          position: 'MIDFIELDER',
        },
      ],
    });
    expect(league).toHaveBeenCalledWith('chance-liga/2026-2027');
    expect(team).toHaveBeenCalledWith('cesko/sparta-praha');
  });

  test('reports progress, honors cancellation, and returns provider-specific errors', async () => {
    const scraper = new SoccerbotScraper();
    const team = vi.spyOn(eurofotbal, 'team').mockImplementation(() => {
      scraper.cancel('eurofotbal-job');
      return Promise.resolve({ ok: true, data: [] });
    });
    const progress = vi.fn();

    await expect(
      scraper.previewTeams(
        'eurofotbal',
        'eurofotbal-job',
        [
          {
            sourceId: 'cesko/sparta-praha',
            name: 'Sparta Praha',
            sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
          },
          {
            sourceId: 'cesko/slavia-praha',
            name: 'Slavia Praha',
            sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/slavia-praha/soupiska',
          },
        ],
        progress,
      ),
    ).resolves.toHaveLength(1);
    expect(team).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith({
      jobId: 'eurofotbal-job',
      completed: 1,
      total: 2,
      currentTeam: 'Slavia Praha',
      canceled: true,
    });

    vi.restoreAllMocks();
    vi.spyOn(eurofotbal, 'league').mockResolvedValue({
      ok: false,
      errors: new Error('Blocked'),
    });
    await expect(
      new SoccerbotScraper().previewLeague({
        sourceName: 'eurofotbal',
        identifierOrUrl: 'chance-liga/2026-2027',
      }),
    ).rejects.toThrow('Eurofotbal league could not be loaded.');
  });
});

describe('Transfermarkt players', () => {
  test('normalizes detailed positions without synthesizing missing values', () => {
    expect(
      normalizePlayer({
        id: '10',
        name: 'Example Striker',
        positionDetail: SoccerBotPositionDetail.ST,
      }),
    ).toMatchObject({ sourceId: '10', name: 'Example Striker', positionDetail: 'ST' });
    expect(normalizePlayer({ name: 'Unknown position' })).toMatchObject({
      name: 'Unknown position',
      positionDetail: undefined,
    });
  });
});
