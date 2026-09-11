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
import {
  createPdfBuffer,
  drawHeader,
  drawSectionTitle,
  drawTable,
  drawFooter,
  TableColumn,
} from '../../common/pdf/pdf-document.helper';
import { buildCsv } from '../../common/csv/csv.helper';

import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // -------------------------------------------------------------
  // 1. Управление тарифами ЖК
  // -------------------------------------------------------------

  async getTariffs(tenantId: string) {
    return this.prisma.tariffItem.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTariff(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    dto: CreateTariffDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'FINANCE.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    if (dto.calculationMethod === ChargeCalculationMethod.PER_CONSUMPTION && !dto.meterType) {
      throw new BadRequestException({
        code: 'FINANCE.METER_TYPE_REQUIRED',
        message:
          'Для тарифа по потреблению (PER_CONSUMPTION) необходимо указать тип счётчика (meterType)',
      });
    }

    const created = await this.prisma.tariffItem.create({
      data: {
        tenantId,
        name: dto.name,
        calculationMethod: dto.calculationMethod || ChargeCalculationMethod.FLAT,
        meterType: dto.meterType ?? null,
        rate: dto.rate,
      },
    });

    await this.auditLogService.log({
      tenantId,
      actorId: user?.id,
      action: 'TARIFF_CREATED',
      targetType: 'TariffItem',
      targetId: created.id,
      metadata: {
        name: created.name,
        calculationMethod: created.calculationMethod,
        rate: created.rate,
      },
    });

    return created;
  }

  async updateTariff(
    tariffId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    dto: UpdateTariffDto,
  ) {
    const tariff = await this.prisma.tariffItem.findUnique({ where: { id: tariffId } });
    if (!tariff) {
      throw new NotFoundException({
        code: 'FINANCE.TARIFF_NOT_FOUND',
        message: 'Тариф не найден',
      });
    }

    assertUserBelongsToTenant(user, tariff.tenantId, 'тарифа');

    const targetMethod = dto.calculationMethod ?? tariff.calculationMethod;
    const targetMeterType = dto.meterType !== undefined ? dto.meterType : tariff.meterType;
    if (targetMethod === ChargeCalculationMethod.PER_CONSUMPTION && !targetMeterType) {
      throw new BadRequestException({
        code: 'FINANCE.METER_TYPE_REQUIRED',
        message:
          'Для тарифа по потреблению (PER_CONSUMPTION) необходимо указать тип счётчика (meterType)',
      });
    }

    const updated = await this.prisma.tariffItem.update({
      where: { id: tariffId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.calculationMethod !== undefined && { calculationMethod: dto.calculationMethod }),
        ...(dto.meterType !== undefined && { meterType: dto.meterType }),
        ...(dto.rate !== undefined && { rate: dto.rate }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    const changedAfter: Record<string, any> = {};
    if (dto.name !== undefined && dto.name !== tariff.name) changedAfter.name = dto.name;
    if (dto.calculationMethod !== undefined && dto.calculationMethod !== tariff.calculationMethod)
      changedAfter.calculationMethod = dto.calculationMethod;
    if (dto.meterType !== undefined && dto.meterType !== tariff.meterType)
      changedAfter.meterType = dto.meterType;
    if (dto.rate !== undefined && dto.rate !== tariff.rate) changedAfter.rate = dto.rate;
    if (dto.isActive !== undefined && dto.isActive !== tariff.isActive)
      changedAfter.isActive = dto.isActive;

    await this.auditLogService.log({
      tenantId: tariff.tenantId,
      actorId: user?.id,
      action: 'TARIFF_UPDATED',
      targetType: 'TariffItem',
      targetId: tariffId,
      metadata: {
        before: {
          name: tariff.name,
          calculationMethod: tariff.calculationMethod,
          rate: tariff.rate,
          isActive: tariff.isActive,
        },
        after: changedAfter,
      },
    });

    return updated;
  }

  async deleteTariff(
    tariffId: string,
    user: { tenantId?: string | null; role: UserRole },
  ) {
    const tariff = await this.prisma.tariffItem.findUnique({ where: { id: tariffId } });
    if (!tariff) {
      throw new NotFoundException({
        code: 'FINANCE.TARIFF_NOT_FOUND',
        message: 'Тариф не найден',
      });
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
      throw new BadRequestException({
        code: 'FINANCE.NO_ACTIVE_TARIFFS',
        message: 'В данном ЖК нет активных тарифов для начисления',
      });
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
      throw new NotFoundException({
        code: 'FINANCE.ACCOUNT_NOT_FOUND',
        message: 'Лицевой счет не найден',
      });
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
      throw new NotFoundException({
        code: 'FINANCE.ACCOUNT_NOT_FOUND',
        message: 'Лицевой счет не найден',
      });
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
      throw new ForbiddenException({
        code: 'FINANCE.ACCOUNT_ACCESS_CONFIRMED_ONLY',
        message: 'Доступ к лицевому счету разрешен только подтвержденным собственникам помещения',
      });
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

  // -------------------------------------------------------------
  // 6. Формирование PDF-выписки по лицевому счету
  // -------------------------------------------------------------

  async generateAccountStatementPdf(
    accountId: string,
    user: { id: string; tenantId?: string | null; role: UserRole },
    query?: { month?: number; year?: number },
  ): Promise<{ buffer: Buffer; filename: string }> {
    // 1. Re-use getAccountById to enforce strict authorization
    const account = await this.getAccountById(accountId, user);

    // 2. Fetch tenant & verified owners for rich document header
    const [tenant, verifiedOwnerships] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: account.unit.building.tenantId },
      }),
      this.prisma.unitOwnership.findMany({
        where: { unitId: account.unitId, isVerified: true },
        include: { user: true },
      }),
    ]);

    // 3. Filter charges & payments by month and/or year if provided
    let charges = account.charges || [];
    let payments = account.payments || [];

    if (query?.year) {
      const targetYear = Number(query.year);
      charges = charges.filter((c: any) => c.periodYear === targetYear);
      payments = payments.filter((p: any) => new Date(p.paidAt).getFullYear() === targetYear);
    }

    if (query?.month) {
      const targetMonth = Number(query.month);
      charges = charges.filter((c: any) => c.periodMonth === targetMonth);
      payments = payments.filter((p: any) => new Date(p.paidAt).getMonth() + 1 === targetMonth);
    }

    const ownersNames =
      verifiedOwnerships
        .map((o) => `${o.user.lastName} ${o.user.firstName}`)
        .join(', ') || 'Не указан';

    // 4. Build PDF buffer
    const buffer = await this.buildAccountStatementPdf({
      account,
      tenant,
      charges,
      payments,
      ownersNames,
      query,
    });

    const periodPart = query?.year
      ? `_${query.year}${query.month ? '-' + String(query.month).padStart(2, '0') : ''}`
      : '_all';
    const filename = `statement_${account.accountNumber}${periodPart}.pdf`;

    return { buffer, filename };
  }

  async exportAccountStatementCsv(
    accountId: string,
    user: { id: string; tenantId?: string | null; role: UserRole },
    query?: { month?: number; year?: number },
  ): Promise<{ buffer: Buffer; filename: string }> {
    // 1. Re-use getAccountById to enforce strict authorization
    const account = await this.getAccountById(accountId, user);

    // 2. Fetch tenant & verified owners for rich document header
    const [tenant, verifiedOwnerships] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: account.unit.building.tenantId },
      }),
      this.prisma.unitOwnership.findMany({
        where: { unitId: account.unitId, isVerified: true },
        include: { user: true },
      }),
    ]);

    // 3. Filter charges & payments by month and/or year if provided
    let charges = account.charges || [];
    let payments = account.payments || [];

    if (query?.year) {
      const targetYear = Number(query.year);
      charges = charges.filter((c: any) => c.periodYear === targetYear);
      payments = payments.filter((p: any) => new Date(p.paidAt).getFullYear() === targetYear);
    }

    if (query?.month) {
      const targetMonth = Number(query.month);
      charges = charges.filter((c: any) => c.periodMonth === targetMonth);
      payments = payments.filter((p: any) => new Date(p.paidAt).getMonth() + 1 === targetMonth);
    }

    const ownersNames =
      verifiedOwnerships
        .map((o) => `${o.user.lastName} ${o.user.firstName}`)
        .join(', ') || 'Не указан';

    let periodLabel = 'За все время';
    if (query?.year && query?.month) {
      periodLabel = `${String(query.month).padStart(2, '0')}.${query.year}`;
    } else if (query?.year) {
      periodLabel = `${query.year} год`;
    }

    const formatDate = (date: Date | string) => {
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    };

    // 4. Build CSV rows
    const rows: unknown[][] = [
      ['Выписка по лицевому счету'],
      ['Жилой комплекс', tenant?.name || 'Не указан'],
      ['Лицевой счет', account.accountNumber],
      ['Помещение', `кв. ${account.unit.unitNumber}, Блок ${account.unit.building.blockName}`],
      ['Собственник(и)', ownersNames],
      ['Период', periodLabel],
      [],
      ['Начисления'],
      ['Период', 'Тариф', 'Сумма (₸)'],
    ];

    for (const c of charges) {
      const period = `${String(c.periodMonth).padStart(2, '0')}.${c.periodYear}`;
      const name = c.tariffItem?.name || 'Коммунальные услуги';
      rows.push([period, name, c.amount]);
    }

    rows.push([]);
    rows.push(['Платежи']);
    rows.push(['Дата', 'Сумма (₸)', 'Способ / Примечание', 'Принял']);

    for (const p of payments) {
      const date = formatDate(p.paidAt);
      const method = p.method === PaymentMethod.MANUAL ? 'Вручную (касса)' : p.method;
      const methodNote = p.note ? `${method} / ${p.note}` : method;
      const staff = p.recordedBy
        ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
        : 'Сотрудник УК';
      rows.push([date, p.amount, methodNote, staff]);
    }

    rows.push([]);
    rows.push(['Текущий баланс', `${account.balance} ₸`]);

    const buffer = buildCsv(rows);

    const periodPart = query?.year
      ? `_${query.year}${query.month ? '-' + String(query.month).padStart(2, '0') : ''}`
      : '_all';
    const filename = `statement_${account.accountNumber}${periodPart}.csv`;

    return { buffer, filename };
  }

  private async buildAccountStatementPdf(data: {
    account: any;
    tenant: any;
    charges: any[];
    payments: any[];
    ownersNames: string;
    query?: { month?: number; year?: number };
  }): Promise<Buffer> {
    const { account, tenant, charges, payments, ownersNames, query } = data;

    const formatDate = (date: Date | string) => {
      const d = new Date(date);
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    const formatMoney = (val: number) => {
      return (
        val.toLocaleString('ru-RU', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + ' ₸'
      );
    };

    let periodLabel = 'За все время';
    if (query?.year && query?.month) {
      periodLabel = `${String(query.month).padStart(2, '0')}.${query.year}`;
    } else if (query?.year) {
      periodLabel = `${query.year} год`;
    }

    const totalCharges = charges.reduce((acc, c) => acc + (c.amount || 0), 0);
    const totalPayments = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

    return createPdfBuffer((doc) => {
      // 1. Header
      const headerY = drawHeader(doc, {
        title: 'ВЫПИСКА ПО ЛИЦЕВОМУ СЧЕТУ',
        subtitle: `Лицевой счет № ${account.accountNumber}`,
        meta: [
          { label: 'Жилой комплекс', value: tenant?.name || 'Жилой комплекс' },
          { label: 'Адрес', value: tenant?.address || 'Не указан' },
          {
            label: 'Помещение',
            value: `кв. ${account.unit.unitNumber}, Блок ${account.unit.building.blockName} (${account.unit.area} м²)`,
          },
          { label: 'Собственник(и)', value: ownersNames },
          { label: 'Период выписки', value: periodLabel },
          {
            label: 'Текущий баланс',
            value: `${account.balance >= 0 ? '+' : ''}${formatMoney(account.balance)} ${
              account.balance < 0 ? '(Задолженность)' : '(Аванс)'
            }`,
          },
        ],
      });

      // 2. Charges Table
      drawSectionTitle(doc, '1. Начисления за период', headerY);

      const chargeCols: TableColumn[] = [
        { header: '№', width: 25, align: 'center' },
        { header: 'Период', width: 75, align: 'center' },
        { header: 'Статья начисления / Тариф', width: 200, align: 'left' },
        { header: 'Метод расчета', width: 110, align: 'center' },
        { header: 'Сумма', width: 100, align: 'right' },
      ];

      const methodLabels: Record<string, string> = {
        FLAT: 'Фиксированный',
        PER_AREA: 'За площадь (м²)',
        PER_CONSUMPTION: 'По счетчику',
      };

      const chargeRows = charges.map((c: any, index: number) => {
        const period = `${String(c.periodMonth).padStart(2, '0')}.${c.periodYear}`;
        const name = c.tariffItem?.name || 'Коммунальные услуги';
        const method =
          methodLabels[c.tariffItem?.calculationMethod] ||
          c.tariffItem?.calculationMethod ||
          '—';
        const amount = formatMoney(c.amount);
        return [index + 1, period, name, method, amount];
      });

      drawTable(doc, { columns: chargeCols, rows: chargeRows });

      doc
        .font('DejaVuSans-Bold')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(`Итого начислено: ${formatMoney(totalCharges)}`, {
          align: 'right',
        });

      doc.moveDown(0.8);

      // Check if new page needed
      if (doc.y > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
      }

      // 3. Payments Table
      drawSectionTitle(doc, '2. Поступившие оплаты');

      const paymentCols: TableColumn[] = [
        { header: '№', width: 25, align: 'center' },
        { header: 'Дата оплаты', width: 80, align: 'center' },
        { header: 'Способ', width: 85, align: 'center' },
        { header: 'Зафиксировал сотрудник', width: 200, align: 'left' },
        { header: 'Сумма', width: 120, align: 'right' },
      ];

      const paymentRows = payments.map((p: any, index: number) => {
        const date = formatDate(p.paidAt);
        const method = p.method === PaymentMethod.MANUAL ? 'Вручную (касса)' : p.method;
        const staff = p.recordedBy
          ? `${p.recordedBy.firstName} ${p.recordedBy.lastName}`
          : 'Сотрудник УК';
        const amount = formatMoney(p.amount);
        return [index + 1, date, method, staff, amount];
      });

      drawTable(doc, { columns: paymentCols, rows: paymentRows });

      doc
        .font('DejaVuSans-Bold')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(`Итого оплачено: ${formatMoney(totalPayments)}`, {
          align: 'right',
        });

      doc.moveDown(0.8);

      // 4. Summary box
      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage();
      }

      drawSectionTitle(doc, '3. Сводный итог по выписке');
      const diff = totalPayments - totalCharges;

      doc
        .font('DejaVuSans')
        .fontSize(9)
        .fillColor('#334155')
        .text(
          `Начислено за период: ${formatMoney(totalCharges)}\n` +
            `Оплачено за период: ${formatMoney(totalPayments)}\n` +
            `Разница за период: ${diff >= 0 ? '+' : ''}${formatMoney(diff)}\n` +
            `Итоговое сальдо (с учетом предыдущих периодов): ${
              account.balance >= 0 ? '+' : ''
            }${formatMoney(account.balance)} ${
              account.balance < 0
                ? '(Имеется задолженность к оплате)'
                : '(Задолженность отсутствует)'
            }`,
          { lineGap: 3 },
        );

      // Footer
      drawFooter(
        doc,
        `Лицевой счет: ${account.accountNumber} | Документ сформирован автоматически в системе Shanyraq`,
      );
    });
  }
}
