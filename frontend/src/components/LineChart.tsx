import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

export type LinePoint = { label: string; value: number; sublabel?: string };

interface LineChartProps {
  data: LinePoint[];
  height?: number;
  color?: string;
  maxLabels?: number;
  areaFill?: boolean;
}

/**
 * Simple line chart with optional area gradient fill. Zero-safe. Auto-scales.
 */
export const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 180,
  color = '#007AFF',
  maxLabels = 7,
  areaFill = true,
}) => {
  const { pathD, areaD, points, chartH, w, everyN } = useMemo(() => {
    const chartH = height - 30;
    const w = Math.max(300, data.length * 40);
    const rawMax = Math.max(1, ...data.map((d) => d.value));
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)) || 0);
    const paddedMax = Math.ceil(rawMax / magnitude) * magnitude || 1;
    const stepX = data.length > 1 ? w / (data.length - 1) : w;

    const points = data.map((d, i) => ({
      x: i * stepX,
      y: chartH - (d.value / paddedMax) * chartH,
      v: d.value,
      label: d.sublabel || d.label,
    }));

    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    const areaD = points.length
      ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${chartH} L 0 ${chartH} Z`
      : '';

    const everyN = Math.max(1, Math.ceil(data.length / maxLabels));

    return { pathD, areaD, points, chartH, w, everyN };
  }, [data, height, maxLabels]);

  if (data.length === 0) {
    return (
      <View style={[styles.emptyBox, { height }]}>
        <Text style={styles.emptyText}>Nessun dato nel periodo</Text>
      </View>
    );
  }

  const gid = 'lc-grad';

  return (
    <View>
      <View style={{ height, width: '100%' }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
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

          {/* Area fill */}
          {areaFill && data.length > 1 && (
            <Path d={areaD} fill={`url(#${gid})`} />
          )}

          {/* Main line */}
          {data.length > 1 && (
            <Path d={pathD} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Points */}
          {points.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={data.length > 20 ? 2.5 : 3.5} fill="#FFF" stroke={color} strokeWidth={2} />
          ))}

          {/* X-axis labels */}
          {points.map((p, i) => (
            i % everyN === 0 ? (
              <SvgText
                key={`lbl-${i}`}
                x={p.x}
                y={chartH + 14}
                fontSize={9}
                fill="#888"
                textAnchor="middle"
              >
                {p.label}
              </SvgText>
            ) : null
          ))}
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
