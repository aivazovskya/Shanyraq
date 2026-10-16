export type Workspace = 'dispatcher' | 'security' | 'management' | 'unsupported';
export type DashboardSection = 'requests' | 'sos' | 'points' | 'finance' | 'meetings' | 'structure';
export interface DashboardRequest {
  id: string; tenantId: string; title: string;
  status: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
  priority: 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string; updatedAt: string; assigneeId?: string | null;
  assignee?: { firstName: string; lastName: string } | null;
  unit?: { unitNumber: string; building?: { blockName: string } } | null;
}
export function getWorkspace(role?: string): Workspace {
  if (role === 'DISPATCHER') return 'dispatcher';
  if (role === 'SECURITY') return 'security';
  if (['HOA_ADMIN', 'HOA_CHAIRMAN', 'SUPERADMIN'].includes(role || '')) return 'management';
  return 'unsupported';
}
export function getDashboardPlan(role: string | undefined, tenantId: string | null | undefined): { key: DashboardSection; path: string }[] {
  if (!tenantId) return [];
  const tenant = encodeURIComponent(tenantId);
  const workspace = getWorkspace(role);
  if (workspace === 'unsupported') return [];
  if (workspace === 'security') return [
    { key: 'sos', path: `/sos/tenants/${tenant}?status=ACTIVE` },
    { key: 'points', path: `/access/tenant/${tenant}/points` },
  ];
  const requests = { key: 'requests' as const, path: '/service-requests' };
  if (workspace === 'dispatcher') return [requests];
  return [requests,
    { key: 'finance', path: `/analytics/tenants/${tenant}/finance` },
    { key: 'meetings', path: `/votings/tenant/${tenant}` },
    { key: 'structure', path: `/properties/tenants/${tenant}/structure` },
  ];
}
// Same inactivity thresholds and inclusive boundary as ServiceRequestsSlaSchedulerService.
export const SLA_HOURS = { EMERGENCY: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };
export function isOpenRequest(request: DashboardRequest): boolean {
  return ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(request.status);
}
export function overdueSince(request: DashboardRequest): number {
  return Date.parse(request.updatedAt) + SLA_HOURS[request.priority] * 3600000;
}
export function getRequestQueues(requests: DashboardRequest[], tenantId: string, now: number) {
  const open = requests.filter((request) => request.tenantId === tenantId && isOpenRequest(request));
  const urgent = open.filter((request) => ['EMERGENCY', 'HIGH'].includes(request.priority))
    .sort((a, b) => SLA_HOURS[a.priority] - SLA_HOURS[b.priority] || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const overdue = open.filter((request) => overdueSince(request) <= now).sort((a, b) => overdueSince(a) - overdueSince(b));
  const unassigned = open.filter((request) => !request.assigneeId && !request.assignee);
  return { open, urgent, overdue, unassigned };
}
