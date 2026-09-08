import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UserRole,
  OwnershipType,
  ChargeCalculationMethod,
  PaymentMethod,
  MeterType,
  ReadingStatus,
} from '@prisma/client';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import {
  CreateTariffDto,
  UpdateTariffDto,
  GenerateChargesDto,
  RecordPaymentDto,
} from './dto/finance.dto';
import { getOrCreatePersonalAccount } from './personal-account.helper';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // 1. Управление тарифами ЖК
  // -------------------------------------------------------------

  async getTariffs(tenantId: string) {
    return this.prisma.tariffItem.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTariff(tenantId: string, dto: CreateTariffDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Жилой комплекс не найден');
    }

    if (dto.calculationMethod === ChargeCalculationMethod.PER_CONSUMPTION && !dto.meterType) {
      throw new BadRequestException(
        'Для тарифа по потреблению (PER_CONSUMPTION) необходимо указать тип счётчика (meterType)',
      );
    }

    return this.prisma.tariffItem.create({
      data: {
        tenantId,
        name: dto.name,
        calculationMethod: dto.calculationMethod || ChargeCalculationMethod.FLAT,
        meterType: dto.meterType ?? null,
        rate: dto.rate,
      },
    });
  }

  async updateTariff(
    tariffId: string,
    user: { tenantId?: string | null; role: UserRole },
    dto: UpdateTariffDto,
  ) {
    const tariff = await this.prisma.tariffItem.findUnique({ where: { id: tariffId } });
    if (!tariff) {
      throw new NotFoundException('Тариф не найден');
    }

    assertUserBelongsToTenant(user, tariff.tenantId, 'тарифа');

    const targetMethod = dto.calculationMethod ?? tariff.calculationMethod;
    const targetMeterType = dto.meterType !== undefined ? dto.meterType : tariff.meterType;
    if (targetMethod === ChargeCalculationMethod.PER_CONSUMPTION && !targetMeterType) {
      throw new BadRequestException(
        'Для тарифа по потреблению (PER_CONSUMPTION) необходимо указать тип счётчика (meterType)',
      );
    }

    return this.prisma.tariffItem.update({
      where: { id: tariffId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.calculationMethod !== undefined && { calculationMethod: dto.calculationMethod }),
        ...(dto.meterType !== undefined && { meterType: dto.meterType }),
        ...(dto.rate !== undefined && { rate: dto.rate }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteTariff(
    tariffId: string,
    user: { tenantId?: string | null; role: UserRole },
  ) {
    const tariff = await this.prisma.tariffItem.findUnique({ where: { id: tariffId } });
    if (!tariff) {
      throw new NotFoundException('Тариф не найден');
    }

    assertUserBelongsToTenant(user, tariff.tenantId, 'тарифа');

    // Мягкое удаление (isActive: false) из-за onDelete: Restrict в начислениях
    return this.prisma.tariffItem.update({
      where: { id: tariffId },
      data: { isActive: false },
    });
  }

  // -------------------------------------------------------------
  // 2. Генерация начислений за расчетный период
  // -------------------------------------------------------------

  async generateCharges(
    tenantId: string,
    dto: GenerateChargesDto,
  ) {
    const activeTariffs = await this.prisma.tariffItem.findMany({
      where: { tenantId, isActive: true },
    });

    if (activeTariffs.length === 0) {
      throw new BadRequestException('В данном ЖК нет активных тарифов для начисления');
    }

    const units = await this.prisma.unit.findMany({
      where: { building: { tenantId } },
      include: {
        building: true,
        personalAccount: true,
      },
    });

    if (units.length === 0) {
      return { createdCount: 0, skippedCount: 0 };
    }

    let createdCount = 0;
    let skippedCount = 0;
    const affectedAccountIds = new Set<string>();

    for (const unit of units) {
      const account = await getOrCreatePersonalAccount(this.prisma, unit);

      for (const tariff of activeTariffs) {
        let amount: number;

        if (tariff.calculationMethod === ChargeCalculationMethod.PER_AREA) {
          amount = Math.round(tariff.rate * unit.area * 100) / 100;
        } else if (tariff.calculationMethod === ChargeCalculationMethod.PER_CONSUMPTION) {
          if (!tariff.meterType) {
            skippedCount++;
            continue;
          }

          // Находим активный счётчик квартиры соответствующего типа
          const meter = await this.prisma.meter.findFirst({
            where: {
              unitId: unit.id,
              type: tariff.meterType,
              isActive: true,
            },
          });

          if (!meter) {
            skippedCount++;
            continue;
          }

          // Находим подтверждённое показание за текущий период
          const verifiedReading = await this.prisma.meterReading.findFirst({
            where: {
              meterId: meter.id,
              periodMonth: dto.month,
              periodYear: dto.year,
              status: ReadingStatus.VERIFIED,
            },
          });

          if (!verifiedReading) {
            skippedCount++;
            continue;
          }

          // Находим последнее подтверждённое показание строго до текущего периода
          const prevReading = await this.prisma.meterReading.findFirst({
            where: {
              meterId: meter.id,
              status: ReadingStatus.VERIFIED,
              OR: [
                { periodYear: { lt: dto.year } },
                { periodYear: dto.year, periodMonth: { lt: dto.month } },
              ],
            },
            orderBy: [
              { periodYear: 'desc' },
              { periodMonth: 'desc' },
            ],
          });

          const previousValue = prevReading ? prevReading.value : meter.initialValue;
          const consumption = Math.max(0, verifiedReading.value - previousValue);
          amount = Math.round(tariff.rate * consumption * 100) / 100;
        } else {
          amount = tariff.rate;
        }

        const existingCharge = await this.prisma.charge.findUnique({
          where: {
            accountId_tariffItemId_periodMonth_periodYear: {
              accountId: account.id,
              tariffItemId: tariff.id,
              periodMonth: dto.month,
              periodYear: dto.year,
            },
          },
        });

        if (existingCharge) {
          skippedCount++;
          continue;
        }

        try {
          await this.prisma.charge.create({
            data: {
              accountId: account.id,
              tariffItemId: tariff.id,
              periodMonth: dto.month,
              periodYear: dto.year,
              amount,
            },
          });
          createdCount++;
          affectedAccountIds.add(account.id);
        } catch {
          // Catch potential duplicate race condition
          skippedCount++;
        }
      }
    }

    // Пересчитываем баланс для всех затронутых лицевых счетов
    for (const accountId of affectedAccountIds) {
      await this.recalculateBalance(accountId);
    }

    return { createdCount, skippedCount };
  }

  // -------------------------------------------------------------
  // 3. Прием и фиксация оплат
  // -------------------------------------------------------------

  async recordPayment(
    accountId: string,
    staffUser: { id: string; tenantId?: string | null; role: UserRole },
    dto: RecordPaymentDto,
  ) {
    const account = await this.prisma.personalAccount.findUnique({
      where: { id: accountId },
      include: {
        unit: {
          include: { building: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Лицевой счет не найден');
    }

    assertUserBelongsToTenant(staffUser, account.unit.building.tenantId, 'лицевого счета');

    const payment = await this.prisma.payment.create({
      data: {
        accountId,
        amount: dto.amount,
        method: PaymentMethod.MANUAL,
        recordedById: staffUser.id,
        note: dto.note,
      },
    });

    const newBalance = await this.recalculateBalance(accountId);

    return {
      payment,
      balance: newBalance,
    };
  }

  // -------------------------------------------------------------
  // 4. Просмотр лицевых счетов
  // -------------------------------------------------------------

  async getAccountById(
    accountId: string,
    user: { id: string; tenantId?: string | null; role: UserRole },
  ) {
    const account = await this.prisma.personalAccount.findUnique({
      where: { id: accountId },
      include: {
        unit: {
          include: {
            building: true,
            ownerships: true,
          },
        },
        charges: {
          include: { tariffItem: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          include: {
            recordedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { paidAt: 'desc' },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Лицевой счет не найден');
    }

    const isStaff =
      user.role === UserRole.SUPERADMIN ||
      user.role === UserRole.HOA_ADMIN ||
      user.role === UserRole.HOA_CHAIRMAN;

    if (isStaff) {
      assertUserBelongsToTenant(user, account.unit.building.tenantId, 'лицевого счета');
      return account;
    }

    // Для жителей: разрешено только подтвержденным собственникам данной квартиры
    const isVerifiedOwner = account.unit.ownerships.some(
      (o) =>
        o.userId === user.id &&
        o.ownershipType === OwnershipType.OWNER &&
        o.isVerified,
    );

    if (!isVerifiedOwner) {
      throw new ForbiddenException(
        'Доступ к лицевому счету разрешен только подтвержденным собственникам помещения',
      );
    }

    return account;
  }

  async getTenantAccounts(
    tenantId: string,
    user: { tenantId?: string | null; role: UserRole },
  ) {
    assertUserBelongsToTenant(user, tenantId, 'лицевых счетов');

    return this.prisma.personalAccount.findMany({
      where: {
        unit: {
          building: {
            tenantId,
          },
        },
      },
      include: {
        unit: {
          include: {
            building: true,
            ownerships: {
              where: {
                isVerified: true,
                ownershipType: OwnershipType.OWNER,
              },
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { unit: { building: { blockName: 'asc' } } },
        { unit: { unitNumber: 'asc' } },
      ],
    });
  }

  async getMyAccounts(userId: string) {
    const verifiedOwnerships = await this.prisma.unitOwnership.findMany({
      where: {
        userId,
        ownershipType: OwnershipType.OWNER,
        isVerified: true,
      },
      include: {
        unit: {
          include: {
            building: true,
            personalAccount: {
              include: {
                charges: {
                  include: { tariffItem: true },
                  orderBy: { createdAt: 'desc' },
                  take: 12,
                },
                payments: {
                  orderBy: { paidAt: 'desc' },
                  take: 12,
                },
              },
            },
          },
        },
      },
    });

    if (verifiedOwnerships.length === 0) {
      return [];
    }

    const result = [];
    for (const ownership of verifiedOwnerships) {
      const account = await getOrCreatePersonalAccount(this.prisma, ownership.unit);

      result.push({
        ...account,
        unit: {
          id: ownership.unit.id,
          unitNumber: ownership.unit.unitNumber,
          area: ownership.unit.area,
          floor: ownership.unit.floor,
          entrance: ownership.unit.entrance,
          building: ownership.unit.building,
        },
      });
    }

    return result;
  }

  // -------------------------------------------------------------
  // 5. Расчет сальдо (Баланса) с нуля
  // -------------------------------------------------------------

  async recalculateBalance(accountId: string): Promise<number> {
    const paymentsSum = await this.prisma.payment.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });

    const chargesSum = await this.prisma.charge.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });

    const totalPaid = paymentsSum._sum.amount || 0;
    const totalCharged = chargesSum._sum.amount || 0;
    const balance = Math.round((totalPaid - totalCharged) * 100) / 100;

    await this.prisma.personalAccount.update({
      where: { id: accountId },
      data: { balance },
    });

    return balance;
  }
}
