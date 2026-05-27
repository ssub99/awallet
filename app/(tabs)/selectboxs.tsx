/**
 * Selectbox Demo Page
 * 
 * Demonstrates selectbox component with native picker.
 * This page allows visual testing of the Selectbox component.
 */

import { Selectbox } from '@/components/ui/selectbox';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function SelectboxDemoScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  // Sample options - 10+ items for testing
  const categoryOptions = [
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '문화생활', value: 'culture' },
    { label: '의료/건강', value: 'health' },
    { label: '교육', value: 'education' },
    { label: '통신비', value: 'communication' },
    { label: '주거/관리', value: 'housing' },
    { label: '미용', value: 'beauty' },
    { label: '보험', value: 'insurance' },
    { label: '저축', value: 'savings' },
    { label: '경조사', value: 'events' },
    { label: '기타', value: 'other' },
  ];

  const monthOptions = [
    { label: '1월', value: '01' },
    { label: '2월', value: '02' },
    { label: '3월', value: '03' },
    { label: '4월', value: '04' },
    { label: '5월', value: '05' },
    { label: '6월', value: '06' },
    { label: '7월', value: '07' },
    { label: '8월', value: '08' },
    { label: '9월', value: '09' },
    { label: '10월', value: '10' },
    { label: '11월', value: '11' },
    { label: '12월', value: '12' },
  ];

  const accountOptions = [
    { label: '신한은행 (1234)', value: 'shinhan_1234' },
    { label: '국민은행 (5678)', value: 'kb_5678' },
    { label: '우리은행 (9012)', value: 'woori_9012' },
    { label: '하나은행 (3456)', value: 'hana_3456' },
    { label: '농협은행 (7890)', value: 'nh_7890' },
    { label: '기업은행 (2345)', value: 'ibk_2345' },
    { label: '카카오뱅크 (6789)', value: 'kakao_6789' },
    { label: '토스뱅크 (0123)', value: 'toss_0123' },
    { label: '케이뱅크 (4567)', value: 'kbank_4567' },
    { label: '새마을금고 (8901)', value: 'mg_8901' },
  ];

  // State for selectboxs
  const [category, setCategory] = useState<string>('');
  const [categoryWithValue, setCategoryWithValue] = useState<string>('food');
  const [month, setMonth] = useState<string>('');
  const [account, setAccount] = useState<string>('');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <Text style={[typography.headline1.xl.bold, { color: palette.text, marginBottom: 8 }]}>
        Selectbox Components
      </Text>
      <Text style={[typography.body1.l.regular, { color: palette.textNeutral, marginBottom: 32 }]}>
        Native picker with platform-specific UI
      </Text>

      {/* Default State */}
      <SectionHeader title="Default State" colors={palette} />
      
      <SubSectionHeader title="No Selection" colors={palette} />
      <Selectbox
        options={categoryOptions}
        value={category}
        onValueChange={setCategory}
        placeholder="카테고리 선택"
        title="카테고리"
      />

      <SubSectionHeader title="With Selection" colors={palette} />
      <Selectbox
        options={categoryOptions}
        value={categoryWithValue}
        onValueChange={setCategoryWithValue}
        placeholder="카테고리 선택"
        title="카테고리"
      />

      {/* Disabled State */}
      <SectionHeader title="Disabled State" colors={palette} />
      
      <Selectbox
        options={categoryOptions}
        value="food"
        onValueChange={() => {}}
        placeholder="카테고리 선택"
        title="카테고리"
        disabled
      />

      {/* Different Options */}
      <SectionHeader title="Different Options" colors={palette} />
      
      <SubSectionHeader title="Month Selector (12 items)" colors={palette} />
      <Selectbox
        options={monthOptions}
        value={month}
        onValueChange={setMonth}
        placeholder="월 선택"
        title="조회 월"
      />

      <SubSectionHeader title="Account Selector (10 items)" colors={palette} />
      <Selectbox
        options={accountOptions}
        value={account}
        onValueChange={setAccount}
        placeholder="계좌 선택"
        title="계좌"
      />

      <SubSectionHeader title="Category Selector (13 items)" colors={palette} />
      <Selectbox
        options={categoryOptions}
        value={category}
        onValueChange={setCategory}
        placeholder="카테고리 선택"
        title="카테고리"
      />

      {/* Real-world Examples */}
      <SectionHeader title="Real-world Examples" colors={palette} />

      <View style={styles.column}>
        <View>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            카테고리
          </Text>
          <Selectbox
            options={categoryOptions}
            value={category}
            onValueChange={setCategory}
            placeholder="선택하세요"
            title="카테고리"
          />
        </View>

        <View>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            출금 계좌
          </Text>
          <Selectbox
            options={accountOptions}
            value={account}
            onValueChange={setAccount}
            placeholder="계좌 선택"
            title="출금 계좌"
          />
        </View>

        <View>
          <Text style={[typography.body2.r.medium, { color: palette.text, marginBottom: 8 }]}>
            조회 월
          </Text>
          <Selectbox
            options={monthOptions}
            value={month}
            onValueChange={setMonth}
            placeholder="월 선택"
            title="조회 월"
          />
        </View>
      </View>

      {/* Selectbox Specs */}
      <SectionHeader title="Selectbox Specifications" colors={palette} />
      <View style={[styles.specsContainer, { backgroundColor: palette.fill }]}>
        <SpecItem label="Height" value="48px" colors={palette} />
        <SpecItem label="Border Radius" value="12px" colors={palette} />
        <SpecItem label="Padding" value="12px" colors={palette} />
        <SpecItem label="Font Size" value="16px" colors={palette} />
        <SpecItem label="Picker Type" value="Native" colors={palette} />
      </View>

      {/* Platform Info */}
      <SectionHeader title="Platform Behavior" colors={palette} />
      <View style={[styles.infoContainer, { backgroundColor: palette.fill }]}>
        <Text style={[typography.body2.r.regular, { color: palette.textNeutral, marginBottom: 8 }]}>
          📱 <Text style={{ fontWeight: '600' }}>iOS</Text>: 화면 하단 휠(Wheel) 형태
        </Text>
        <Text style={[typography.body2.r.regular, { color: palette.textNeutral, marginBottom: 8 }]}>
          🤖 <Text style={{ fontWeight: '600' }}>Android</Text>: 네이티브 드롭다운 다이얼로그
        </Text>
        <Text style={[typography.body2.r.regular, { color: palette.textNeutral }]}>
          🌐 <Text style={{ fontWeight: '600' }}>Web</Text>: 브라우저 기본 select
        </Text>
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
      style={[typography.headline3.m.bold, { color: colors.text, marginTop: 32, marginBottom: 16 }]}
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
        typography.body1.l.medium,
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
      <Text style={[typography.body2.r.regular, { color: colors.textNeutral }]}>{label}</Text>
      <Text style={[typography.body2.r.bold, { color: colors.text }]}>{value}</Text>
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
  infoContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
});

