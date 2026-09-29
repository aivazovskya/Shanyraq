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
      tenantId?: string;
    };
  };
}

export interface TariffBreakdownItem {
  tariffId: string;
  tariffName: string;
  amount: number;
}

export interface TransparencyExpenseCategoryItem {
  category: string;
  amount: number;
}

export interface FinancialTransparencyReport {
  periodMonth: number;
  periodYear: number;
  totalCharged: number;
  totalCollected: number;
  collectionRatePercent: number;
  byTariff: TariffBreakdownItem[];
  totalExpenses: number;
  byExpenseCategory: TransparencyExpenseCategoryItem[];
  netBalance: number;
}

export const financeApi = {
  getMyAccounts: async (): Promise<PersonalAccountData[]> => {
    const res = await apiClient.get<PersonalAccountData[]>('/finance/my-accounts');
    return res.data;
  },
  getTransparencyReport: async (
    tenantId: string,
    params?: { month?: number; year?: number },
  ): Promise<FinancialTransparencyReport> => {
    const res = await apiClient.get<FinancialTransparencyReport>(
      `/finance/tenants/${tenantId}/transparency-report`,
      { params },
    );
    return res.data;
  },
};

