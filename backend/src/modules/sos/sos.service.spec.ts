import { Test, TestingModule } from '@nestjs/testing';
import { SosService } from './sos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, SosAlertStatus } from '@prisma/client';

describe('SosService', () => {
  let service: SosService;
  let prismaMock: any;
  let notificationsServiceMock: any;

  const mockTenantId = 'tenant-1';
  const mockAlertId = 'alert-sos-100';
  const mockUnitId = 'unit-42';

  const residentUnverifiedUser = {
    id: 'user-resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Айбек',
    lastName: 'Нурланов',
    phone: '+77015550101',
    isVerified: false,
  };

  const residentTenantUser = {
    id: 'user-tenant-1',
    role: UserRole.RESIDENT_TENANT,
    tenantId: mockTenantId,
    firstName: 'Динара',
    lastName: 'Серикова',
    phone: '+77017778899',
    isVerified: true,
  };

  const securityUser = {
    id: 'security-1',
    role: UserRole.SECURITY,
    tenantId: mockTenantId,
    firstName: 'Руслан',
    lastName: 'Охранов',
  };

  const dispatcherUser = {
    id: 'dispatcher-1',
    role: UserRole.DISPATCHER,
    tenantId: mockTenantId,
    firstName: 'Гульнара',
    lastName: 'Диспетчерова',
  };

  const hoaAdminUser = {
    id: 'hoa-admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
    firstName: 'Ерлан',
    lastName: 'Управляющий',
  };

  const hoaChairmanUser = {
    id: 'hoa-chairman-1',
    role: UserRole.HOA_CHAIRMAN,
    tenantId: mockTenantId,
    firstName: 'Кайрат',
    lastName: 'Председатель',
  };

  const staffOtherTenantUser = {
    id: 'staff-other-1',
    role: UserRole.SECURITY,
    tenantId: 'tenant-2',
    firstName: 'Чужой',
    lastName: 'Охранник',
  };

  const superAdminUser = {
    id: 'super-admin-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
    firstName: 'Администратор',
    lastName: 'Платформы',
  };

  const mockAlert = {
    id: mockAlertId,
    tenantId: mockTenantId,
    unitId: mockUnitId,
    triggeredById: residentUnverifiedUser.id,
    latitude: 51.1284,
    longitude: 71.4305,
    status: SosAlertStatus.ACTIVE,
    resolvedById: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      sosAlert: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<SosService>(SosService);
  });

  describe('trigger (Экстренный вызов SOS)', () => {
    it('неверифицированный житель может успешно отправить сигнал SOS', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentUnverifiedUser.id,
        unitId: mockUnitId,
        isVerified: false,
        unit: { unitNumber: '101', building: { tenantId: mockTenantId } },
      });
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null); // No existing active alert
      prismaMock.sosAlert.create.mockResolvedValue({ ...mockAlert, unitId: mockUnitId });

      const res = await service.trigger(residentUnverifiedUser, {
        latitude: 51.1284,
        longitude: 71.4305,
      });

      expect(res.id).toBe(mockAlertId);
      expect(prismaMock.sosAlert.create).toHaveBeenCalledWith({
        data: {
          tenantId: mockTenantId,
          unitId: mockUnitId,
          triggeredById: residentUnverifiedUser.id,
          latitude: 51.1284,
          longitude: 71.4305,
          status: SosAlertStatus.ACTIVE,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        [UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        expect.objectContaining({
          title: expect.stringContaining('SOS'),
          body: expect.stringContaining('Айбек Нурланов'),
        }),
      );
    });

    it('житель без привязанных квартир (unitId = null) может успешно вызвать SOS', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null);
      prismaMock.sosAlert.create.mockResolvedValue({ ...mockAlert, unitId: null });

      const res = await service.trigger(residentUnverifiedUser, {});

      expect(res.id).toBe(mockAlertId);
      expect(prismaMock.sosAlert.create).toHaveBeenCalledWith({
        data: {
          tenantId: mockTenantId,
          unitId: null,
          triggeredById: residentUnverifiedUser.id,
          latitude: null,
          longitude: null,
          status: SosAlertStatus.ACTIVE,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalled();
    });

    it('отклоняет вызов, если невозможно определить tenantId пользователя', async () => {
      const userWithoutTenant = { id: 'user-homeless', role: UserRole.RESIDENT_OWNER, tenantId: null };
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(service.trigger(userWithoutTenant, {})).rejects.toThrow(BadRequestException);
    });

    it('дедупликация: повторный вызов при ACTIVE не создает новый алерт и повторяет push', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        unitId: mockUnitId,
        unit: { unitNumber: '101' },
      });
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(mockAlert); // Active alert already exists

      const res = await service.trigger(residentUnverifiedUser, {
        latitude: 51.1284,
        longitude: 71.4305,
      });

      expect(res.id).toBe(mockAlert.id);
      expect(prismaMock.sosAlert.create).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        [UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        expect.objectContaining({
          title: expect.stringContaining('SOS'),
        }),
      );
    });

    it('уведомление отправляется ролям SECURITY, DISPATCHER, HOA_ADMIN и исключает HOA_CHAIRMAN', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null);
      prismaMock.sosAlert.create.mockResolvedValue(mockAlert);

      await service.trigger(residentUnverifiedUser, {});

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        expect.arrayContaining([UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN]),
        expect.any(Object),
      );
      const calledRoles = notificationsServiceMock.sendToTenantRoles.mock.calls[0][1];
      expect(calledRoles).not.toContain(UserRole.HOA_CHAIRMAN);
      expect(calledRoles).not.toContain(UserRole.SUPERADMIN);
    });
  });

  describe('getTenantAlerts (Просмотр журнала SOS персоналом)', () => {
    it('разрешает просмотр охране, диспетчеру, админу и председателю своего ЖК', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const resSecurity = await service.getTenantAlerts(mockTenantId, securityUser);
      expect(resSecurity).toHaveLength(1);

      const resChairman = await service.getTenantAlerts(mockTenantId, hoaChairmanUser);
      expect(resChairman).toHaveLength(1);
    });

    it('запрещает просмотр персоналу чужого ЖК (BOLA)', async () => {
      await expect(service.getTenantAlerts(mockTenantId, staffOtherTenantUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('разрешает просмотр SUPERADMIN для любого ЖК', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const res = await service.getTenantAlerts(mockTenantId, superAdminUser);
      expect(res).toHaveLength(1);
    });
  });

  describe('resolve (Обработка сигнала SOS)', () => {
    it('охрана может успешно закрыть вызов как RESOLVED', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);
      prismaMock.sosAlert.update.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.RESOLVED,
        resolvedById: securityUser.id,
        resolvedAt: new Date(),
        resolutionNote: 'Помощь оказана',
      });

      const res = await service.resolve(mockAlertId, securityUser, {
        status: SosAlertStatus.RESOLVED,
        note: 'Помощь оказана',
      });

      expect(res.status).toBe(SosAlertStatus.RESOLVED);
      expect(prismaMock.sosAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAlertId },
          data: expect.objectContaining({
            status: SosAlertStatus.RESOLVED,
            resolvedById: securityUser.id,
            resolutionNote: 'Помощь оказана',
          }),
        }),
      );
    });

    it('диспетчер может закрыть вызов как FALSE_ALARM', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);
      prismaMock.sosAlert.update.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.FALSE_ALARM,
        resolvedById: dispatcherUser.id,
      });

      const res = await service.resolve(mockAlertId, dispatcherUser, {
        status: SosAlertStatus.FALSE_ALARM,
        note: 'Случайное нажатие ребенком',
      });

      expect(res.status).toBe(SosAlertStatus.FALSE_ALARM);
    });

    it('председатель ОСИ (HOA_CHAIRMAN) НЕ может закрыть вызов (read-only)', async () => {
      await expect(
        service.resolve(mockAlertId, hoaChairmanUser, {
          status: SosAlertStatus.RESOLVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('персонал чужого ЖК не может закрыть вызов (BOLA)', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);

      await expect(
        service.resolve(mockAlertId, staffOtherTenantUser, {
          status: SosAlertStatus.RESOLVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('нельзя закрыть уже обработанный вызов повторно', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.RESOLVED,
      });

      await expect(
        service.resolve(mockAlertId, securityUser, {
          status: SosAlertStatus.RESOLVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyAlerts', () => {
    it('возвращает список алертов текущего пользователя', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const res = await service.getMyAlerts(residentUnverifiedUser);
      expect(res).toHaveLength(1);
      expect(prismaMock.sosAlert.findMany).toHaveBeenCalledWith({
        where: { triggeredById: residentUnverifiedUser.id },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
