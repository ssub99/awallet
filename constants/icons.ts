/**
 * Icon System Constants
 * 
 * Centralized icon configuration and type definitions.
 * This file provides icon metadata and groupings for better organization.
 */

import { IconName } from '@/components/ui/icon';

/**
 * Icon categories for organization
 */
export const IconCategories = {
  /**
   * Navigation icons
   */
  navigation: [
    'home',
    'mypage',
    'setting',
    'arrowLeft',
    'arrowRight',
    'arrowUp',
    'arrowDown',
  ] as const,
  
  /**
   * Action icons
   */
  actions: [
    'addTask',
    'delete',
    'close',
    'check',
    'search',
  ] as const,
  
  /**
   * Calendar and time icons
   */
  calendar: [
    'calendarMonth',
    'calendarYear',
  ] as const,
  
  /**
   * User and profile icons
   */
  user: [
    'person',
    'profile',
  ] as const,
  
  /**
   * System icons
   */
  system: [
    'info',
    'lock',
    'handle',
  ] as const,
} as const;

/**
 * Icon size presets
 * Based on common use cases
 */
export const IconSizes = {
  /** Extra small - 12px */
  xs: 12,
  /** Small - 16px */
  sm: 16,
  /** Medium - 20px */
  md: 20,
  /** Regular - 24px (default) */
  regular: 24,
  /** Large - 28px */
  lg: 28,
  /** Extra large - 32px */
  xl: 32,
  /** 2X large - 40px */
  xxl: 40,
} as const;

/**
 * Icon descriptions for accessibility and documentation
 */
export const IconDescriptions: Record<IconName, string> = {
  addTask: 'Add new task',
  arrowDown: 'Arrow pointing down',
  arrowLeft: 'Arrow pointing left',
  arrowRight: 'Arrow pointing right',
  arrowUp: 'Arrow pointing up',
  calendarMonth: 'Monthly calendar',
  calendarYear: 'Yearly calendar',
  check: 'Checkmark',
  checkboxIcon: 'Checkbox checkmark icon',
  close: 'Close or dismiss',
  delete: 'Delete or remove',
  handle: 'Drag handle',
  home: 'Home or main screen',
  info: 'Information',
  lock: 'Lock or secure',
  mypage: 'My page or profile',
  person: 'Person or user',
  profile: 'User profile',
  search: 'Search',
  setting: 'Settings or configuration',
};

/**
 * Get icon description for accessibility
 */
export function getIconDescription(name: IconName): string {
  return IconDescriptions[name];
}

/**
 * Check if icon is available in category
 */
export function isIconInCategory(
  icon: IconName,
  category: keyof typeof IconCategories
): boolean {
  return IconCategories[category].includes(icon as never);
}

/**
 * Icon metadata type
 */
export interface IconMetadata {
  name: IconName;
  description: string;
  category: keyof typeof IconCategories | 'other';
  hasSolid: boolean;
}

/**
 * Get comprehensive icon metadata
 */
export function getIconMetadata(name: IconName): IconMetadata {
  // Find category
  let category: keyof typeof IconCategories | 'other' = 'other';
  for (const [cat, icons] of Object.entries(IconCategories)) {
    if (icons.includes(name as never)) {
      category = cat as keyof typeof IconCategories;
      break;
    }
  }
  
  // Check if has solid variant
  const solidIcons: IconName[] = ['arrowDown', 'arrowUp', 'arrowLeft', 'arrowRight', 'delete', 'home', 'mypage', 'setting'];
  const hasSolid = solidIcons.includes(name);
  
  return {
    name,
    description: IconDescriptions[name],
    category,
    hasSolid,
  };
}

/**
 * All available icons grouped by category
 */
export const AllIcons = {
  ...IconCategories,
  all: Object.keys(IconDescriptions) as IconName[],
} as const;

