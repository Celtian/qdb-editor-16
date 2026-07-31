import { eurofotbal, soccerway, transfermarkt, worldfootball } from 'soccerbot';
import type {
  SoccerBotPlayer,
  SoccerBotResponse,
  SoccerBotTeam,
} from 'soccerbot/es5/shared/interfaces.js';
import {
  sourceLabels,
  sourceSupportsSeason,
  type ExternalTeam,
  type LeaguePreview,
  type PlayerInput,
  type PreviewLeagueRequest,
  type PreviewTeamRequest,
  type ScrapeProgress,
  type SourceName,
  type TeamPreview,
} from '../../shared/downloader/contracts.js';
import { ApplicationError } from './errors.js';
import { buildSourceUrl } from './source-url.js';

type IdentifierKind = 'league' | 'team';

const sourceIdPattern = /^[a-zA-Z0-9_-]+$/;
const soccerwayTeamIdPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;
const soccerwayLeagueIdPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/standings\/[a-zA-Z0-9_-]+$/;
const worldFootballLeagueIdPattern = /^co\d+\/[a-zA-Z0-9_-]+$/;
const worldFootballTeamIdPattern = /^te\d+\/[a-zA-Z0-9_-]+$/;
const eurofotbalIdPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;

const parseUrl = (value: string, sourceName: SourceName): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `The ${sourceLabels[sourceName]} URL is invalid.`,
    });
  }
  const supportedHost = {
    eurofotbal: /(^|\.)eurofotbal\.cz$/i,
    soccerway: /(^|\.)soccerway\.com$/i,
    transfermarkt: /(^|\.)transfermarkt\.[a-z.]+$/i,
    worldfootball: /(^|\.)worldfootball\.net$/i,
  }[sourceName].test(url.hostname);
  if (!supportedHost) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `Only ${sourceLabels[sourceName]} URLs are supported for this source.`,
    });
  }
  return url;
};

export const parseTransfermarktIdentifier = (value: string, kind: IdentifierKind): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: 'Enter a Transfermarkt source ID or URL.',
    });
  }
  if (!trimmed.includes('://')) {
    if (!sourceIdPattern.test(trimmed)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The Transfermarkt source ID is invalid.',
      });
    }
    return trimmed;
  }
  const url = parseUrl(trimmed, 'transfermarkt');
  const segment = kind === 'league' ? 'wettbewerb' : 'verein';
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.indexOf(segment);
  const identifier = index >= 0 ? parts[index + 1] : undefined;
  if (!identifier || !sourceIdPattern.test(identifier)) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `The URL does not contain a Transfermarkt ${kind} source ID.`,
    });
  }
  return identifier;
};

export const parseSoccerwayIdentifier = (value: string, kind: IdentifierKind): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: 'Enter a Soccerway source ID or URL.',
    });
  }
  let identifier = trimmed.replace(/^\/+|\/+$/g, '');
  if (trimmed.includes('://')) {
    const url = parseUrl(trimmed, 'soccerway');
    const parts = url.pathname.split('/').filter(Boolean);
    if (kind === 'team') {
      if (parts[0] !== 'team') identifier = '';
      else identifier = parts.slice(1, 3).join('/');
    } else {
      let suffixIndex = -1;
      for (let index = parts.length - 2; index >= 0; index -= 1) {
        if (parts[index] === 'standings' && parts[index + 1] === 'overall') {
          suffixIndex = index;
          break;
        }
      }
      identifier = (suffixIndex >= 0 ? parts.slice(0, suffixIndex) : parts).join('/');
    }
  }
  const pattern = kind === 'league' ? soccerwayLeagueIdPattern : soccerwayTeamIdPattern;
  if (!pattern.test(identifier)) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `The ${sourceLabels.soccerway} ${kind} source ID is invalid.`,
    });
  }
  return identifier;
};

export const parseWorldFootballIdentifier = (value: string, kind: IdentifierKind): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: 'Enter a WorldFootball source ID or URL.',
    });
  }
  let identifier = trimmed.replace(/^\/+|\/+$/g, '');
  if (trimmed.includes('://')) {
    const url = parseUrl(trimmed, 'worldfootball');
    const parts = url.pathname.split('/').filter(Boolean);
    const root = kind === 'league' ? 'competition' : 'teams';
    identifier = parts[0] === root ? parts.slice(1, 3).join('/') : '';
  }
  const pattern = kind === 'league' ? worldFootballLeagueIdPattern : worldFootballTeamIdPattern;
  if (!pattern.test(identifier)) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `The ${sourceLabels.worldfootball} ${kind} source ID is invalid.`,
    });
  }
  return identifier;
};

