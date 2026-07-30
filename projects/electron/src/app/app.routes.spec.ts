import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('electron routes', () => {
  it('exposes project, import, editing, validation, export, and settings workflows', () => {
    const paths = routes.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'projects',
        'projects/new',
        'projects/:projectId/import',
        'projects/:projectId/databases/:databaseId/tables/:table',
        'projects/:projectId/databases/:databaseId/objects',
        'projects/:projectId/databases/:databaseId/settings',
        'projects/:projectId/databases/:databaseId/validation',
        'projects/:projectId/databases/:databaseId/export',
        'settings',
        '**',
      ]),
    );
  });
});
