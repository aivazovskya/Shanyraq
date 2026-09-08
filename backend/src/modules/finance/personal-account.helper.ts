/**
 * Helper utilities for PersonalAccount generation and retrieval/creation.
 */

/**
 * Generates an account number guaranteed to be unique per unit by folding in
 * a slice of the unit's globally unique ID (matching the protocolNumber pattern in votings).
 * Example: ACC-БЛОКА-101-A1B2C3
 */
export function generateAccountNumber(
  blockName: string,
  unitNumber: string,
  unitId: string,
): string {
  const cleanBlock = blockName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, '').toUpperCase();
  const suffix = unitId.slice(0, 6).toUpperCase();
  return `ACC-${cleanBlock}-${unitNumber}-${suffix}`;
}

export interface UnitForPersonalAccount {
  id: string;
  unitNumber: string;
  building: {
    blockName: string;
  };
  personalAccount?: any;
}

/**
 * Shared helper to get or lazily create a PersonalAccount for a unit.
 * Deduplicates account creation across PropertiesService and FinanceService.
 */
export async function getOrCreatePersonalAccount(
  prisma: {
    personalAccount: {
      create: (args: { data: { unitId: string; accountNumber: string }; include?: any }) => Promise<any>;
    };
  },
  unit: UnitForPersonalAccount,
): Promise<any> {
  if (unit.personalAccount) {
    return unit.personalAccount;
  }

  const accountNumber = generateAccountNumber(
    unit.building.blockName,
    unit.unitNumber,
    unit.id,
  );

  const created = await prisma.personalAccount.create({
    data: {
      unitId: unit.id,
      accountNumber,
    },
  });

  return {
    charges: [],
    payments: [],
    ...created,
  };
}
