import type { Routes } from '@angular/router';
import { documentationPages } from './documentation';

export const routes: Routes = [
  ...documentationPages.map((page) => ({
    path: page.path,
    title: `${page.title} · QDB Editor 16`,
    data: { page },
    loadComponent: () =>
      import('./documentation-page').then((module) => module.DocumentationPageComponent),
  })),
  { path: '**', redirectTo: '' },
];
