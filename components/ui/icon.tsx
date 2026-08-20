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

import { colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { View, ViewStyle } from 'react-native';

// Import line SVGs
import AddTaskLine from '@/assets/images/icons/line/addTask.svg';
import AddTaskFabLine from '@/assets/images/icons/line/addTaskFab.svg';
import ArrowDownLine from '@/assets/images/icons/line/arrowDown.svg';
import ArrowLeftLine from '@/assets/images/icons/line/arrowLeft.svg';
import ArrowRightLine from '@/assets/images/icons/line/arrowRight.svg';
import ArrowUpLine from '@/assets/images/icons/line/arrowUp.svg';
import CalendarMonthLine from '@/assets/images/icons/line/calendarMonth.svg';
import CalendarYearLine from '@/assets/images/icons/line/calendarYear.svg';
import ChallengeLine from '@/assets/images/icons/line/challenge.svg';
import CheckLine from '@/assets/images/icons/line/check.svg';
import CheckboxIconLine from '@/assets/images/icons/line/checkboxIcon.svg';
import CloseLine from '@/assets/images/icons/line/close.svg';
import DeleteLine from '@/assets/images/icons/line/delete.svg';
import FilterLine from '@/assets/images/icons/line/filter.svg';
import HandleLine from '@/assets/images/icons/line/handle.svg';
import HomeLine from '@/assets/images/icons/line/home.svg';
import InfoLine from '@/assets/images/icons/line/info.svg';
import LockLine from '@/assets/images/icons/line/lock.svg';
import MemoLine from '@/assets/images/icons/line/memo.svg';
import MypageLine from '@/assets/images/icons/line/mypage.svg';
import KeypadDeleteLine from '@/assets/images/icons/line/keypadDelete.svg';
import OperationLine from '@/assets/images/icons/line/operation.svg';
import OperationEqualLine from '@/assets/images/icons/line/operationEqual.svg';
import OperationAdditionLine from '@/assets/images/icons/line/operationAddition.svg';
import OperationDivisionLine from '@/assets/images/icons/line/operationDivision.svg';
import OperationMultiplicationLine from '@/assets/images/icons/line/operationMultiplication.svg';
import OperationSubtractionLine from '@/assets/images/icons/line/operationSubtraction.svg';
import PersonLine from '@/assets/images/icons/line/person.svg';
import ProfileLine from '@/assets/images/icons/line/profile.svg';
import SearchLine from '@/assets/images/icons/line/search.svg';
import SendLine from '@/assets/images/icons/line/send.svg';
import SettingLine from '@/assets/images/icons/line/setting.svg';
import StarLine from '@/assets/images/icons/line/star.svg';

// Import solid SVGs
import ArrowDownSolid from '@/assets/images/icons/solid/arrowDown.svg';
import ArrowLeftSolid from '@/assets/images/icons/solid/arrowLeft.svg';
import ArrowRightSolid from '@/assets/images/icons/solid/arrowRight.svg';
import ArrowUpSolid from '@/assets/images/icons/solid/arrowUp.svg';
import CalculatorSolid from '@/assets/images/icons/solid/calculator.svg';
import CancelSolid from '@/assets/images/icons/solid/cancel.svg';
import CategorySettingSolid from '@/assets/images/icons/solid/categorysetting.svg';
import DeleteSolid from '@/assets/images/icons/solid/delete.svg';
import CopyLine from '@/assets/images/icons/line/copy.svg';
import HomeSolid from '@/assets/images/icons/solid/home.svg';
import ImageSolid from '@/assets/images/icons/solid/image.svg';
import ChallengeSolid from '@/assets/images/icons/solid/challenge.svg';
import MypageSolid from '@/assets/images/icons/solid/mypage.svg';
import PauseSolid from '@/assets/images/icons/solid/pause.svg';
import PlaySolid from '@/assets/images/icons/solid/play.svg';
import SettingSolid from '@/assets/images/icons/solid/setting.svg';

/**
 * Icon variant types
 * - line: Outlined/stroke style icons
 * - solid: Filled style icons (limited availability)
 */
export type IconVariant = 'line' | 'solid';

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
    addTaskFab: AddTaskFabLine,
    arrowDown: ArrowDownLine,
    arrowLeft: ArrowLeftLine,
    arrowRight: ArrowRightLine,
    arrowUp: ArrowUpLine,
    calendarMonth: CalendarMonthLine,
    calendarYear: CalendarYearLine,
    challenge: ChallengeLine,
    check: CheckLine,
    checkboxIcon: CheckboxIconLine,
    close: CloseLine,
    copy: CopyLine,
    delete: DeleteLine,
    filter: FilterLine,
    handle: HandleLine,
    home: HomeLine,
    info: InfoLine,
    keypadDelete: KeypadDeleteLine,
    lock: LockLine,
    memo: MemoLine,
    mypage: MypageLine,
    operationAddition: OperationAdditionLine,
    operationDivision: OperationDivisionLine,
    operation: OperationLine,
    operationEqual: OperationEqualLine,
    operationMultiplication: OperationMultiplicationLine,
    operationSubtraction: OperationSubtractionLine,
    person: PersonLine,
    profile: ProfileLine,
    search: SearchLine,
    send: SendLine,
    setting: SettingLine,
    star: StarLine,
  },
  solid: {
    arrowDown: ArrowDownSolid,
    arrowLeft: ArrowLeftSolid,
    arrowRight: ArrowRightSolid,
    arrowUp: ArrowUpSolid,
    calculator: CalculatorSolid,
    cancel: CancelSolid,
    categorySetting: CategorySettingSolid,
    challenge: ChallengeSolid,
    delete: DeleteSolid,
    home: HomeSolid,
    image: ImageSolid,
    mypage: MypageSolid,
    pause: PauseSolid,
    play: PlaySolid,
    setting: SettingSolid,
  },
} as const;

