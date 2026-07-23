import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';

export type BarPoint = { label: string; value: number; sublabel?: string };

interface BarChartProps {
  data: BarPoint[];
  height?: number;
  color?: string;
  showValues?: boolean;
  maxLabels?: number;
  formatValue?: (v: number) => string;
}

/**
 * Simple, dependency-free bar chart built on top of react-native-svg.
 * Auto-scales, zero-safe, X-axis label thinning to avoid overlaps.
 */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 180,
  color = '#007AFF',
  showValues = false,
  maxLabels = 7,
  formatValue,
}) => {
  const { paddedMax, chartH, w, barW, gap, everyN } = useMemo(() => {
    const rawMax = Math.max(1, ...data.map((d) => d.value));
    // Snap max up to a "nice" number to make axis lines readable
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)) || 0);
    const paddedMax = Math.ceil(rawMax / magnitude) * magnitude || 1;
    const chartH = height - 30; // reserve space for x labels
    const barW = 16;
    const gap = 8;
    const w = Math.max(300, data.length * (barW + gap));
    const everyN = Math.max(1, Math.ceil(data.length / maxLabels));
    return { paddedMax, chartH, w, barW, gap, everyN };
  }, [data, height, maxLabels]);

  if (data.length === 0) {
    return (
      <View style={[styles.emptyBox, { height }]}>
        <Text style={styles.emptyText}>Nessun dato</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={{ height, width: '100%' }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
          {/* Grid lines (25/50/75/100%) */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = chartH - chartH * frac;
            return (
              <Line
                key={frac}
                x1={0}
                x2={w}
                y1={y}
                y2={y}
                stroke="#EEE"
                strokeWidth={1}
              />
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const x = i * (barW + gap) + gap / 2;
            const h = (d.value / paddedMax) * chartH;
            const y = chartH - h;
            return (
              <React.Fragment key={i}>
                <Rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  fill={color}
                  rx={3}
                  ry={3}
                />
                {showValues && d.value > 0 && (
                  <SvgText
                    x={x + barW / 2}
                    y={y - 4}
                    fontSize={9}
                    fill="#666"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {formatValue ? formatValue(d.value) : String(d.value)}
                  </SvgText>
                )}
                {/* X-axis label (thin out to avoid collision) */}
                {i % everyN === 0 && (
                  <SvgText
                    x={x + barW / 2}
                    y={chartH + 14}
                    fontSize={9}
                    fill="#888"
                    textAnchor="middle"
                  >
                    {d.sublabel || d.label}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#AAA', fontSize: 12, fontStyle: 'italic' },
});
