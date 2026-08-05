import { ZoomableView } from '@/components/ui/zoomable-view';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

export interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  isActive?: boolean;
  onZoomActiveChange?: (active: boolean) => void;
}

export function ZoomableImage({
  uri,
  width,
  height,
  isActive = true,
  onZoomActiveChange,
}: ZoomableImageProps) {
  return (
    <ZoomableView
      width={width}
      height={height}
      isActive={isActive}
      onZoomActiveChange={onZoomActiveChange}
    >
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="contain"
        accessibilityLabel="확대 가능한 공지 이미지"
      />
    </ZoomableView>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
