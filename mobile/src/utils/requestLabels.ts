import { TFunction } from 'i18next';
import { RequestStatus } from '../api/service-requests';

export function getCategoryLabel(cat: string, t: TFunction): string {
  switch (cat) {
    case 'PLUMBING':
      return t('requests.catPlumbing');
    case 'ELECTRICAL':
      return t('requests.catElectrical');
    case 'ELEVATOR':
      return t('requests.catElevator');
    case 'HEATING':
      return t('requests.catHeating');
    case 'YARD_TERRITORY':
    case 'YARD':
      return t('requests.catYard');
    case 'INTERCOM_ACCESS':
    case 'INTERCOM':
      return t('requests.catIntercom');
    case 'CLEANING':
      return t('requests.catCleaning');
    case 'OTHER':
      return t('requests.catOther');
    default:
      return cat;
  }
}

export function getPriorityLabel(prio: string, t: TFunction): string {
  switch (prio) {
    case 'LOW':
      return t('requests.prioLow');
    case 'MEDIUM':
      return t('requests.prioMedium');
    case 'HIGH':
      return t('requests.prioHigh');
    case 'EMERGENCY':
      return t('requests.prioEmergency');
    default:
      return prio;
  }
}

export type RequestBadgeVariant = 'warning' | 'info' | 'success' | 'danger' | 'default';

export function getStatusInfo(
  status: RequestStatus | string,
  t: TFunction,
): { label: string; variant: RequestBadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: t('requests.statusPending'), variant: 'warning' };
    case 'ASSIGNED':
      return { label: t('requests.statusAssigned'), variant: 'info' };
    case 'IN_PROGRESS':
      return { label: t('requests.statusInProgress'), variant: 'info' };
    case 'RESOLVED':
      return { label: t('requests.statusResolved'), variant: 'success' };
    case 'REJECTED':
      return { label: t('requests.statusRejected'), variant: 'danger' };
    case 'CLOSED':
      return { label: t('requests.statusClosed'), variant: 'default' };
    default:
      return { label: status, variant: 'default' };
  }
}
