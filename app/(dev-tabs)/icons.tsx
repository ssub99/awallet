/**
 * Icon Demo Page
 * 
 * Demonstrates all available icons with their variants, sizes, and colors.
 * This page allows visual testing of the Icon component.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon, IconName, IconVariant } from '@/components/ui/icon';
import { AllIcons, IconCategories, IconSizes, getIconMetadata } from '@/constants/icons';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function IconDemoScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  
  const [selectedVariant, setSelectedVariant] = useState<IconVariant>('line');
  const [selectedSize, setSelectedSize] = useState<number>(IconSizes.regular);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={[styles.innerContainer, { backgroundColor: palette.background }]}>
        {/* Top Navigation */}
        <TopNavigation
          type="sub"
          title="테스트 환경"
          showLeftIcon
          onLeftIconPress={() => {

            router.back();
          }}
        />
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
        >
          {/* Controls */}
      <View style={styles.controls}>
        {/* Variant Selector */}
        <View style={styles.controlGroup}>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            Variant
          </Text>
          <View style={styles.buttonGroup}>
            <Pressable
              style={[
                styles.controlButton,
                { borderColor: palette.border },
                selectedVariant === 'line' && { backgroundColor: palette.primary },
              ]}
              onPress={() => setSelectedVariant('line')}
            >
              <Text
                style={[
                  typography.body2.r.medium,
                  { color: selectedVariant === 'line' ? palette.staticWhite : palette.text },
                ]}
              >
                Line
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.controlButton,
                { borderColor: palette.border },
                selectedVariant === 'solid' && { backgroundColor: palette.primary },
              ]}
              onPress={() => setSelectedVariant('solid')}
            >
              <Text
                style={[
                  typography.body2.r.medium,
                  { color: selectedVariant === 'solid' ? palette.staticWhite : palette.text },
                ]}
              >
                Solid
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Size Selector */}
        <View style={styles.controlGroup}>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            Size: {selectedSize}px
          </Text>
          <View style={styles.buttonGroup}>
            {Object.entries(IconSizes).map(([key, size]) => (
              <Pressable
                key={key}
                style={[
                  styles.sizeButton,
                  { borderColor: palette.border },
                  selectedSize === size && { backgroundColor: palette.primary },
                ]}
                onPress={() => setSelectedSize(size)}
              >
                <Text
                  style={[
                    typography.tiny.r.medium,
                    { color: selectedSize === size ? palette.staticWhite : palette.text },
                  ]}
                >
                  {key}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Color Selector */}
        <View style={styles.controlGroup}>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            Color
          </Text>
          <View style={styles.buttonGroup}>
            <Pressable
              style={[
                styles.colorButton,
                { borderColor: palette.border },
                !selectedColor && { backgroundColor: palette.fill },
              ]}
              onPress={() => setSelectedColor(undefined)}
            >
              <Text style={[typography.body2.r.medium, { color: palette.text }]}>Default</Text>
            </Pressable>
            <ColorButton
              color={palette.primary}
              label="Primary"
              selected={selectedColor === palette.primary}
              onPress={() => setSelectedColor(palette.primary)}
              colors={palette}
            />
            <ColorButton
              color={palette.statusNegative}
              label="Negative"
              selected={selectedColor === palette.statusNegative}
              onPress={() => setSelectedColor(palette.statusNegative)}
              colors={palette}
            />
            <ColorButton
              color={palette.textAssistive}
              label="Gray"
              selected={selectedColor === palette.textAssistive}
              onPress={() => setSelectedColor(palette.textAssistive)}
              colors={palette}
            />
          </View>
        </View>
      </View>

      {/* Icons by Category */}
      {Object.entries(IconCategories).map(([categoryName, icons]) => (
        <View key={categoryName} style={styles.categorySection}>
          <Text style={[typography.headline3.m.bold, { color: palette.text, marginBottom: 12 }]}>
            {categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}
          </Text>
          <View style={styles.iconGrid}>
            {icons.map((iconName) => {
              const metadata = getIconMetadata(iconName as IconName);
              const canShowSolid = metadata.hasSolid || selectedVariant === 'line';
              
              return (
                <View key={iconName} style={[styles.iconCard, { backgroundColor: palette.backgroundAlt }]}>
                  <View style={[styles.iconContainer, { borderColor: palette.border }]}>
                    {canShowSolid ? (
                      <Icon
                        name={iconName as IconName}
                        variant={selectedVariant}
                        size={selectedSize}
                        color={selectedColor}
                      />
                    ) : (
                      <View style={styles.unavailableIcon}>
                        <Text style={[typography.tiny.r.regular, { color: palette.textDisabled }]}>
                          N/A
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[typography.detail.r.regular, { color: palette.text, textAlign: 'center' }]}
                    numberOfLines={2}
                  >
                    {iconName}
                  </Text>
                  {metadata.hasSolid && (
                    <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                      <Text style={[typography.tiny.r.bold, { color: palette.staticWhite }]}>S</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {/* All Icons Count */}
      <View style={[styles.summary, { backgroundColor: palette.fill }]}>
        <Text style={[typography.body1.l.medium, { color: palette.text }]}>
          Total Icons: {AllIcons.all.length}
        </Text>
        <Text style={[typography.body2.r.regular, { color: palette.textNeutral }]}>
          Line: {AllIcons.all.length} | Solid: 5
        </Text>
      </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/**
 * Color Button Component
 */
function ColorButton({
  color,
  label,
  selected,
  onPress,
  colors,
}: {
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ColorPalette;
}) {
  return (
    <Pressable
      style={[
        styles.colorButton,
        { borderColor: colors.border },
        selected && { backgroundColor: colors.fill },
      ]}
      onPress={onPress}
    >
      <View style={[styles.colorSwatch, { backgroundColor: color }]} />
      <Text style={[typography.body2.r.medium, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  controls: {
    gap: 20,
    marginBottom: 32,
  },
  controlGroup: {
    gap: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  sizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  colorButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  categorySection: {
    marginBottom: 32,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconCard: {
    width: 80,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableIcon: {
    opacity: 0.3,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    padding: 16,
    borderRadius: 12,
    gap: 4,
    alignItems: 'center',
  },
});
