/**
 * Tab Demo Page
 * 
 * Demonstrates tab navigation component.
 * This page allows visual testing of the Tab component.
 */

import { Tab } from '@/components/ui/tab';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function TabDemoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  // Sample options
  const threeTabs = [
    { label: '일별', value: 'daily' },
    { label: '주별', value: 'weekly' },
    { label: '월별', value: 'monthly' },
  ];

  const fourTabs = [
    { label: '전체', value: 'all' },
    { label: '수입', value: 'income' },
    { label: '지출', value: 'expense' },
    { label: '이체', value: 'transfer' },
  ];

  const fiveTabs = [
    { label: '전체', value: 'all' },
    { label: '식비', value: 'food' },
    { label: '교통', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '기타', value: 'other' },
  ];

  const eightTabs = [
    { label: '식비', value: 'food' },
    { label: '교통비', value: 'transport' },
    { label: '쇼핑', value: 'shopping' },
    { label: '문화생활', value: 'culture' },
    { label: '의료/건강', value: 'health' },
    { label: '교육', value: 'education' },
    { label: '주거/관리', value: 'housing' },
    { label: '기타', value: 'other' },
  ];

  // State for tabs
  const [threeTab, setThreeTab] = useState<string>('monthly');
  const [fourTab, setFourTab] = useState<string>('all');
  const [fiveTab, setFiveTab] = useState<string>('all');
  const [eightTab, setEightTab] = useState<string>('food');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <Text style={[Typography.headline1.xl.bold, { color: colors.text, marginBottom: 8 }]}>
        Tab Components
      </Text>
      <Text style={[Typography.body1.l.regular, { color: colors.textNeutral, marginBottom: 32 }]}>
        Horizontal tab navigation
      </Text>

      {/* Tab - 3 items */}
      <SectionHeader title="Tab - 3 items" colors={colors} />
      
      <Tab
        options={threeTabs}
        value={threeTab}
        onValueChange={setThreeTab}
      />

      <View style={[styles.tabContent, { backgroundColor: colors.fill }]}>
        <Text style={[Typography.body1.l.regular, { color: colors.text }]}>
          조회 기간: <Text style={{ fontWeight: '700' }}>{threeTabs.find(t => t.value === threeTab)?.label}</Text>
        </Text>
      </View>

      {/* Tab - 4 items */}
      <SectionHeader title="Tab - 4 items" colors={colors} />
      
      <Tab
        options={fourTabs}
        value={fourTab}
        onValueChange={setFourTab}
      />

      <View style={[styles.tabContent, { backgroundColor: colors.fill }]}>
        <Text style={[Typography.body1.l.regular, { color: colors.text }]}>
          현재 선택: <Text style={{ fontWeight: '700' }}>{fourTabs.find(t => t.value === fourTab)?.label}</Text>
        </Text>
      </View>

      {/* Tab - 5 items */}
      <SectionHeader title="Tab - 5 items" colors={colors} />
      
      <Tab
        options={fiveTabs}
        value={fiveTab}
        onValueChange={setFiveTab}
      />

      <View style={[styles.tabContent, { backgroundColor: colors.fill }]}>
        <Text style={[Typography.body1.l.regular, { color: colors.text }]}>
          카테고리: <Text style={{ fontWeight: '700' }}>{fiveTabs.find(t => t.value === fiveTab)?.label}</Text>
        </Text>
      </View>

      {/* Scrollable Tab - 8 items */}
      <SectionHeader title="Scrollable Tab - 8 items" colors={colors} />
      
      <Tab
        options={eightTabs}
        value={eightTab}
        onValueChange={setEightTab}
        scrollable
      />

      <View style={[styles.tabContent, { backgroundColor: colors.fill }]}>
        <Text style={[Typography.body1.l.regular, { color: colors.text }]}>
          카테고리: <Text style={{ fontWeight: '700' }}>{eightTabs.find(t => t.value === eightTab)?.label}</Text>
        </Text>
      </View>

      {/* Real-world Example */}
      <SectionHeader title="Real-world Example" colors={colors} />

      <View style={styles.realWorldContainer}>
        <Text style={[Typography.headline3.m.bold, { color: colors.text, marginBottom: 16 }]}>
          거래 내역
        </Text>
        
        <Tab
          options={fourTabs}
          value={fourTab}
          onValueChange={setFourTab}
        />

        <View style={[styles.transactionList, { backgroundColor: colors.staticWhite }]}>
          <View style={styles.transactionItem}>
            <View>
              <Text style={[Typography.body1.l.medium, { color: colors.text }]}>
                스타벅스 강남점
              </Text>
              <Text style={[Typography.body2.r.regular, { color: colors.textNeutral }]}>
                2025.01.15 14:30
              </Text>
            </View>
            <Text style={[Typography.body1.l.bold, { color: colors.statusNegative }]}>
              -5,500원
            </Text>
          </View>

          <View style={styles.transactionItem}>
            <View>
              <Text style={[Typography.body1.l.medium, { color: colors.text }]}>
                월급
              </Text>
              <Text style={[Typography.body2.r.regular, { color: colors.textNeutral }]}>
                2025.01.25 09:00
              </Text>
            </View>
            <Text style={[Typography.body1.l.bold, { color: colors.primary }]}>
              +3,000,000원
            </Text>
          </View>

          <View style={styles.transactionItem}>
            <View>
              <Text style={[Typography.body1.l.medium, { color: colors.text }]}>
                GS25 편의점
              </Text>
              <Text style={[Typography.body2.r.regular, { color: colors.textNeutral }]}>
                2025.01.14 22:10
              </Text>
            </View>
            <Text style={[Typography.body1.l.bold, { color: colors.statusNegative }]}>
              -8,900원
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Specs */}
      <SectionHeader title="Tab Specifications" colors={colors} />
      <View style={[styles.specsContainer, { backgroundColor: colors.fill }]}>
        <SpecItem label="Height" value="56px" colors={colors} />
        <SpecItem label="Text Font (Active)" value="Pretendard Bold 16" colors={colors} />
        <SpecItem label="Text Font (Inactive)" value="Pretendard Medium 16" colors={colors} />
        <SpecItem label="Indicator Height" value="3px" colors={colors} />
        <SpecItem label="Divider Height" value="1px" colors={colors} />
        <SpecItem label="Line Height" value="24px" colors={colors} />
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
  tabContent: {
    padding: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  realWorldContainer: {
    marginTop: 8,
  },
  transactionList: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
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

