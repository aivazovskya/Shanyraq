export interface RingCharge {
  periodMonth: number;
  periodYear: number;
  amount: number;
  tariffItem?: { name?: string } | null;
}

export interface RingSegment {
  label: string;
  amount: number;
}

export const RING_COLORS = ['#F4B63D', '#1A6BAA', '#5FA5D6', '#8DC1E3', '#0C2233'];
const MAX_SEGMENTS = 5;

/** Splits the latest billing month's charges into per-service shares (largest first). */
export function buildRingSegments(charges: RingCharge[] | undefined | null): RingSegment[] {
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
  const sorted = Array.from(byService.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  if (sorted.length <= MAX_SEGMENTS) return sorted;
  const head = sorted.slice(0, MAX_SEGMENTS - 1);
  const rest = sorted.slice(MAX_SEGMENTS - 1).reduce((sum, s) => sum + s.amount, 0);
  return [...head, { label: '…', amount: rest }];
}

/** Shanyraq-style ring: one arc per service, sized by its share of the month's charges. */
export default function ChargesRing({ segments, size = 112 }: { segments: RingSegment[]; size?: number }) {
  const total = segments.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) return null;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const len = Math.max((s.amount / total) * c - gap, 1);
          const el = (
            <circle
              key={s.label + i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={RING_COLORS[i % RING_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += (s.amount / total) * c;
          return el;
        })}
      </g>
      <circle cx={size / 2} cy={size / 2} r={5} fill="#F4B63D" />
    </svg>
  );
}
