import type { CustomBadgeColor } from './custom-badge.js';

export interface CombinedCustomBadge {
  id: string;
  name: string;
  description: string;
  color: CustomBadgeColor;
}

export interface CombinedCustomBadgeSummary extends CombinedCustomBadge {
  assignmentCount: number;
}
