/**
 * Input Demo Page
 * 
 * Demonstrates all input variants, types, and states.
 * This page allows visual testing of the Input component.
 */

import { Input } from '@/components/ui/input';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function InputDemoScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  // State for different inputs
  const [textInput, setTextInput] = useState('');
  const [textInputWithIcon, setTextInputWithIcon] = useState('');
  const [textInputActive, setTextInputActive] = useState('내용');
  const [numberInput, setNumberInput] = useState('');
  const [numberInputActive, setNumberInputActive] = useState('20,000');
  const [textareaInput, setTextareaInput] = useState('');
  const [timeInput, setTimeInput] = useState('');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <Text style={[typography.headline01.bold, { color: palette.text, marginBottom: 8 }]}>
        Input Components
      </Text>
      <Text style={[typography.body01.regular, { color: palette.textNeutral, marginBottom: 32 }]}>
        All input variants, types, and states
      </Text>

      {/* Line Inputs - Default State */}
      <SectionHeader title="Line Inputs - Default" colors={palette} />

      <SubSectionHeader title="Without Icon" colors={palette} />
      <Input
        placeholder="내용 입력"
        value={textInput}
        onChangeText={setTextInput}
      />

      <SubSectionHeader title="With Icon" colors={palette} />
      <Input
        icon="person"
        placeholder="내용 입력"
        value={textInputWithIcon}
        onChangeText={setTextInputWithIcon}
      />

      <SubSectionHeader title="With Time Display" colors={palette} />
      <Input
        placeholder="내용 입력"
        value={timeInput}
        onChangeText={setTimeInput}
        timeDisplay="2:53"
      />

      {/* Line Inputs - Active State */}
      <SectionHeader title="Line Inputs - Active (Focused)" colors={palette} />

      <SubSectionHeader title="With Icon" colors={palette} />
      <Input
        icon="person"
        placeholder="내용 입력"
        value={textInputActive}
        onChangeText={setTextInputActive}
      />

      <SubSectionHeader title="With Time Display" colors={palette} />
      <Input
        placeholder="내용 입력"
        value="내용"
        onChangeText={() => {}}
        timeDisplay="2:53"
      />

      {/* Line Inputs - Disabled State */}
      <SectionHeader title="Line Inputs - Disabled" colors={palette} />

      <Input
        icon="person"
        placeholder="내용 입력"
        value=""
        onChangeText={() => {}}
        disabled
      />

      {/* Number Inputs */}
      <SectionHeader title="Number Inputs" colors={palette} />

      <SubSectionHeader title="Default" colors={palette} />
      <Input
        inputType="number"
        value={numberInput}
        onChangeText={setNumberInput}
        unit="원"
      />

      <SubSectionHeader title="Active (with value)" colors={palette} />
      <Input
        inputType="number"
        value={numberInputActive}
        onChangeText={setNumberInputActive}
        unit="원"
      />

      <SubSectionHeader title="Disabled" colors={palette} />
      <Input
        inputType="number"
        value="20,000"
        onChangeText={() => {}}
        unit="원"
        disabled
      />

      {/* Textarea Inputs */}
      <SectionHeader title="Textarea (Area Variant)" colors={palette} />

      <SubSectionHeader title="Default" colors={palette} />
      <Input
        variant="area"
        placeholder="메모를 입력해 주세요.(최대 20자)"
        value={textareaInput}
        onChangeText={setTextareaInput}
        maxLength={20}
      />

      <SubSectionHeader title="Disabled" colors={palette} />
      <Input
        variant="area"
        placeholder="메모를 입력해 주세요.(최대 20자)"
        value=""
        onChangeText={() => {}}
        disabled
      />

      {/* Calendar Inputs */}
      <SectionHeader title="Calendar Inputs" colors={palette} />

      <SubSectionHeader title="Default (no date)" colors={palette} />
      <Input
        calendar
      />

      <SubSectionHeader title="Active (with date)" colors={palette} />
      <Input
        calendar
        calendarDate="2025.09.28"
      />

      <SubSectionHeader title="Disabled (with date)" colors={palette} />
      <Input
        calendar
        calendarDate="2025.09.28"
        disabled
      />

      {/* Real-world Examples */}
      <SectionHeader title="Real-world Examples" colors={palette} />

      <View style={styles.column}>
        <View>
          <Text style={[typography.body02.medium, { color: palette.text, marginBottom: 8 }]}>
            이름
          </Text>
          <Input
            icon="person"
            placeholder="이름을 입력하세요"
            value=""
            onChangeText={() => {}}
          />
        </View>

        <View>
          <Text style={[typography.body02.medium, { color: palette.text, marginBottom: 8 }]}>
            금액
          </Text>
          <Input
            inputType="number"
            value=""
            onChangeText={() => {}}
            unit="원"
          />
        </View>

        <View>
          <Text style={[typography.body02.medium, { color: palette.text, marginBottom: 8 }]}>
            메모
          </Text>
          <Input
            variant="area"
            placeholder="메모를 입력해 주세요"
            value=""
            onChangeText={() => {}}
            maxLength={100}
          />
        </View>

        <View>
          <Text style={[typography.body02.medium, { color: palette.text, marginBottom: 8 }]}>
            날짜
          </Text>
          <Input
            calendar
            calendarDate="2025.09.28"
          />
        </View>
      </View>

      {/* Input Specs */}
      <SectionHeader title="Input Specifications" colors={palette} />
      <View style={[styles.specsContainer, { backgroundColor: palette.fill }]}>
        <SpecItem label="Line Height" value="48px" colors={palette} />
        <SpecItem label="Area Height" value="96px" colors={palette} />
        <SpecItem label="Border Radius" value="12px" colors={palette} />
        <SpecItem label="Padding" value="12px" colors={palette} />
        <SpecItem label="Font Size" value="16px" colors={palette} />
        <SpecItem label="Line Height (Text)" value="24px" colors={palette} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/**
 * Section Header Component
 */
function SectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ColorPalette;
}) {
  return (
    <Text
      style={[typography.headline03.bold, { color: colors.text, marginTop: 32, marginBottom: 16 }]}
    >
      {title}
    </Text>
  );
}

/**
 * Sub Section Header Component
 */
function SubSectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ColorPalette;
}) {
  return (
    <Text
      style={[
        typography.body01.medium,
        { color: colors.textNeutral, marginTop: 16, marginBottom: 8 },
      ]}
    >
      {title}
    </Text>
  );
}

/**
 * Spec Item Component
 */
function SpecItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.specItem}>
      <Text style={[typography.body02.regular, { color: colors.textNeutral }]}>{label}</Text>
      <Text style={[typography.body02.bold, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  column: {
    gap: 20,
    marginTop: 8,
  },
  specsContainer: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 8,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

