import {
  getAndroidNavigationBarInset,
} from '@/components/ui/custom-keypad-overlay';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ModalBottomsheetBottomInsetProps = {
  backgroundColor: string;
};

/**
 * noPaddingBottom 바텀시트 본문 맨 아래 OS safe area.
 * ModalBottomsheet(SafeAreaProvider) 자식에서만 사용 — Android nav / iOS home indicator(최소 34).
 */
export function ModalBottomsheetBottomInset({
  backgroundColor,
}: ModalBottomsheetBottomInsetProps) {
  const insets = useSafeAreaInsets();
  const height =
    getAndroidNavigationBarInset(insets) +
    (Platform.OS === 'ios' ? Math.max(insets.bottom, 34) : 0);

  if (height <= 0) {
    return null;
  }

  return (
    <View
      style={{
        marginHorizontal: -16,
        backgroundColor,
        height,
      }}
    />
  );
}
