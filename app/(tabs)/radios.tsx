/**
 * Radio Demo Page
 * 
 * Demonstrates radio button and radio group components.
 * This page allows visual testing of the Radio component.
 */

import { Radio } from '@/components/ui/radio';
import { RadioGroup } from '@/components/ui/radio-group';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function RadioDemoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  // Sample options
  const paymentOptions = [
    { label: '신용카드', value: 'credit' },
    { label: '체크카드', value: 'debit' },
    { label: '계좌이체', value: 'transfer' },
    { label: '무통장입금', value: 'deposit' },
  ];

  const periodOptions = [
    { label: '일주일', value: 'week' },
    { label: '한 달', value: 'month' },
    { label: '3개월', value: 'quarter' },
    { label: '1년', value: 'year' },
  ];

  const typeOptions = [
    { label: '고정 지출', value: 'fixed' },
    { label: '변동 지출', value: 'variable' },
  ];

  // State for radios
  const [singleChecked, setSingleChecked] = useState(false);
  const [payment, setPayment] = useState<string>('credit');
  const [period, setPeriod] = useState<string>('');
  const [type, setType] = useState<string>('');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <Text style={[Typography.headline1.xl.bold, { color: colors.text, marginBottom: 8 }]}>
        Radio Components
      </Text>
      <Text style={[Typography.body1.l.regular, { color: colors.textNeutral, marginBottom: 32 }]}>
        Radio buttons for single selection
      </Text>

      {/* Single Radio - States */}
      <SectionHeader title="Single Radio - States" colors={colors} />

      <SubSectionHeader title="Default (Unchecked)" colors={colors} />
      <Radio
        checked={false}
        onPress={() => {}}
        label="선택 가능"
      />

      <SubSectionHeader title="Active (Checked)" colors={colors} />
      <Radio
        checked={true}
        onPress={() => {}}
        label="선택됨"
      />

      <SubSectionHeader title="Disabled (Unchecked)" colors={colors} />
      <Radio
        checked={false}
        onPress={() => {}}
        label="비활성화"
        disabled
      />

      <SubSectionHeader title="Disabled (Checked)" colors={colors} />
      <Radio
        checked={true}
        onPress={() => {}}
        label="선택됨 (비활성화)"
        disabled
      />

      {/* Single Radio - Interactive */}
      <SectionHeader title="Single Radio - Interactive" colors={colors} />
      
      <Radio
        checked={singleChecked}
        onPress={() => setSingleChecked(!singleChecked)}
        label="클릭해서 선택/해제"
      />

      {/* Radio Without Label */}
      <SectionHeader title="Radio Without Label" colors={colors} />
      
      <View style={styles.row}>
        <Radio checked={false} onPress={() => {}} />
        <View style={{ width: 20 }} />
        <Radio checked={true} onPress={() => {}} />
        <View style={{ width: 20 }} />
        <Radio checked={false} onPress={() => {}} disabled />
        <View style={{ width: 20 }} />
        <Radio checked={true} onPress={() => {}} disabled />
      </View>

      {/* RadioGroup - Vertical */}
      <SectionHeader title="RadioGroup - Vertical" colors={colors} />
      
      <SubSectionHeader title="Payment Method (with default)" colors={colors} />
      <RadioGroup
        options={paymentOptions}
        value={payment}
        onValueChange={setPayment}
      />

      <SubSectionHeader title="Period (no default)" colors={colors} />
      <RadioGroup
        options={periodOptions}
        value={period}
        onValueChange={setPeriod}
      />

      {/* RadioGroup - Horizontal */}
      <SectionHeader title="RadioGroup - Horizontal" colors={colors} />
      
      <RadioGroup
        options={typeOptions}
        value={type}
        onValueChange={setType}
        direction="horizontal"
      />

      {/* RadioGroup - Disabled */}
      <SectionHeader title="RadioGroup - Disabled" colors={colors} />
      
      <RadioGroup
        options={paymentOptions}
        value="credit"
        onValueChange={() => {}}
        disabled
      />

      {/* Real-world Examples */}
      <SectionHeader title="Real-world Examples" colors={colors} />

      <View style={styles.column}>
        <View>
          <Text style={[Typography.body2.r.medium, { color: colors.text, marginBottom: 12 }]}>
            결제 수단
          </Text>
          <RadioGroup
            options={paymentOptions}
            value={payment}
            onValueChange={setPayment}
          />
        </View>

        <View>
          <Text style={[Typography.body2.r.medium, { color: colors.text, marginBottom: 12 }]}>
            조회 기간
          </Text>
          <RadioGroup
            options={periodOptions}
            value={period}
            onValueChange={setPeriod}
            direction="horizontal"
          />
        </View>
      </View>

      {/* Radio Specs */}
      <SectionHeader title="Radio Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Outer Size" value="20×20px" colors={colors} />
        <SpecItem label="Inner Size" value="10×10px" colors={colors} />
        <SpecItem label="Border Radius" value="10px (circle)" colors={colors} />
        <SpecItem label="Label Font" value="Pretendard Medium 14" colors={colors} />
        <SpecItem label="Label Gap" value="8px" colors={colors} />
        <SpecItem label="Line Height" value="21px" colors={colors} />
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
  colors: typeof Colors.light | typeof Colors.dark;
}) {
  return (
    <Text
      style={[Typography.headline3.m.bold, { color: colors.text, marginTop: 32, marginBottom: 16 }]}
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
  colors: typeof Colors.light | typeof Colors.dark;
}) {
  return (
    <Text
      style={[
        Typography.body1.l.medium,
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
  colors: typeof Colors.light | typeof Colors.dark;
}) {
  return (
    <View style={styles.specItem}>
      <Text style={[Typography.body2.r.regular, { color: colors.textNeutral }]}>{label}</Text>
      <Text style={[Typography.body2.r.bold, { color: colors.text }]}>{value}</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    gap: 24,
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

