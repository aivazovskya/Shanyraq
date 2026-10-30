import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { ChargeItem } from '../../api/finance';

export interface RingSegment {
  label: string;
  amount: number;
}

const SEGMENT_COLORS = ['#F4B63D', '#BFE0F4', '#5FB3E8', '#8DC1E3', '#FFFFFF'];
const MAX_SEGMENTS = 5;

/** Splits the latest billing month's charges into per-service shares (largest first). */
export function buildRingSegments(charges: ChargeItem[] | undefined): RingSegment[] {
  if (!charges || charges.length === 0) return [];
  const latest = charges.reduce((best, c) =>
    c.periodYear * 12 + c.periodMonth > best.periodYear * 12 + best.periodMonth ? c : best,
  );
  const byService = new Map<string, number>();
  for (const c of charges) {
    if (c.periodYear !== latest.periodYear || c.periodMonth !== latest.periodMonth) continue;
    if (!(c.amount > 0)) continue;
    const name = c.tariffItem?.name ?? '—';
    byService.set(name, (byService.get(name) ?? 0) + c.amount);
  }
  const sorted = [...byService.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  if (sorted.length <= MAX_SEGMENTS) return sorted;
  const head = sorted.slice(0, MAX_SEGMENTS - 1);
  const rest = sorted.slice(MAX_SEGMENTS - 1).reduce((sum, s) => sum + s.amount, 0);
  return [...head, { label: '…', amount: rest }];
}

export function segmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

interface Props {
  segments: RingSegment[];
  size?: number;
  strokeWidth?: number;
}

/** Shanyraq-style ring: one arc per service, sized by its share of the month's charges. */
export const ChargesRing: React.FC<Props> = ({ segments, size = 88, strokeWidth = 10 }) => {
  const total = segments.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) return null;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        {segments.map((s, i) => {
          const len = Math.max((s.amount / total) * circumference - gap, 1);
          const el = (
            <Circle
              key={s.label + i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={segmentColor(i)}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          offset += (s.amount / total) * circumference;
          return el;
        })}
        <Circle cx={size / 2} cy={size / 2} r={4} fill="#F4B63D" />
      </Svg>
    </View>
  );
};
