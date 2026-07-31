import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('electron routes', () => {
  it('exposes Source DB, Combined DB, FIFA DB, migration, and compatibility workflows', () => {
    const paths = routes.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'projects',
        'projects/new',
        'projects/:projectId/import',
        'projects/:projectId/databases/:databaseId/tables/:table',
        'projects/:projectId/databases/:databaseId/objects/:kind',
        'projects/:projectId/databases/:databaseId/settings',
        'projects/:projectId/databases/:databaseId/validation',
        'projects/:projectId/databases/:databaseId/export',
        'settings',
        'settings/migration',
        '**',
      ]),
    );
    const project = routes.find((route) => route.path === 'projects/:projectId');
    expect(project?.children?.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        '',
        'manage',
        'source/import',
        'source/objects/leagues',
        'source/objects/teams',
        'source/objects/players',
        'source/export',
        'combined/import',
        'combined/objects/leagues',
        'combined/objects/teams',
        'combined/objects/players',
        'combined/export',
        'fifa',
        'fifa/:databaseId/tables',
        'fifa/:databaseId/objects',
      ]),
    );
  });

  it.each([
    ['/projects/project/import', '/projects/project/fifa/import'],
    [
      '/projects/project/databases/database/tables/players',
      '/projects/project/fifa/database/tables/players',
    ],
    [
      '/projects/project/databases/database/objects/teams',
      '/projects/project/fifa/database/objects/teams',
    ],
    ['/projects/project/databases/database/settings', '/projects/project/fifa/database/settings'],
    [
      '/projects/project/databases/database/validation',
      '/projects/project/fifa/database/validation',
    ],
    ['/projects/project/databases/database/export', '/projects/project/fifa/database/export'],
  ])('redirects the legacy bookmark %s', async (legacyUrl, expectedUrl) => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(legacyUrl);
    expect(router.url).toBe(expectedUrl);
  });
});
