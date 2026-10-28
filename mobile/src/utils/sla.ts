export const SLA_THRESHOLD_HOURS: Record<string, number> = {
  EMERGENCY: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168,
};

export function isRequestOverdue(request: {
  status: string;
  priority: string;
  createdAt: string;
}): boolean {
  if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(request.status)) {
    return false;
  }
  const thresholdHours = SLA_THRESHOLD_HOURS[request.priority] ?? 72;
  const elapsedMs = Date.now() - new Date(request.createdAt).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  return elapsedHours > thresholdHours;
}

export function formatTimeWaiting(createdAtStr: string, t: (key: string) => string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(createdAtStr).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} ${t('staff.sos.timeSec')}`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${t('staff.sos.timeMin')}`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours} ${t('staff.sos.timeHour')}`;
}
