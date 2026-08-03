import { Tree, TreeItem, TreeItemGroup } from '@angular/aria/tree';
import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';

import { filter, startWith } from 'rxjs';

import { OBJECT_CONFIG, OBJECT_KINDS } from '../features/objects/object-config';
import { AboutDialog } from './about-dialog';
import { AppStore } from './app-store';

const projectNode = (projectId: string): string => `project:${projectId}`;
const sourceNode = (projectId: string): string => `source:${projectId}`;
const sourceImportNode = (projectId: string): string => `source-import:${projectId}`;
const sourceObjectsNode = (projectId: string): string => `source-objects:${projectId}`;
const sourceObjectNode = (projectId: string, kind: string): string =>
  `source-object:${projectId}:${kind}`;
const sourceExportNode = (projectId: string): string => `source-export:${projectId}`;
const combinedNode = (projectId: string): string => `combined:${projectId}`;
const combinedImportNode = (projectId: string): string => `combined-import:${projectId}`;
const combinedObjectsNode = (projectId: string): string => `combined-objects:${projectId}`;
const combinedObjectNode = (projectId: string, kind: string): string =>
  `combined-object:${projectId}:${kind}`;
const combinedExportNode = (projectId: string): string => `combined-export:${projectId}`;
const fifaNode = (projectId: string): string => `fifa:${projectId}`;
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
  protected readonly sourceNode = sourceNode;
  protected readonly sourceImportNode = sourceImportNode;
  protected readonly sourceObjectsNode = sourceObjectsNode;
  protected readonly sourceObjectNode = sourceObjectNode;
  protected readonly sourceExportNode = sourceExportNode;
  protected readonly combinedNode = combinedNode;
  protected readonly combinedImportNode = combinedImportNode;
  protected readonly combinedObjectsNode = combinedObjectsNode;
  protected readonly combinedObjectNode = combinedObjectNode;
  protected readonly combinedExportNode = combinedExportNode;
  protected readonly fifaNode = fifaNode;
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
  protected readonly sourceObjectKinds = [
    { kind: 'leagues', label: 'Leagues', icon: 'emoji_events' },
    { kind: 'teams', label: 'Teams', icon: 'shield' },
    { kind: 'players', label: 'Players', icon: 'groups' },
  ] as const;

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

  protected nodeExpanded(node: string, expanded: boolean): void {
    this.setExpanded(node, expanded);
  }

  protected projectExpanded(projectId: string, expanded: boolean): void {
    this.setExpanded(projectNode(projectId), expanded);
  }

  protected fifaExpanded(projectId: string, expanded: boolean): void {
    this.setExpanded(fifaNode(projectId), expanded);
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

  protected toggleNode(event: Event, node: string): void {
    event.stopPropagation();
    this.setExpanded(node, !this.isExpanded(node));
  }

  protected toggleFifa(event: Event, projectId: string): void {
    event.stopPropagation();
    this.fifaExpanded(projectId, !this.isExpanded(fifaNode(projectId)));
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
    else if (kind === 'source' || kind === 'source-objects')
      void this.router.navigate(['/projects', projectId, 'source', 'objects', 'leagues']);
    else if (kind === 'source-import')
      void this.router.navigate(['/projects', projectId, 'source', 'import']);
    else if (kind === 'source-object')
      void this.router.navigate(['/projects', projectId, 'source', 'objects', databaseId]);
    else if (kind === 'source-export')
      void this.router.navigate(['/projects', projectId, 'source', 'export']);
    else if (kind === 'combined' || kind === 'combined-objects')
      void this.router.navigate(['/projects', projectId, 'combined', 'objects', 'leagues']);
    else if (kind === 'combined-import')
      void this.router.navigate(['/projects', projectId, 'combined', 'import']);
    else if (kind === 'combined-object')
      void this.router.navigate(['/projects', projectId, 'combined', 'objects', databaseId]);
    else if (kind === 'combined-export')
      void this.router.navigate(['/projects', projectId, 'combined', 'export']);
    else if (kind === 'fifa') void this.router.navigate(['/projects', projectId, 'fifa']);
    else if (kind === 'database' || kind === 'tables')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'tables']);
    else if (kind === 'table')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'tables', value]);
    else if (kind === 'objects')
      void this.router.navigate([
        '/projects',
        projectId,
        'fifa',
        databaseId,
        'objects',
        'countries',
      ]);
    else if (kind === 'object')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'objects', value]);
    else if (kind === 'database-settings')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'settings']);
    else if (kind === 'validation')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'validation']);
    else if (kind === 'export')
      void this.router.navigate(['/projects', projectId, 'fifa', databaseId, 'export']);
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

    this.setExpanded(projectNode(projectId), true);

    if (url.includes('/source/')) {
      this.setExpanded(sourceNode(projectId), true);
      let current = sourceNode(projectId);
      if (url.endsWith('/source/import')) current = sourceImportNode(projectId);
      else if (url.endsWith('/source/export')) current = sourceExportNode(projectId);
      else if (url.includes('/source/objects/')) {
        const kind = url.match(/\/source\/objects\/([^/]+)/)?.[1] ?? 'leagues';
        current = sourceObjectNode(projectId, kind);
        this.setExpanded(sourceObjectsNode(projectId), true);
      }
      this.currentNodes.set([current]);
      return;
    }

    if (url.includes('/combined/')) {
      this.setExpanded(combinedNode(projectId), true);
      let current = combinedNode(projectId);
      if (url.endsWith('/combined/import')) current = combinedImportNode(projectId);
      else if (url.endsWith('/combined/export')) current = combinedExportNode(projectId);
      else if (url.includes('/combined/objects/')) {
        const kind = url.match(/\/combined\/objects\/([^/]+)/)?.[1] ?? 'leagues';
        current = combinedObjectNode(projectId, kind);
        this.setExpanded(combinedObjectsNode(projectId), true);
      }
      this.currentNodes.set([current]);
      return;
    }

    if (!url.includes('/fifa')) {
      this.currentNodes.set([projectNode(projectId)]);
      return;
    }

    this.setExpanded(fifaNode(projectId), true);
    await this.store.ensureDatabases(projectId);
    if (!databaseId) {
      this.currentNodes.set([fifaNode(projectId)]);
      return;
    }

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

    if (table) await this.store.ensureTables(databaseId);
  }
}