/** Line-variant icon names derived from the component map */
export type LineIconName = keyof typeof iconComponents.line;

/** Solid-variant icon names derived from the component map */
export type SolidIconName = keyof typeof iconComponents.solid;

/**
 * Available icon names (camelCase)
 * Union of line and solid maps — cancel is solid-only.
 */
export type IconName = LineIconName | SolidIconName;

const solidIcons = new Set<SolidIconName>(Object.keys(iconComponents.solid) as SolidIconName[]);

function hasLineIcon(name: IconName): name is LineIconName {
  return name in iconComponents.line;
}

function hasSolidIcon(name: IconName): name is SolidIconName {
  return name in iconComponents.solid;
}

/**
 * Get icon component based on name and variant
 */
function getIconComponent(name: IconName, variant: IconVariant) {
  if (variant === 'solid') {
    if (hasSolidIcon(name)) {
      return iconComponents.solid[name];
    }
    if (hasLineIcon(name)) {
      return iconComponents.line[name];
    }
    console.error(`Icon component not found: ${name} (${variant})`);
    return iconComponents.line.close;
  }

  if (hasLineIcon(name)) {
    return iconComponents.line[name];
  }

  console.error(`Icon component not found: ${name} (${variant})`);
  return iconComponents.line.close;
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
  const defaultColor = colors[colorScheme ?? 'light'].icon;
  
  const IconComponent = getIconComponent(name, variant);
  const iconColor = color ?? defaultColor;

  // Safety check for IconComponent
  if (!IconComponent) {
    console.error(`Failed to get icon component for: ${name} (${variant})`);
    return null;
  }

  const IconElement = IconComponent as any;
  
  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
      accessibilityLabel={accessibilityLabel ?? `${name} icon`}
      accessibilityRole="image"
    >
      <IconElement width={size} height={size} color={iconColor} fill={iconColor} />
    </View>
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
    return hasSolidIcon(name);
  },
  
  /**
   * Get all available icon names
   */
  getAllIconNames: (): IconName[] => {
    const names = new Set<IconName>([
      ...(Object.keys(iconComponents.line) as LineIconName[]),
      ...(Object.keys(iconComponents.solid) as SolidIconName[]),
    ]);
    return Array.from(names);
  },
  
  /**
   * Get all solid icon names
   */
  getSolidIconNames: (): SolidIconName[] => {
    return Array.from(solidIcons) as SolidIconName[];
  },
};
