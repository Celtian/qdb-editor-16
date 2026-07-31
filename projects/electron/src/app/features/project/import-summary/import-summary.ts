import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import {
  sourceLabels,
  sourceSupportsSeason,
  type CommitImportRequest,
  type ImportPreview,
  type LeagueSynchronizeImportOperation,
  type MergeImportOptions,
  type SourceName,
  type SynchronizeImportOperation,
} from '../../../../../shared/downloader/contracts';

export interface ImportSummaryDetails {
  operation: 'New import' | 'Update existing';
  sourceName: SourceName;
  entity: 'League' | 'Team';
  name: string;
  identifier: string;
  season?: string;
  teamCount: number;
  playerCount: number;
}

const isLeagueSynchronization = (
  operation: SynchronizeImportOperation,
): operation is LeagueSynchronizeImportOperation => operation.target.entity === 'leagues';

@Component({
  selector: 'app-import-summary',
  imports: [DecimalPipe, MatFormFieldModule, MatIconModule, MatSelectModule],
  templateUrl: './import-summary.html',
  styleUrl: './import-summary.css',
})
export class ImportSummary {
  readonly details = input.required<ImportSummaryDetails>();
  readonly preview = input.required<ImportPreview>();
  readonly request = input.required<CommitImportRequest>();
  readonly mergeOptions = input.required<MergeImportOptions>();
  readonly busy = input(false);
  readonly mergeOptionsChange = output<MergeImportOptions>();

  protected readonly rows = computed(() => [
    {
      label: 'Leagues',
      counts: { ...this.preview().changes.leagues, moved: 0, detached: 0, deduplicated: 0 },
    },
    {
      label: 'Teams',
      counts: { ...this.preview().changes.teams, deduplicated: 0 },
    },
    {
      label: 'Players',
      counts: { ...this.preview().changes.players, detached: 0 },
    },
  ]);
  protected readonly isMerge = computed(() => this.request().operation.kind === 'merge');
  protected readonly sourceLabel = computed(() => sourceLabels[this.details().sourceName]);
  protected readonly sourceLabels = sourceLabels;
  protected readonly sourceSupportsSeason = sourceSupportsSeason;
  protected readonly synchronizationPolicies = computed(() => {
    const operation = this.request().operation;
    return operation.kind === 'synchronize' ? this.describePolicies(operation) : [];
  });
  protected readonly hasLegacyCopies = computed(() =>
    this.preview().conflicts.playerTeamConflicts.some(({ legacyCopyCount }) => legacyCopyCount > 1),
  );
  protected readonly deletedCount = computed(() => {
    const changes = this.preview().changes;
    return changes.leagues.deleted + changes.teams.deleted + changes.players.deleted;
  });
  protected readonly detachedCount = computed(() => this.preview().changes.teams.detached);
  protected readonly deduplicatedCount = computed(
    () => this.preview().changes.players.deduplicated,
  );
  protected readonly hasOwnershipConflicts = computed(() => {
    const conflicts = this.preview().conflicts;
    return Boolean(conflicts.teamLeagueConflicts.length || conflicts.playerTeamConflicts.length);
  });

  protected changeExistingRecords(value: unknown): void {
    if (value !== 'refresh' && value !== 'keep') return;
    this.mergeOptionsChange.emit({ ...this.mergeOptions(), existingRecords: value });
  }

  protected changeTeamOwnership(value: unknown): void {
    if (value !== 'move' && value !== 'keep') return;
    this.mergeOptionsChange.emit({ ...this.mergeOptions(), teamLeagueConflicts: value });
  }

  protected changePlayerOwnership(value: unknown): void {
    if (value !== 'move' && value !== 'keep') return;
    if (this.hasLegacyCopies() && value !== 'move') return;
    this.mergeOptionsChange.emit({ ...this.mergeOptions(), playerTeamConflicts: value });
  }

  private describePolicies(operation: SynchronizeImportOperation): string[] {
    const playerPolicy =
      operation.options.absentPlayers === 'delete'
        ? 'Absent players will be permanently deleted.'
        : 'Absent players will be kept unchanged.';
    const playerNames = operation.options.overridePlayerNames
      ? `Existing player names will be replaced with ${this.sourceLabel()} names.`
      : 'Existing player names will be preserved.';
    const playerOwnership =
      operation.options.playerTeamConflicts === 'move'
        ? 'Players found in another team will be moved to the imported team.'
        : 'Players found in another team will remain there and be skipped.';
    if (!isLeagueSynchronization(operation)) return [playerPolicy, playerNames, playerOwnership];

    const teamPolicy = {
      keep: 'Absent teams will be kept in this league unchanged.',
      detach: 'Absent teams will be removed from this league but kept with their squads.',
      delete: 'Absent teams and their squads will be permanently deleted.',
    }[operation.options.absentTeams];
    const teamNames = operation.options.overrideTeamNames
      ? `Existing team names will be replaced with ${this.sourceLabel()} names.`
      : 'Existing team names will be preserved.';
    const teamOwnership =
      operation.options.teamLeagueConflicts === 'move'
        ? 'Teams found in another league will be moved to this league.'
        : 'Teams found in another league will remain there.';
    return [teamPolicy, playerPolicy, teamNames, playerNames, teamOwnership, playerOwnership];
  }
}
