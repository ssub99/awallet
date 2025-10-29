/**
 * Icon Component
 * 
 * A type-safe icon system supporting line and solid variants.
 * Uses react-native-svg for perfect SVG rendering on all platforms.
 * 
 * @example
 * ```tsx
 * <Icon name="home" variant="line" size={24} color={colors.primary} />
 * <Icon name="arrowDown" variant="solid" size={20} />
 * ```
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ViewStyle } from 'react-native';

// Import line SVGs
import AddTaskLine from '@/assets/images/icons/line/addTask.svg';
import ArrowDownLine from '@/assets/images/icons/line/arrowDown.svg';
import ArrowLeftLine from '@/assets/images/icons/line/arrowLeft.svg';
import ArrowRightLine from '@/assets/images/icons/line/arrowRight.svg';
import ArrowUpLine from '@/assets/images/icons/line/arrowUp.svg';
import CalendarMonthLine from '@/assets/images/icons/line/calendarMonth.svg';
import CalendarYearLine from '@/assets/images/icons/line/calendarYear.svg';
import CheckLine from '@/assets/images/icons/line/check.svg';
import CheckboxIconLine from '@/assets/images/icons/line/checkboxIcon.svg';
import CloseLine from '@/assets/images/icons/line/close.svg';
import DeleteLine from '@/assets/images/icons/line/delete.svg';
import HandleLine from '@/assets/images/icons/line/handle.svg';
import HomeLine from '@/assets/images/icons/line/home.svg';
import InfoLine from '@/assets/images/icons/line/info.svg';
import LockLine from '@/assets/images/icons/line/lock.svg';
import MypageLine from '@/assets/images/icons/line/mypage.svg';
import PersonLine from '@/assets/images/icons/line/person.svg';
import ProfileLine from '@/assets/images/icons/line/profile.svg';
import SearchLine from '@/assets/images/icons/line/search.svg';

// Import solid SVGs
import ArrowDownSolid from '@/assets/images/icons/solid/arrowDown.svg';
import ArrowLeftSolid from '@/assets/images/icons/solid/arrowLeft.svg';
import ArrowRightSolid from '@/assets/images/icons/solid/arrowRight.svg';
import ArrowUpSolid from '@/assets/images/icons/solid/arrowUp.svg';
import DeleteSolid from '@/assets/images/icons/solid/delete.svg';
import HomeSolid from '@/assets/images/icons/solid/home.svg';
import MypageSolid from '@/assets/images/icons/solid/mypage.svg';

/**
 * Available icon names (camelCase)
 * Converted from kebab-case filenames
 */
export type IconName =
  | 'addTask'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'arrowUp'
  | 'calendarMonth'
  | 'calendarYear'
  | 'check'
  | 'checkboxIcon'
  | 'close'
  | 'delete'
  | 'handle'
  | 'home'
  | 'info'
  | 'lock'
  | 'mypage'
  | 'person'
  | 'profile'
  | 'search';

/**
 * Icon variant types
 * - line: Outlined/stroke style icons
 * - solid: Filled style icons (limited availability)
 */
export type IconVariant = 'line' | 'solid';

/**
 * Icons available in solid variant
 */
export type SolidIconName = 'arrowDown' | 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'delete' | 'home' | 'mypage';

export interface IconProps {
  /**
   * Icon name in camelCase
   */
  name: IconName;
  
  /**
   * Icon variant
   * @default 'line'
   */
  variant?: IconVariant;
  
  /**
   * Icon size (width and height)
   * @default 24
   */
  size?: number;
  
  /**
   * Icon color (fill/stroke color)
   * If not provided, uses theme icon color
   */
  color?: string;
  
  /**
   * Additional styles
   */
  style?: ViewStyle;
  
  /**
   * Accessibility label
   */
  accessibilityLabel?: string;
}

/**
 * Icon component mapping
 */
const iconComponents = {
  line: {
    addTask: AddTaskLine,
    arrowDown: ArrowDownLine,
    arrowLeft: ArrowLeftLine,
    arrowRight: ArrowRightLine,
    arrowUp: ArrowUpLine,
    calendarMonth: CalendarMonthLine,
    calendarYear: CalendarYearLine,
    check: CheckLine,
    checkboxIcon: CheckboxIconLine,
    close: CloseLine,
    delete: DeleteLine,
    handle: HandleLine,
    home: HomeLine,
    info: InfoLine,
    lock: LockLine,
    mypage: MypageLine,
    person: PersonLine,
    profile: ProfileLine,
    search: SearchLine,
  },
  solid: {
    arrowDown: ArrowDownSolid,
    arrowLeft: ArrowLeftSolid,
    arrowRight: ArrowRightSolid,
    arrowUp: ArrowUpSolid,
    delete: DeleteSolid,
    home: HomeSolid,
    mypage: MypageSolid,
  },
} as const;

/**
 * Icons available in solid variant
 */
const solidIcons = new Set<IconName>(['arrowDown', 'arrowLeft', 'arrowRight', 'arrowUp', 'delete', 'home', 'mypage']);

/**
 * Get icon component based on name and variant
 */
function getIconComponent(name: IconName, variant: IconVariant) {
  if (variant === 'solid') {
    // Check if solid variant exists
    if (solidIcons.has(name)) {
      return iconComponents.solid[name as SolidIconName];
    }
    // Fallback to line if solid not available
    return iconComponents.line[name];
  }
  
  const component = iconComponents.line[name];
  if (!component) {
    console.error(`Icon component not found: ${name} (${variant})`);
    // Return a fallback component
    return iconComponents.line.close; // Use close icon as fallback
  }
  
  return component;
}

/**
 * Icon Component
 * 
 * Renders SVG icons with proper typing and theming support.
 * Uses react-native-svg for perfect rendering on all platforms.
 */
export function Icon({
  name,
  variant = 'line',
  size = 24,
  color,
  style,
  accessibilityLabel,
}: IconProps) {
  const colorScheme = useColorScheme();
  const defaultColor = Colors[colorScheme ?? 'light'].icon;
  
  const IconComponent = getIconComponent(name, variant);
  const iconColor = color ?? defaultColor;

  // Safety check for IconComponent
  if (!IconComponent) {
    console.error(`Failed to get icon component for: ${name} (${variant})`);
    return null;
  }

  const IconElement = IconComponent as any;
  
  return (
    <IconElement
      width={size}
      height={size}
      color={iconColor}
      fill={iconColor}
      style={style}
      accessibilityLabel={accessibilityLabel ?? `${name} icon`}
      accessibilityRole="image"
    />
  );
}

/**
 * Icon name utilities
 */
export const IconUtils = {
  /**
   * Check if an icon has a solid variant
   */
  hasSolidVariant: (name: IconName): name is SolidIconName => {
    return solidIcons.has(name);
  },
  
  /**
   * Get all available icon names
   */
  getAllIconNames: (): IconName[] => {
    return Object.keys(iconComponents.line) as IconName[];
  },
  
  /**
   * Get all solid icon names
   */
  getSolidIconNames: (): SolidIconName[] => {
    return Array.from(solidIcons) as SolidIconName[];
  },
};
