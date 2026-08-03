import type { Routes } from '@angular/router';

import { objectUnsavedGuard } from './features/objects/object-unsaved.guard';

const sourceEntityRoutes: Routes = (['leagues', 'teams', 'players'] as const).map((entity) => ({
  path: `source/objects/${entity}`,
  title: `${entity[0].toUpperCase()}${entity.slice(1)} · Source DB · QDB Editor 16`,
  data: { entity },
  loadComponent: () =>
    import('./features/project/entity-table-page/entity-table-page').then(
      (module) => module.EntityTablePage,
    ),
}));

const combinedEntityRoutes: Routes = (['leagues', 'teams', 'players'] as const).map((entity) => ({
  path: `combined/objects/${entity}`,
  title: `${entity[0].toUpperCase()}${entity.slice(1)} · Combined DB · QDB Editor 16`,
  data: { entity },
  loadComponent: () =>
    import('./features/project/combined-entity-page/combined-entity-page').then(
      (module) => module.CombinedEntityPage,
    ),
}));

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  {
    path: 'projects',
    title: 'Projects · QDB Editor 16',
    loadComponent: () =>
      import('./features/projects/projects-page').then((module) => module.ProjectsPage),
  },
  {
    path: 'projects/new',
    title: 'New project · QDB Editor 16',
    loadComponent: () =>
      import('./features/projects/project-form-page').then((module) => module.ProjectFormPage),
  },
  {
    path: 'projects/:projectId/edit',
    title: 'Edit project · QDB Editor 16',
    loadComponent: () =>
      import('./features/projects/project-form-page').then((module) => module.ProjectFormPage),
  },
  {
    path: 'projects/:projectId',
    children: [
      {
        path: '',
        title: 'Project overview · QDB Editor 16',
        loadComponent: () =>
          import('./features/project/overview-page/overview-page').then(
            (module) => module.OverviewPage,
          ),
      },
      {
        path: 'manage',
        title: 'Project data settings · QDB Editor 16',
        loadComponent: () =>
          import('./features/settings/settings-page/settings-page').then(
            (module) => module.ProjectSettingsPage,
          ),
      },
      {
        path: 'source',
        pathMatch: 'full',
        redirectTo: 'source/objects/leagues',
      },
      {
        path: 'source/import',
        title: 'Import · Source DB · QDB Editor 16',
        loadComponent: () =>
          import('./features/project/import-page/import-page').then((module) => module.ImportPage),
      },
      ...sourceEntityRoutes,
      {
        path: 'source/export',
        title: 'Export · Source DB · QDB Editor 16',
        data: { dataset: 'source' },
        loadComponent: () =>
          import('./features/project/export-page/export-page').then((module) => module.ExportPage),
      },
      {
        path: 'combined',
        pathMatch: 'full',
        redirectTo: 'combined/objects/leagues',
      },
      {
        path: 'combined/import',
        title: 'Import · Combined DB · QDB Editor 16',
        loadComponent: () =>
          import('./features/project/combined-team-import-page/combined-team-import-page').then(
            (module) => module.CombinedTeamImportPage,
          ),
      },
      ...combinedEntityRoutes,
      {
        path: 'combined/export',
        title: 'Export · Combined DB · QDB Editor 16',
        data: { dataset: 'combined' },
        loadComponent: () =>
          import('./features/project/export-page/export-page').then((module) => module.ExportPage),
      },
      {
        path: 'fifa',
        title: 'FIFA DB · QDB Editor 16',
        loadComponent: () =>
          import('./features/databases/databases-page').then((module) => module.DatabasesPage),
      },
      {
        path: 'fifa/new',
        title: 'New FIFA database · QDB Editor 16',
        loadComponent: () =>
          import('./features/databases/blank-database-page').then(
            (module) => module.BlankDatabasePage,
          ),
      },
      {
        path: 'fifa/import',
        title: 'Import FIFA database · QDB Editor 16',
        loadComponent: () =>
          import('./features/import/import-page').then((module) => module.ImportPage),
      },
      {
        path: 'fifa/:databaseId/tables',
        title: 'Tables · QDB Editor 16',
        loadComponent: () =>
          import('./features/tables/tables-page').then((module) => module.TablesPage),
      },
      {
        path: 'fifa/:databaseId/tables/:table',
        title: 'Table editor · QDB Editor 16',
        loadComponent: () =>
          import('./features/table-editor/table-editor-page').then(
            (module) => module.TableEditorPage,
          ),
      },
      {
        path: 'fifa/:databaseId/objects',
        loadChildren: () =>
          import('./features/objects/objects.routes').then((module) => module.OBJECT_ROUTES),
      },
      {
        path: 'fifa/:databaseId/settings',
        title: 'Database object settings · QDB Editor 16',
        canDeactivate: [objectUnsavedGuard],
        loadComponent: () =>
          import('./features/object-settings/object-settings-page').then(
            (module) => module.ObjectSettingsPage,
          ),
      },
      {
        path: 'fifa/:databaseId/validation',
        title: 'Validation · QDB Editor 16',
        loadComponent: () =>
          import('./features/validation/validation-page').then((module) => module.ValidationPage),
      },
      {
        path: 'fifa/:databaseId/export',
        title: 'Export · QDB Editor 16',
        loadComponent: () =>
          import('./features/export/export-page').then((module) => module.ExportPage),
      },
    ],
  },
  {
    path: 'projects/:projectId/import',
    redirectTo: 'projects/:projectId/fifa/import',
  },
  {
    path: 'projects/:projectId/databases/new',
    redirectTo: 'projects/:projectId/fifa/new',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/tables',
    redirectTo: 'projects/:projectId/fifa/:databaseId/tables',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/tables/:table',
    redirectTo: 'projects/:projectId/fifa/:databaseId/tables/:table',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/objects/:kind',
    redirectTo: 'projects/:projectId/fifa/:databaseId/objects/:kind',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/settings',
    redirectTo: 'projects/:projectId/fifa/:databaseId/settings',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/validation',
    redirectTo: 'projects/:projectId/fifa/:databaseId/validation',
  },
  {
    path: 'projects/:projectId/databases/:databaseId/export',
    redirectTo: 'projects/:projectId/fifa/:databaseId/export',
  },
  {
    path: 'settings',
    title: 'Settings · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/settings-page').then((module) => module.SettingsPage),
  },
  {
    path: 'settings/migration',
    title: 'QDB Downloader migration · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/legacy-migration-page').then(
        (module) => module.LegacyMigrationPage,
      ),
  },
  {
    path: 'settings/sources',
    title: 'Source settings · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/source-settings-page/source-settings-page').then(
        (module) => module.SourceSettingsPage,
      ),
  },
  {
    path: 'settings/badges',
    title: 'Source badges · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/badge-settings-page/badge-settings-page').then(
        (module) => module.BadgeSettingsPage,
      ),
  },
  {
    path: 'settings/columns',
    title: 'Source columns · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/column-settings-page/column-settings-page').then(
        (module) => module.ColumnSettingsPage,
      ),
  },
  {
    path: 'settings/export',
    title: 'Source export settings · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/export-settings-page/export-settings-page').then(
        (module) => module.ExportSettingsPage,
      ),
  },
  {
    path: 'settings/combined/badges',
    title: 'Combined badges · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/combined-badge-settings-page/combined-badge-settings-page').then(
        (module) => module.CombinedBadgeSettingsPage,
      ),
  },
  {
    path: 'settings/combined/columns',
    title: 'Combined columns · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/combined-column-settings-page/combined-column-settings-page').then(
        (module) => module.CombinedColumnSettingsPage,
      ),
  },
  { path: '**', redirectTo: 'projects' },
];
