export type RequestStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED';
export function getRequestActions(status: RequestStatus): RequestStatus[] {
  return ({
    PENDING: ['IN_PROGRESS', 'REJECTED'],
    ASSIGNED: ['IN_PROGRESS', 'REJECTED'],
    IN_PROGRESS: ['RESOLVED', 'REJECTED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: ['PENDING'],
    REJECTED: ['PENDING'],
  } as Record<RequestStatus, RequestStatus[]>)[status];
}
