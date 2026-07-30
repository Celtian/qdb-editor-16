import type { Routes } from '@angular/router';
import type { ObjectKind, ObjectSection } from '../../../../shared/contracts';
import { objectUnsavedGuard } from './object-unsaved.guard';

const list = (kind: ObjectKind): Routes[number] => ({
  path: kind,
  title: `${kind[0]?.toLocaleUpperCase('en')}${kind.slice(1)} · QDB Editor 16`,
  data: { kind },
  loadComponent: () => import('./object-list-page').then((module) => module.ObjectListPage),
});

const detail = (kind: ObjectKind, section: ObjectSection, label: string): Routes[number] => ({
  path: `${kind}/:id/${section}`,
  title: `${label} · QDB Editor 16`,
  data: { kind, section },
  canDeactivate: [objectUnsavedGuard],
  loadComponent: () => import('./object-detail-page').then((module) => module.ObjectDetailPage),
});

export const OBJECT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'countries' },
  list('countries'),
  list('stadiums'),
  list('leagues'),
  { path: 'leagues/:id', pathMatch: 'full', redirectTo: 'leagues/:id/teams' },
  detail('leagues', 'teams', 'League teams'),
  detail('leagues', 'referees', 'League referees'),
  list('teams'),
  { path: 'teams/:id', pathMatch: 'full', redirectTo: 'teams/:id/identity' },
  detail('teams', 'identity', 'Team identity'),
  detail('teams', 'traits', 'Team traits'),
  detail('teams', 'tactics', 'Team tactics'),
  detail('teams', 'manager', 'Team manager'),
  detail('teams', 'stadium', 'Team stadium'),
  detail('teams', 'location', 'Team location'),
  detail('teams', 'players', 'Team players'),
  detail('teams', 'jersey-numbers', 'Team jersey numbers'),
  list('players'),
  { path: 'players/:id', pathMatch: 'full', redirectTo: 'players/:id/identity' },
  detail('players', 'identity', 'Player identity'),
  detail('players', 'contract', 'Player contract'),
  detail('players', 'appearance', 'Player appearance'),
  detail('players', 'gear', 'Player gear'),
  detail('players', 'traits', 'Player traits'),
  detail('players', 'skills', 'Player skills'),
  detail('players', 'behaviour', 'Player behaviour'),
  list('referees'),
  { path: 'referees/:id', pathMatch: 'full', redirectTo: 'referees/:id/identity' },
  detail('referees', 'identity', 'Referee identity'),
  detail('referees', 'appearance', 'Referee appearance'),
  detail('referees', 'gear', 'Referee gear'),
  detail('referees', 'leagues', 'Referee leagues'),
];
