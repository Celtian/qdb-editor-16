export const customBadgeColors = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;

export type CustomBadgeColor = (typeof customBadgeColors)[number];

export interface CustomBadge {
  id: string;
  name: string;
  description: string;
  color: CustomBadgeColor;
}

export interface CustomBadgeSummary extends CustomBadge {
  assignmentCount: number;
}

export const customBadgeLimits = {
  name: { max: 40 },
  description: { max: 200 },
} as const;

export const isCustomBadgeColor = (value: unknown): value is CustomBadgeColor =>
  typeof value === 'string' && customBadgeColors.includes(value as CustomBadgeColor);
