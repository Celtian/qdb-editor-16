import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'projects',
  },
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
    title: 'Databases · QDB Editor 16',
    loadComponent: () =>
      import('./features/databases/databases-page').then((module) => module.DatabasesPage),
  },
  {
    path: 'projects/:projectId/databases/new',
    title: 'New database · QDB Editor 16',
    loadComponent: () =>
      import('./features/databases/blank-database-page').then((module) => module.BlankDatabasePage),
  },
  {
    path: 'projects/:projectId/import',
    title: 'Import database · QDB Editor 16',
    loadComponent: () =>
      import('./features/import/import-page').then((module) => module.ImportPage),
  },
  {
    path: 'projects/:projectId/databases/:databaseId/tables',
    title: 'Tables · QDB Editor 16',
    loadComponent: () =>
      import('./features/tables/tables-page').then((module) => module.TablesPage),
  },
  {
    path: 'projects/:projectId/databases/:databaseId/tables/:table',
    title: 'Table editor · QDB Editor 16',
    loadComponent: () =>
      import('./features/table-editor/table-editor-page').then((module) => module.TableEditorPage),
  },
  {
    path: 'projects/:projectId/databases/:databaseId/validation',
    title: 'Validation · QDB Editor 16',
    loadComponent: () =>
      import('./features/validation/validation-page').then((module) => module.ValidationPage),
  },
  {
    path: 'projects/:projectId/databases/:databaseId/export',
    title: 'Export · QDB Editor 16',
    loadComponent: () =>
      import('./features/export/export-page').then((module) => module.ExportPage),
  },
  {
    path: 'settings',
    title: 'Settings · QDB Editor 16',
    loadComponent: () =>
      import('./features/settings/settings-page').then((module) => module.SettingsPage),
  },
  { path: '**', redirectTo: 'projects' },
];
