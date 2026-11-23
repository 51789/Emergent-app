import { ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnalyticsRangeKey } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { spacing } from '@/theme';
import { isValidDateInput, toDateInput } from '@/utils/date';

export const RANGE_KEYS: readonly AnalyticsRangeKey[] = ['realtime', '7d', '30d', '90d', '180d', '365d', 'custom'];

export interface CustomRange {
  from: string;
  to: string;
}

interface RangePickerProps {
  value: AnalyticsRangeKey;
  onChange: (range: AnalyticsRangeKey) => void;
  /** Called with a validated custom range when "Apply" is pressed. */
  onApplyCustom: (range: CustomRange) => void;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInput(date);
}

/** Range pills (realtime / 7d / ... / custom) with from-to inputs for the custom range. */
export function RangePicker({ value, onChange, onApplyCustom }: RangePickerProps) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (!isValidDateInput(from) || !isValidDateInput(to)) {
      setError(t('admin.invalidDate'));
      return;
    }
    if (from.trim() > to.trim()) {
      setError(t('admin.invalidRange'));
      return;
    }
    setError(null);
    onApplyCustom({ from: from.trim(), to: to.trim() });
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {RANGE_KEYS.map((key) => (
          <Chip
            key={key}
            label={t(`admin.range.${key}`)}
            selected={value === key}
            onPress={() => onChange(key)}
            testID={`range-${key}`}
          />
        ))}
      </ScrollView>

      {value === 'custom' ? (
        <View style={styles.custom}>
          <View style={styles.dates}>
            <View style={styles.date}>
              <TextField
                label={t('admin.from')}
                value={from}
                onChangeText={setFrom}
                placeholder={t('admin.dateHint')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.date}>
              <TextField
                label={t('admin.to')}
                value={to}
                onChangeText={setTo}
                placeholder={t('admin.dateHint')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          {error ? (
            <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <Button label={t('admin.apply')} variant="secondary" onPress={apply} testID="range-apply" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  pills: { gap: spacing.sm, paddingVertical: spacing.xs },
  custom: { gap: spacing.md },
  dates: { flexDirection: 'row', gap: spacing.md },
  date: { flex: 1 },
});
