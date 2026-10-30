/**
 * Utility for resident financial transparency report balance gradation.
 * Threshold: 3% of total period expenses.
 */
export type BalanceGradation = 'surplus' | 'balanced' | 'deficit';

export const BALANCE_THRESHOLD_RATIO = 0.03;

/**
 * Determines whether the net balance is in surplus, balanced, or deficit
 * relative to the period's total expenses.
 *
 * - If |netBalance| <= totalExpenses * 0.03 -> 'balanced'
 * - If netBalance > totalExpenses * 0.03   -> 'surplus'
 * - If netBalance < -totalExpenses * 0.03  -> 'deficit'
 *
 * Safe with 0 or negative expenses (avoids division by zero).
 */
export function getBalanceGradation(
  netBalance: number | null | undefined,
  totalExpenses: number | null | undefined,
): BalanceGradation {
  const balance = Number(netBalance) || 0;
  const expenses = Math.max(0, Number(totalExpenses) || 0);
  const threshold = expenses * BALANCE_THRESHOLD_RATIO;

  if (Math.abs(balance) <= threshold) {
    return 'balanced';
  }
  if (balance > threshold) {
    return 'surplus';
  }
  return 'deficit';
}
