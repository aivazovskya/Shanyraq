import { apiClient } from './client';

export interface TariffItem {
  id: string;
  name: string;
  calculationMethod: 'FLAT' | 'PER_AREA';
  rate: number;
  isActive: boolean;
}

export interface ChargeItem {
  id: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  createdAt: string;
  tariffItem: TariffItem;
}

export interface PaymentItem {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
  recordedBy?: {
    firstName: string;
    lastName: string;
  };
}

export interface PersonalAccountData {
  id: string;
  accountNumber: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
  charges: ChargeItem[];
  payments: PaymentItem[];
  unit: {
    id: string;
    unitNumber: string;
    area: number;
    floor: number;
    entrance: number;
    building: {
      id: string;
      blockName: string;
    };
  };
}

export const financeApi = {
  getMyAccounts: async (): Promise<PersonalAccountData[]> => {
    const res = await apiClient.get<PersonalAccountData[]>('/finance/my-accounts');
    return res.data;
  },
};