export const parseEurofotbalIdentifier = (value: string, kind: IdentifierKind): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: 'Enter a Eurofotbal source ID or URL.',
    });
  }
  let identifier = trimmed.replace(/^\/+|\/+$/g, '');
  if (trimmed.includes('://')) {
    const url = parseUrl(trimmed, 'eurofotbal');
    const parts = url.pathname.split('/').filter(Boolean);
    if (kind === 'league') {
      identifier = parts.length === 3 && parts[2] === 'tabulky' ? parts.slice(0, 2).join('/') : '';
    } else {
      identifier =
        parts.length === 4 && parts[0] === 'kluby' && parts[3] === 'soupiska'
          ? parts.slice(1, 3).join('/')
          : '';
    }
  }
  if (!eurofotbalIdPattern.test(identifier)) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: `The ${sourceLabels.eurofotbal} ${kind} source ID is invalid.`,
    });
  }
  return identifier;
};

export const parseSourceIdentifier = (
  sourceName: SourceName,
  value: string,
  kind: IdentifierKind,
): string => {
  switch (sourceName) {
    case 'eurofotbal':
      return parseEurofotbalIdentifier(value, kind);
    case 'transfermarkt':
      return parseTransfermarktIdentifier(value, kind);
    case 'soccerway':
      return parseSoccerwayIdentifier(value, kind);
    case 'worldfootball':
      return parseWorldFootballIdentifier(value, kind);
  }
};

const cleanSeason = (sourceName: SourceName, season: string | undefined): string | undefined => {
  if (!sourceSupportsSeason[sourceName]) return undefined;
  const value = season?.trim();
  if (!value) return undefined;
  if (!/^\d{4}$/.test(value)) {
    throw new ApplicationError({
      code: 'INVALID_INPUT',
      message: 'Season must be a four-digit year.',
    });
  }
  return value;
};

const decodeHtmlText = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');

export const parseTransfermarktLeagueName = (html: string): string | undefined => {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!title) return undefined;
  const name = decodeHtmlText(title)
    .replace(/<[^>]+>/g, '')
    .split('|')[0]
    ?.trim()
    .replace(/\s+(?:\d{2}|\d{4})\/\d{2}$/, '')
    .trim();
  return name || undefined;
};

export const deriveSoccerwayLeagueName = (sourceId: string): string => {
  const parts = sourceId.split('/').filter(Boolean);
  const standingsIndex = parts.indexOf('standings');
  const slug = standingsIndex > 0 ? parts[standingsIndex - 1] : '';
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('en'))
    .join(' ');
};

export const deriveWorldFootballLeagueName = (sourceId: string): string => {
  const slug = sourceId.split('/').filter(Boolean).at(-1) ?? '';
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('en'))
    .join(' ');
};

export const deriveEurofotbalLeagueName = (sourceId: string): string => {
  const slug = sourceId.split('/').find(Boolean) ?? '';
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('cs'))
    .join(' ');
};

const loadTransfermarktLeagueName = async (sourceUrl: string): Promise<string | undefined> => {
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
      },
    });
    if (!response.ok) return undefined;
    return parseTransfermarktLeagueName(await response.text());
  } catch {
    return undefined;
  }
};

export const normalizePlayer = (player: SoccerBotPlayer): PlayerInput | undefined => {
  const scrapedName = player.name?.trim();
  const composedName = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
  const name = [scrapedName ?? '', composedName].find((candidate) => candidate.length > 0) ?? '';
  if (!name) return undefined;
  return {
    sourceId: player.id,
    name,
    firstName: player.firstName,
    lastName: player.lastName,
    jerseyNumber: player.jerseyNumber,
    position: player.position,
    positionDetail: player.positionDetail,
    birthdate: player.birthdate,
    height: player.height,
    weight: player.weight,
    foot: player.foot,
    joined: player.joined,
    contractExpires: player.contractExpires,
    marketValue: player.marketValue,
    countryName: player.country?.databaseName,
    countryCode2: player.country?.code2,
    countryCode3: player.country?.code3,
    minutesPlayed: player.minutesPlayed,
  };
};

export class SoccerbotScraper {
  private readonly canceledJobs = new Set<string>();

  cancel(jobId: string): boolean {
    this.canceledJobs.add(jobId);
    return true;
  }

