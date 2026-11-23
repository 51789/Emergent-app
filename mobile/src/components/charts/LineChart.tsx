import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { colors } from '@/theme';

import { CHART_PADDING, labelStep, niceMax, type ChartPoint } from './scale';

interface LineChartProps {
  data: ChartPoint[];
  height?: number;
  color?: string;
  maxLabels?: number;
  emptyLabel: string;
  formatValue?: (value: number) => string;
}

const GRID_FRACTIONS = [0, 0.5, 1] as const;

/** Line chart with area gradient, built on react-native-svg (no chart library). Zero-safe, auto-scaling. */
export function LineChart({
  data,
  height = 180,
  color = colors.primary,
  maxLabels = 6,
  emptyLabel,
  formatValue = String,
}: LineChartProps) {
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
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const points = data.map((point, index) => ({
    x: left + (data.length > 1 ? index * stepX : plotW / 2),
    y: top + plotH - (point.value / max) * plotH,
    label: point.label,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseline = top + plotH;
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`;
  const every = labelStep(data.length, maxLabels);

  return (
    <View onLayout={onLayout} style={{ height }} accessibilityRole="image">
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>

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

          {data.length > 1 ? <Path d={areaPath} fill="url(#line-area)" /> : null}
          {data.length > 1 ? (
            <Path d={linePath} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {points.map((p, index) => (
            <Circle
              key={`pt-${index}`}
              cx={p.x}
              cy={p.y}
              r={data.length > 20 ? 2.5 : 3.5}
              fill={colors.background}
              stroke={color}
              strokeWidth={2}
            />
          ))}

          {points.map((p, index) =>
            index % every === 0 ? (
              <SvgText
                key={`lbl-${index}`}
                x={p.x}
                y={height - 6}
                fontSize={9}
                fill={colors.textSubtle}
                textAnchor="middle"
              >
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
});
