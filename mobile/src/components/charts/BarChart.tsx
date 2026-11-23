import { Fragment, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { colors } from '@/theme';

import { CHART_PADDING, labelStep, niceMax, type ChartPoint } from './scale';

interface BarChartProps {
  data: ChartPoint[];
  height?: number;
  color?: string;
  maxLabels?: number;
  showValues?: boolean;
  emptyLabel: string;
  formatValue?: (value: number) => string;
}

const GRID_FRACTIONS = [0, 0.5, 1] as const;
const MAX_BAR_WIDTH = 28;

/** Bar chart built on react-native-svg. Zero-safe, auto-scaling, with x-label thinning. */
export function BarChart({
  data,
  height = 180,
  color = colors.primary,
  maxLabels = 8,
  showValues = false,
  emptyLabel,
  formatValue = String,
}: BarChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <AppText variant="caption" color="textSubtle">
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const { left, right, top, bottom } = CHART_PADDING;
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const max = niceMax(Math.max(...data.map((point) => point.value)));
  const slot = plotW / data.length;
  const barW = Math.min(MAX_BAR_WIDTH, slot * 0.6);
  const every = labelStep(data.length, maxLabels);

  return (
    <View onLayout={onLayout} style={{ height }} accessibilityRole="image">
      {width > 0 ? (
        <Svg width={width} height={height}>
          {GRID_FRACTIONS.map((fraction) => {
            const y = top + plotH - plotH * fraction;
            return (
              <G key={fraction}>
                <Line x1={left} x2={width - right} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />
                <SvgText x={left - 6} y={y + 3} fontSize={9} fill={colors.textSubtle} textAnchor="end">
                  {formatValue(Math.round(max * fraction))}
                </SvgText>
              </G>
            );
          })}

          {data.map((point, index) => {
            const x = left + index * slot + (slot - barW) / 2;
            const barH = (point.value / max) * plotH;
            const y = top + plotH - barH;
            return (
              <Fragment key={`${point.label}-${index}`}>
                <Rect x={x} y={y} width={barW} height={Math.max(1, barH)} fill={color} rx={3} ry={3} />
                {showValues && point.value > 0 ? (
                  <SvgText x={x + barW / 2} y={y - 4} fontSize={9} fill={colors.textMuted} textAnchor="middle">
                    {formatValue(point.value)}
                  </SvgText>
                ) : null}
                {index % every === 0 ? (
                  <SvgText x={x + barW / 2} y={height - 6} fontSize={9} fill={colors.textSubtle} textAnchor="middle">
                    {point.label}
                  </SvgText>
                ) : null}
              </Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
});
