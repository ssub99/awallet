import type { BlurViewProps } from 'expo-blur';

import { GlassSurface } from '@/components/ui/glass-surface';

/** @deprecated Prefer GlassSurface for layered blur; kept for existing imports. */
export function SafeBlurView({ style, children, intensity, tint }: BlurViewProps) {
  return (
    <GlassSurface intensity={intensity ?? 24} tint={tint} style={style}>
      {children}
    </GlassSurface>
  );
}
