import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('AuditLogService (Журнал аудита действий персонала)', () => {
  let service: AuditLogService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('log (Best-effort recording)', () => {
    it('должен успешно создавать запись в таблице audit_logs', async () => {
      prismaMock.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        tenantId: 'tenant-1',
        actorId: 'staff-1',
        action: 'TARIFF_CREATED',
        targetType: 'TariffItem',
        targetId: 'tariff-1',
        metadata: { name: 'Отопление', rate: 150 },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          actorId: 'staff-1',
          action: 'TARIFF_CREATED',
          targetType: 'TariffItem',
          targetId: 'tariff-1',
          metadata: { name: 'Отопление', rate: 150 },
        },
      });
    });

    it('должен сохранять запись с actorId: null, если актор опущен или не передан', async () => {
      prismaMock.auditLog.create.mockResolvedValue({ id: 'log-2' });

      await service.log({
        tenantId: 'tenant-1',
        action: 'TARIFF_CREATED',
        targetType: 'TariffItem',
        targetId: 'tariff-2',
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          actorId: null,
          action: 'TARIFF_CREATED',
          targetType: 'TariffItem',
          targetId: 'tariff-2',
          metadata: undefined,
        },
      });
    });

    it('НЕ должен выбрасывать исключение при ошибке БД (best-effort logging, Decision #4)', async () => {
      prismaMock.auditLog.create.mockRejectedValue(new Error('DB connection refused'));

      // Не должно выбрасывать ошибку
      await expect(
        service.log({
          tenantId: 'tenant-1',
          actorId: 'staff-1',
          action: 'RESIDENT_ACTIVATED',
          targetType: 'User',
          targetId: 'user-1',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('getAuditLogs (Tenant isolation & filtering)', () => {
    const mockStaffUser = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
    const mockForeignUser = { id: 'admin-2', role: UserRole.HOA_ADMIN, tenantId: 'tenant-alien' };
    const mockSuperadmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };

    it('должен блокировать доступ сотруднику чужого ЖК (assertUserBelongsToTenant)', async () => {
      await expect(
        service.getAuditLogs('tenant-1', mockForeignUser, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать доступ сотруднику своего ЖК и применять фильтры по умолчанию (30 дней)', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          tenantId: 'tenant-1',
          action: 'TARIFF_CREATED',
          actor: { firstName: 'Арман', lastName: 'Сериков', role: UserRole.HOA_ADMIN },
          createdAt: new Date(),
        },
      ]);

      const res = await service.getAuditLogs('tenant-1', mockStaffUser, {});

      expect(res).toHaveLength(1);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        }),
      );
    });

    it('должен применять фильтрацию по типу действия (action)', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      await service.getAuditLogs('tenant-1', mockStaffUser, { action: 'RESIDENT_DEACTIVATED' });

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            action: 'RESIDENT_DEACTIVATED',
          }),
        }),
      );
    });

    it('должен разрешать доступ SUPERADMIN к любому ЖК', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      const res = await service.getAuditLogs('tenant-any', mockSuperadmin, {});
      expect(res).toEqual([]);
    });

    it('корректно возвращает записи с actor: null (удаленный/деактивированный актор, Decision #3)', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-orphaned',
          tenantId: 'tenant-1',
          actorId: null,
          actor: null,
          action: 'TARIFF_UPDATED',
          createdAt: new Date(),
        },
      ]);

      const res = await service.getAuditLogs('tenant-1', mockStaffUser, {});
      expect(res).toHaveLength(1);
      expect(res[0].actor).toBeNull();
    });
  });

  describe('exportAuditLogsCsv (RFC 4180 with UTF-8 BOM)', () => {
    const mockStaffUser = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };

    it('должен формировать CSV-буфер с BOM-префиксом и корректными заголовками и строками', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          tenantId: 'tenant-1',
          action: 'TARIFF_CREATED',
          targetType: 'TariffItem',
          targetId: 'tariff-1',
          metadata: { name: 'РСЖ', rate: 100 },
          actor: { firstName: 'Арман', lastName: 'Сериков', role: UserRole.HOA_ADMIN },
          createdAt: new Date('2026-09-11T10:00:00.000Z'),
        },
        {
          id: 'log-2',
          tenantId: 'tenant-1',
          action: 'RESIDENT_DEACTIVATED',
          targetType: 'User',
          targetId: 'user-2',
          metadata: { residentName: 'Иван Иванов' },
          actor: null, // deleted actor
          createdAt: new Date('2026-09-11T11:00:00.000Z'),
        },
      ]);

      const { buffer, filename } = await service.exportAuditLogsCsv('tenant-1', mockStaffUser, {});

      expect(filename).toContain('audit-log-tenant-1-');
      expect(filename.endsWith('.csv')).toBe(true);

      const csvString = buffer.toString('utf-8');
      // Проверяем наличие UTF-8 BOM в самом начале
      expect(csvString.startsWith('\uFEFF')).toBe(true);

      // Проверяем заголовки
      expect(csvString).toContain('Дата и время,Сотрудник (ФИО),Роль,Действие,Тип объекта,ID объекта,Детали / Изменения');

      // Проверяем строки
      expect(csvString).toContain('Арман Сериков,HOA_ADMIN,Создание тарифа,TariffItem,tariff-1');
      expect(csvString).toContain('Удаленный сотрудник,—,Деактивация жильца,User,user-2');
    });
  });
});
