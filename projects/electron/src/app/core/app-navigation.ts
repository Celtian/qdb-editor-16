import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Tree, TreeItem, TreeItemGroup } from '@angular/aria/tree';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { AboutDialog } from './about-dialog';
import { AppStore } from './app-store';
import { OBJECT_CONFIG, OBJECT_KINDS } from '../features/objects/object-config';

const projectNode = (projectId: string): string => `project:${projectId}`;
const databaseNode = (projectId: string, databaseId: string): string =>
  `database:${projectId}:${databaseId}`;
const tablesNode = (projectId: string, databaseId: string): string =>
  `tables:${projectId}:${databaseId}`;
const tableNode = (projectId: string, databaseId: string, table: string): string =>
  `table:${projectId}:${databaseId}:${table}`;
const objectsNode = (projectId: string, databaseId: string): string =>
  `objects:${projectId}:${databaseId}`;
const objectNode = (projectId: string, databaseId: string, kind: string): string =>
  `object:${projectId}:${databaseId}:${kind}`;
const settingsNode = (projectId: string, databaseId: string): string =>
  `database-settings:${projectId}:${databaseId}`;
const validationNode = (projectId: string, databaseId: string): string =>
  `validation:${projectId}:${databaseId}`;
const exportNode = (projectId: string, databaseId: string): string =>
  `export:${projectId}:${databaseId}`;

@Component({
  selector: 'app-navigation',
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    RouterLink,
    RouterLinkActive,
    Tree,
    TreeItem,
    TreeItemGroup,
  ],
  templateUrl: './app-navigation.html',
  styleUrl: './app-navigation.css',
})
export class AppNavigation {
  protected readonly store = inject(AppStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly expandedNodes = signal<ReadonlySet<string>>(new Set());
  protected readonly currentNodes = signal<string[]>([]);

  protected readonly projectNode = projectNode;
  protected readonly databaseNode = databaseNode;
  protected readonly tablesNode = tablesNode;
  protected readonly tableNode = tableNode;
  protected readonly objectsNode = objectsNode;
  protected readonly objectNode = objectNode;
  protected readonly settingsNode = settingsNode;
  protected readonly objectKinds = OBJECT_KINDS;
  protected readonly objectConfig = OBJECT_CONFIG;
  protected readonly validationNode = validationNode;
  protected readonly exportNode = exportNode;

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(undefined),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.synchronizeRoute());
  }

  protected isExpanded(node: string): boolean {
    return this.expandedNodes().has(node);
  }

  protected projectExpanded(projectId: string, expanded: boolean): void {
    const node = projectNode(projectId);
    this.setExpanded(node, expanded);
    if (expanded) void this.store.ensureDatabases(projectId);
  }

  protected databaseExpanded(projectId: string, databaseId: string, expanded: boolean): void {
    this.setExpanded(databaseNode(projectId, databaseId), expanded);
  }

  protected tablesExpanded(projectId: string, databaseId: string, expanded: boolean): void {
    this.setExpanded(tablesNode(projectId, databaseId), expanded);
    if (expanded) void this.store.ensureTables(databaseId);
  }

  protected objectsExpanded(projectId: string, databaseId: string, expanded: boolean): void {
    this.setExpanded(objectsNode(projectId, databaseId), expanded);
  }

  protected toggleProject(event: Event, projectId: string): void {
    event.stopPropagation();
    this.projectExpanded(projectId, !this.isExpanded(projectNode(projectId)));
  }

  protected toggleDatabase(event: Event, projectId: string, databaseId: string): void {
    event.stopPropagation();
    this.databaseExpanded(
      projectId,
      databaseId,
      !this.isExpanded(databaseNode(projectId, databaseId)),
    );
  }

  protected toggleTables(event: Event, projectId: string, databaseId: string): void {
    event.stopPropagation();
    this.tablesExpanded(projectId, databaseId, !this.isExpanded(tablesNode(projectId, databaseId)));
  }

  protected toggleObjects(event: Event, projectId: string, databaseId: string): void {
    event.stopPropagation();
    const node = objectsNode(projectId, databaseId);
    this.setExpanded(node, !this.isExpanded(node));
  }

  protected retryDatabases(event: Event, projectId: string): void {
    event.stopPropagation();
    void this.store.ensureDatabases(projectId, true);
  }

  protected retryTables(event: Event, databaseId: string): void {
    event.stopPropagation();
    void this.store.ensureTables(databaseId, true);
  }

  protected navigateToNode(nodes: string[]): void {
    this.currentNodes.set(nodes);
    const node = nodes.at(-1);
    if (!node) return;
    const [kind, projectId, databaseId, value] = node.split(':');

    if (kind === 'project') void this.router.navigate(['/projects', projectId]);
    else if (kind === 'database' || kind === 'tables')
      void this.router.navigate(['/projects', projectId, 'databases', databaseId, 'tables']);
    else if (kind === 'table')
      void this.router.navigate(['/projects', projectId, 'databases', databaseId, 'tables', value]);
    else if (kind === 'objects')
      void this.router.navigate([
        '/projects',
        projectId,
        'databases',
        databaseId,
        'objects',
        'countries',
      ]);
    else if (kind === 'object')
      void this.router.navigate([
        '/projects',
        projectId,
        'databases',
        databaseId,
        'objects',
        value,
      ]);
    else if (kind === 'database-settings')
      void this.router.navigate(['/projects', projectId, 'databases', databaseId, 'settings']);
    else if (kind === 'validation')
      void this.router.navigate(['/projects', projectId, 'databases', databaseId, 'validation']);
    else if (kind === 'export')
      void this.router.navigate(['/projects', projectId, 'databases', databaseId, 'export']);
  }

  protected openAbout(): void {
    this.dialog.open(AboutDialog, {
      width: '35rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: '[aria-label="Close About dialog"]',
      restoreFocus: true,
    });
  }

  private setExpanded(node: string, expanded: boolean): void {
    this.expandedNodes.update((current) => {
      const next = new Set(current);
      if (expanded) next.add(node);
      else next.delete(node);
      return next;
    });
  }

  private async synchronizeRoute(): Promise<void> {
    const parameters: Record<string, string> = {};
    let route = this.router.routerState.snapshot.root;
    while (route) {
      Object.assign(parameters, route.params);
      route = route.firstChild!;
    }

    const projectId = parameters['projectId'];
    const databaseId = parameters['databaseId'];
    const table = parameters['table'];
    const url = this.router.url.split(/[?#]/, 1)[0] ?? '';

    if (!projectId) {
      this.currentNodes.set([]);
      return;
    }

    if (!databaseId) {
      this.currentNodes.set([projectNode(projectId)]);
      return;
    }

    this.setExpanded(projectNode(projectId), true);
    this.setExpanded(databaseNode(projectId, databaseId), true);

    let current = tablesNode(projectId, databaseId);
    if (url.endsWith('/validation')) current = validationNode(projectId, databaseId);
    else if (url.endsWith('/export')) current = exportNode(projectId, databaseId);
    else if (url.endsWith('/settings')) current = settingsNode(projectId, databaseId);
    else if (url.includes('/objects/')) {
      const objectKind = url.match(/\/objects\/([^/]+)/)?.[1] ?? 'countries';
      current = objectNode(projectId, databaseId, objectKind);
      this.setExpanded(objectsNode(projectId, databaseId), true);
    } else if (table) {
      current = tableNode(projectId, databaseId, table);
      this.setExpanded(tablesNode(projectId, databaseId), true);
    }
    this.currentNodes.set([current]);

    await this.store.ensureDatabases(projectId);
    if (table) await this.store.ensureTables(databaseId);
  }
}
