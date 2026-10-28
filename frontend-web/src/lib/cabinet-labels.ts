import { TFunction } from 'i18next';

export function getRequestStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return '—';
  switch (status.toUpperCase()) {
    case 'PENDING':
      return t('cabinet.statusPending');
    case 'ASSIGNED':
      return t('cabinet.statusAssigned');
    case 'IN_PROGRESS':
      return t('cabinet.statusInProgress');
    case 'RESOLVED':
      return t('cabinet.statusResolved');
    case 'REJECTED':
      return t('cabinet.statusRejected');
    case 'CLOSED':
      return t('cabinet.statusClosed');
    default:
      return status;
  }
}

export function getRequestPriorityLabel(priority: string | undefined | null, t: TFunction): string {
  if (!priority) return '—';
  switch (priority.toUpperCase()) {
    case 'LOW':
      return t('cabinet.priorityLow');
    case 'MEDIUM':
      return t('cabinet.priorityMedium');
    case 'HIGH':
      return t('cabinet.priorityHigh');
    case 'URGENT':
      return t('cabinet.priorityUrgent');
    case 'EMERGENCY':
      return t('cabinet.priorityEmergency');
    default:
      return priority;
  }
}

export function getRequestCategoryLabel(category: string | undefined | null, t: TFunction): string {
  if (!category) return '—';
  switch (category.toUpperCase()) {
    case 'PLUMBING':
      return t('cabinet.categoryPlumbing');
    case 'ELECTRICAL':
      return t('cabinet.categoryElectrical');
    case 'HVAC':
      return t('cabinet.categoryHvac');
    case 'ELEVATOR':
      return t('cabinet.categoryElevator');
    case 'INTERCOM':
      return t('cabinet.categoryIntercom');
    case 'CLEANING':
      return t('cabinet.categoryCleaning');
    case 'LANDSCAPING':
      return t('cabinet.categoryLandscaping');
    case 'SECURITY':
      return t('cabinet.categorySecurity');
    case 'OTHER':
      return t('cabinet.categoryOther');
    default:
      return category;
  }
}

export function getVotingStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return '—';
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return t('cabinet.votingActive');
    case 'COMPLETED':
      return t('cabinet.votingCompleted');
    case 'DRAFT':
      return t('cabinet.votingDraft');
    case 'CANCELLED':
      return t('cabinet.votingCancelled');
    default:
      return status;
  }
}

export interface GuestPassLike {
  isRevoked?: boolean;
  isUsed?: boolean;
  validTo?: string;
  status?: string;
}

export function getGuestPassStatusLabel(pass: GuestPassLike | undefined | null, t: TFunction): string {
  if (!pass) return '—';
  if (pass.isRevoked || pass.status === 'REVOKED') {
    return t('cabinet.passRevoked');
  }
  if (pass.isUsed || pass.status === 'USED') {
    return t('cabinet.passUsed');
  }
  if (pass.validTo && new Date(pass.validTo).getTime() < Date.now()) {
    return t('cabinet.passExpired');
  }
  return t('cabinet.passActive');
}

export function getAccessPointTypeLabel(type: string | undefined | null, t: TFunction): string {
  if (!type) return '—';
  switch (type.toUpperCase()) {
    case 'BARRIER':
      return t('cabinet.pointBarrier');
    case 'GATE':
      return t('cabinet.pointGate');
    case 'DOOR_INTERCOM':
    case 'INTERCOM':
      return t('cabinet.pointIntercom');
    case 'CAMERA':
      return t('cabinet.pointCamera');
    default:
      return type;
  }
}

export function getSosStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return '—';
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return t('cabinet.sosActive');
    case 'RESOLVED':
      return t('cabinet.sosResolved');
    case 'CANCELLED':
      return t('cabinet.sosCancelled');
    case 'FALSE_ALARM':
      return t('cabinet.sosFalseAlarm');
    default:
      return status;
  }
}

export function getBookingStatusLabel(status: string | undefined | null, t: TFunction): string {
  if (!status) return '—';
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return t('cabinet.bookingConfirmed');
    case 'PENDING':
      return t('cabinet.bookingPending');
    case 'CANCELLED':
      return t('cabinet.bookingCancelled');
    case 'COMPLETED':
      return t('cabinet.bookingCompleted');
    default:
      return status;
  }
}

export function getResourceTypeLabel(type: string | undefined | null, t: TFunction): string {
  if (!type) return '—';
  switch (type.toUpperCase()) {
    case 'COWORKING':
      return t('amenities.types.coworking', { defaultValue: 'Коворкинг' });
    case 'BBQ':
      return t('amenities.types.bbq', { defaultValue: 'Барбекю' });
    case 'PLAYGROUND':
      return t('amenities.types.playground', { defaultValue: 'Детская комната' });
    case 'GYM':
      return t('amenities.types.gym', { defaultValue: 'Фитнес-зал' });
    case 'TERRACE':
      return t('amenities.types.terrace', { defaultValue: 'Терраса' });
    case 'PARTY_ROOM':
      return t('amenities.types.party_room', { defaultValue: 'Комната мероприятий' });
    case 'MEETING_ROOM':
      return t('amenities.types.meeting_room', { defaultValue: 'Переговорная' });
    default:
      return type;
  }
}

export function getCommunityListingTypeLabel(type: string | undefined | null, t: TFunction): string {
  if (!type) return '—';
  switch (type.toUpperCase()) {
    case 'SALE':
    case 'SELL':
      return t('cabinet.typeSell');
    case 'RENT':
      return t('cabinet.typeRent');
    case 'FREE':
    case 'GIVE_AWAY':
      return t('cabinet.typeGiveAway');
    case 'SERVICE':
    case 'OTHER':
      return t('cabinet.typeOther');
    default:
      return type;
  }
}

export function getMeterTypeLabel(type: string | undefined | null, t: TFunction): string {
  if (!type) return '—';
  switch (type.toUpperCase()) {
    case 'COLD_WATER':
      return t('cabinet.meterColdWater');
    case 'HOT_WATER':
      return t('cabinet.meterHotWater');
    case 'ELECTRICITY':
      return t('cabinet.meterElectricity');
    default:
      return t('cabinet.meterOther');
  }
}

export function getRoleLabel(role: string | undefined | null, t: TFunction): string {
  if (!role) return '';
  switch (role.toUpperCase()) {
    case 'HOA_ADMIN':
      return t('roles.hoa_admin');
    case 'HOA_CHAIRMAN':
      return t('roles.hoa_chairman');
    case 'DISPATCHER':
      return t('roles.dispatcher');
    case 'SECURITY':
      return t('roles.security');
    case 'MANAGEMENT_COMPANY':
      return t('roles.management_company');
    case 'SUPERADMIN':
      return t('roles.superadmin');
    case 'RESIDENT_OWNER':
    case 'OWNER':
      return t('cabinet.roleOwner');
    case 'RESIDENT_TENANT':
    case 'TENANT':
      return t('cabinet.roleTenant');
    case 'FAMILY_MEMBER':
      return t('cabinet.roleFamily');
    default:
      return role;
  }
}