  async previewLeague(request: PreviewLeagueRequest): Promise<LeaguePreview> {
    const { sourceName } = request;
    const sourceId = parseSourceIdentifier(sourceName, request.identifierOrUrl, 'league');
    const season = cleanSeason(sourceName, request.season);
    const sourceUrl = buildSourceUrl(sourceName, 'leagues', sourceId, season);
    if (!sourceUrl) {
      throw new ApplicationError({ code: 'INVALID_INPUT', message: 'The source URL is invalid.' });
    }
    const namePromise =
      sourceName === 'transfermarkt'
        ? loadTransfermarktLeagueName(sourceUrl)
        : Promise.resolve(
            sourceName === 'soccerway'
              ? deriveSoccerwayLeagueName(sourceId)
              : sourceName === 'worldfootball'
                ? deriveWorldFootballLeagueName(sourceId)
                : deriveEurofotbalLeagueName(sourceId),
          );
    const response = await this.loadLeague(sourceName, sourceId, season);
    const teams = response
      .filter((team) => Boolean(team.id && team.name.trim()))
      .map<ExternalTeam>((team) => ({
        sourceId: team.id,
        name: team.name.trim(),
        season,
        sourceUrl: buildSourceUrl(sourceName, 'teams', team.id, season) ?? '',
      }));
    return { sourceId, name: await namePromise, season, sourceUrl, teams };
  }

  async previewTeam(request: PreviewTeamRequest): Promise<TeamPreview> {
    const { sourceName } = request;
    const sourceId = parseSourceIdentifier(sourceName, request.identifierOrUrl, 'team');
    const season = cleanSeason(sourceName, request.season);
    return this.loadTeam(sourceName, {
      sourceId,
      name: request.name.trim(),
      season,
      sourceUrl: buildSourceUrl(sourceName, 'teams', sourceId, season) ?? '',
    });
  }

  async previewTeams(
    sourceName: SourceName,
    jobId: string,
    teams: ExternalTeam[],
    onProgress: (progress: ScrapeProgress) => void,
  ): Promise<TeamPreview[]> {
    this.canceledJobs.delete(jobId);
    const previews: TeamPreview[] = [];
    for (const [index, team] of teams.entries()) {
      if (this.canceledJobs.has(jobId)) {
        onProgress({
          jobId,
          completed: index,
          total: teams.length,
          currentTeam: team.name,
          canceled: true,
        });
        break;
      }
      previews.push(await this.loadTeam(sourceName, team));
      onProgress({
        jobId,
        completed: index + 1,
        total: teams.length,
        currentTeam: team.name,
        canceled: false,
      });
    }
    this.canceledJobs.delete(jobId);
    return previews;
  }

  private async loadLeague(
    sourceName: SourceName,
    sourceId: string,
    season?: string,
  ): Promise<SoccerBotTeam[]> {
    let response: SoccerBotResponse<SoccerBotTeam[]>;
    try {
      switch (sourceName) {
        case 'eurofotbal':
          response = await eurofotbal.league(sourceId);
          break;
        case 'transfermarkt':
          response = await transfermarkt.league(sourceId, season);
          break;
        case 'soccerway':
          response = await soccerway.league(sourceId);
          break;
        case 'worldfootball':
          response = await worldfootball.league(sourceId);
          break;
      }
    } catch (error) {
      throw this.unreachableError(sourceName, 'league', error);
    }
    if (!response.ok || !response.data) {
      throw new ApplicationError({
        code: 'SCRAPE_FAILED',
        message: `${sourceLabels[sourceName]} league could not be loaded.`,
        details: response.errors ? JSON.stringify(response.errors) : undefined,
      });
    }
    return response.data;
  }

  private async loadTeam(sourceName: SourceName, team: ExternalTeam): Promise<TeamPreview> {
    if (!team.name.trim()) {
      throw new ApplicationError({ code: 'INVALID_INPUT', message: 'Team name is required.' });
    }
    let response: SoccerBotResponse<SoccerBotPlayer[]>;
    try {
      switch (sourceName) {
        case 'eurofotbal':
          response = await eurofotbal.team(team.sourceId);
          break;
        case 'transfermarkt':
          response = await transfermarkt.team(team.sourceId, team.season);
          break;
        case 'soccerway':
          response = await soccerway.team(team.sourceId);
          break;
        case 'worldfootball':
          response = await worldfootball.team(team.sourceId);
          break;
      }
    } catch (error) {
      throw this.unreachableError(sourceName, team.name, error);
    }
    if (!response.ok || !response.data) {
      throw new ApplicationError({
        code: 'SCRAPE_FAILED',
        message: `${team.name} could not be loaded from ${sourceLabels[sourceName]}.`,
        details: response.errors ? JSON.stringify(response.errors) : undefined,
      });
    }
    return {
      ...team,
      players: response.data
        .map(normalizePlayer)
        .filter((player): player is PlayerInput => Boolean(player)),
    };
  }

  private unreachableError(
    sourceName: SourceName,
    subject: string,
    error: unknown,
  ): ApplicationError {
    return new ApplicationError(
      {
        code: 'SCRAPE_FAILED',
        message: `${subject} could not be fetched because ${sourceLabels[sourceName]} could not be reached.`,
        details: String(error),
      },
      { cause: error },
    );
  }
}
