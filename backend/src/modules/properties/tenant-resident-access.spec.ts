import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService, MAX_RESIDENTS_PER_UNIT } from './properties.service';
import { AuthService } from '../auth/auth.service';
import { PropertiesSchedulerService } from './properties-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, OwnershipType, InvitationStatus } from '@prisma/client';

describe('Tenant Resident Access & Lifecycle (TASK-022)', () => {
  let propertiesService: PropertiesService;
  let authService: AuthService;
  let schedulerService: PropertiesSchedulerService;
  let prismaMock: any;
  let auditLogServiceMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: { findUnique: jest.fn() },
      unit: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      unitOwnership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
      },
      unitInvitation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      guestPass: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
    };

    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      sendToTenantRoles: jest.fn().mockResolvedValue(undefined),
    };

    redisServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    jwtServiceMock = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'access-secret-32-chars-long-here-secure';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret-32-chars-long-here-sec';
        if (key === 'DEV_OTP_ECHO') return 'true';
        if (key === 'NODE_ENV') return 'development';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        AuthService,
        PropertiesSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    propertiesService = module.get<PropertiesService>(PropertiesService);
    authService = module.get<AuthService>(AuthService);
    schedulerService = module.get<PropertiesSchedulerService>(PropertiesSchedulerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockOwner = {
    id: 'owner-uuid-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: 'tenant-shanyraq-1',
  };

  const mockUnit = {
    id: 'unit-101',
    unitNumber: '101',
    floor: 3,
    entrance: 1,
    area: 75.0,
    building: {
      id: 'b-1',
      blockName: 'Блок А',
      tenantId: 'tenant-shanyraq-1',
      tenant: { name: 'ЖК Шаңырақ' },
    },
    ownerships: [
      {
        id: 'own-1',
        userId: 'owner-uuid-1',
        unitId: 'unit-101',
        ownershipType: OwnershipType.OWNER,
        isVerified: true,
        user: { id: 'owner-uuid-1', phone: '+77015550101' },
      },
    ],
    invitations: [],
  };

  describe('1. Создание приглашения собственником (POST /properties/units/:unitId/invitations)', () => {
    it('успешно создает приглашение для квартиранта со сроком аренды', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const mockCreatedInvite = {
        id: 'inv-1',
        unitId: 'unit-101',
        invitedById: mockOwner.id,
        phone: '+77015550199',
        fullName: 'Серик Ахметов',
        ownershipType: OwnershipType.TENANT,
        leaseEndDate: new Date(futureDate),
        status: InvitationStatus.PENDING,
      };
      prismaMock.unitInvitation.create.mockResolvedValue(mockCreatedInvite);

      const res = await propertiesService.inviteResident('unit-101', mockOwner, {
        phone: '+77015550199',
        fullName: 'Серик Ахметов',
        ownershipType: OwnershipType.TENANT,
        leaseEndDate: futureDate,
      });

      expect(res.id).toBe('inv-1');
      expect(prismaMock.unitInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'unit-101',
            invitedById: mockOwner.id,
            phone: '+77015550199',
            ownershipType: OwnershipType.TENANT,
            status: InvitationStatus.PENDING,
          }),
        }),
      );
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TENANT_INVITED',
          targetType: 'UnitInvitation',
        }),
      );
    });

    it('запрещает приглашение не-собственнику квартиры (HTTP 403)', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      const foreignResident = { id: 'stranger-id', role: UserRole.RESIDENT_OWNER };

      await expect(
        propertiesService.inviteResident('unit-101', foreignResident, {
          phone: '+77015550199',
          ownershipType: OwnershipType.TENANT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('отклоняет приглашение, если дата окончания аренды в прошлом (HTTP 400)', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      await expect(
        propertiesService.inviteResident('unit-101', mockOwner, {
          phone: '+77015550199',
          ownershipType: OwnershipType.TENANT,
          leaseEndDate: pastDate,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Лимиты и валидация дубликатов', () => {
    it('лимит жильцов: запрещает приглашение при достижении MAX_RESIDENTS_PER_UNIT (5) (не считая собственника)', async () => {
      const fullUnit = {
        ...mockUnit,
        ownerships: [
          { userId: mockOwner.id, ownershipType: OwnershipType.OWNER, isVerified: true, user: { phone: '+77015550101' } },
          { userId: 'u2', ownershipType: OwnershipType.TENANT, isVerified: true, user: { phone: '+77012222222' } },
          { userId: 'u3', ownershipType: OwnershipType.TENANT, isVerified: true, user: { phone: '+77013333333' } },
          { userId: 'u4', ownershipType: OwnershipType.TENANT, isVerified: true, user: { phone: '+77014444444' } },
          { userId: 'u5', ownershipType: OwnershipType.TENANT, isVerified: true, user: { phone: '+77015555555' } },
          { userId: 'u6', ownershipType: OwnershipType.FAMILY_MEMBER, isVerified: true, user: { phone: '+77016666666' } },
        ],
        invitations: [],
      };
      prismaMock.unit.findUnique.mockResolvedValue(fullUnit);

      await expect(
        propertiesService.inviteResident('unit-101', mockOwner, {
          phone: '+77019999999',
          ownershipType: OwnershipType.TENANT,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.UNIT_RESIDENTS_LIMIT_EXCEEDED',
        }),
      });
    });

    it('запрещает приглашать самого себя (HTTP 400 PROPERTIES.CANNOT_INVITE_SELF)', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);

      await expect(
        propertiesService.inviteResident('unit-101', { ...mockOwner, phone: '+77015550101' }, {
          phone: '+77015550101',
          ownershipType: OwnershipType.TENANT,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.CANNOT_INVITE_SELF',
        }),
      });
    });

    it('приглашение на уже привязанный телефон: отклоняет с ошибкой PHONE_ALREADY_RESIDENT', async () => {
      const unitWithResident = {
        ...mockUnit,
        ownerships: [
          ...mockUnit.ownerships,
          {
            isVerified: true,
            user: { phone: '+77015550199' },
          },
        ],
      };
      prismaMock.unit.findUnique.mockResolvedValue(unitWithResident);

      await expect(
        propertiesService.inviteResident('unit-101', mockOwner, {
          phone: '+77015550199',
          ownershipType: OwnershipType.TENANT,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.PHONE_ALREADY_RESIDENT',
        }),
      });
    });

    it('повторное приглашение: отклоняет, если инвайт на этот номер уже в PENDING', async () => {
      const unitWithPending = {
        ...mockUnit,
        invitations: [
          {
            phone: '+77015550199',
            status: InvitationStatus.PENDING,
          },
        ],
      };
      prismaMock.unit.findUnique.mockResolvedValue(unitWithPending);

      await expect(
        propertiesService.inviteResident('unit-101', mockOwner, {
          phone: '+77015550199',
          ownershipType: OwnershipType.TENANT,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.INVITATION_ALREADY_PENDING',
        }),
      });
    });
  });

  describe('3. Автопривязка при входе по OTP (AuthService.verifyOtp)', () => {
    it('при входе по номеру с PENDING-инвайтом создает подтвержденный UnitOwnership и присваивает RESIDENT_TENANT', async () => {
      const testPhone = '+77015550199';
      // Mock OTP in Redis
      redisServiceMock.get.mockImplementation(async (key: string) => {
        if (key === `otp:${testPhone}`) {
          return JSON.stringify({ code: '123456', expiresAt: Date.now() + 60000, attempts: 0 });
        }
        return null;
      });

      // User does not exist yet
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const createdUser = {
        id: 'new-tenant-user-id',
        phone: testPhone,
        firstName: 'Житель',
        lastName: '0199',
        role: UserRole.RESIDENT_OWNER,
        isVerified: false,
        tenantId: null,
        tokenVersion: 1,
      };
      prismaMock.user.create.mockResolvedValue(createdUser);

      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      prismaMock.unitInvitation.findMany.mockResolvedValue([
        {
          id: 'inv-uuid-1',
          unitId: 'unit-101',
          invitedById: 'owner-uuid-1',
          phone: testPhone,
          fullName: 'Серик Ахметов',
          ownershipType: OwnershipType.TENANT,
          leaseEndDate: futureDate,
          status: InvitationStatus.PENDING,
          unit: {
            building: { tenantId: 'tenant-shanyraq-1' },
          },
        },
      ]);

      prismaMock.unitOwnership.upsert.mockResolvedValue({ id: 'new-own-id' });
      prismaMock.unitInvitation.update.mockResolvedValue({ id: 'inv-uuid-1', status: InvitationStatus.ACCEPTED });
      prismaMock.unitOwnership.count.mockResolvedValue(0); // No owner units

      const finalUser = {
        ...createdUser,
        role: UserRole.RESIDENT_TENANT,
        isVerified: true,
        tenantId: 'tenant-shanyraq-1',
        firstName: 'Серик',
        lastName: 'Ахметов',
      };
      prismaMock.user.update.mockResolvedValue(finalUser);

      const res = await authService.verifyOtp({ phone: testPhone, code: '123456' });

      expect(res.user.role).toBe(UserRole.RESIDENT_TENANT);
      expect(res.user.isVerified).toBe(true);
      expect(prismaMock.unitOwnership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            unitId: 'unit-101',
            ownershipType: OwnershipType.TENANT,
            isVerified: true,
          }),
        }),
      );
      expect(prismaMock.unitInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-uuid-1' },
          data: expect.objectContaining({
            status: InvitationStatus.ACCEPTED,
          }),
        }),
      );
    });
  });

  describe('4. Отзыв доступа собственником (каскадный отзыв пропусков и PIN)', () => {
    it('мгновенно удаляет привязку, отзывает активные пропуска и инкрементирует tokenVersion', async () => {
      const tenantOwnership = {
        id: 'own-tenant-1',
        unitId: 'unit-101',
        userId: 'tenant-user-1',
        ownershipType: OwnershipType.TENANT,
        isVerified: true,
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
        user: { id: 'tenant-user-1', tokenVersion: 1 },
      };
      prismaMock.unitOwnership.findUnique.mockResolvedValue(tenantOwnership);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(mockUnit.ownerships[0]); // mockOwner is owner
      prismaMock.unitOwnership.count.mockResolvedValue(0); // No remaining units

      const result = await propertiesService.revokeResidentAccess('unit-101', 'own-tenant-1', mockOwner);

      expect(result.success).toBe(true);
      expect(prismaMock.unitOwnership.delete).toHaveBeenCalledWith({
        where: { id: 'own-tenant-1' },
      });
      // Guest passes revoked
      expect(prismaMock.guestPass.updateMany).toHaveBeenCalledWith({
        where: {
          unitId: 'unit-101',
          creatorId: 'tenant-user-1',
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
          revokedById: mockOwner.id,
        }),
      });
      // Tokens invalidated and PIN reset
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'tenant-user-1' },
        data: expect.objectContaining({
          tokenVersion: { increment: 1 },
          accessPinHash: null,
          isVerified: false,
        }),
      });
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OWNERSHIP_REVOKED',
          targetType: 'UnitOwnership',
        }),
      );
    });

    it('запрещает собственнику отзывать доступ у самого себя (HTTP 400)', async () => {
      const ownerOwnership = {
        id: 'own-1',
        unitId: 'unit-101',
        userId: mockOwner.id,
        ownershipType: OwnershipType.OWNER,
        isVerified: true,
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
        user: { id: mockOwner.id },
      };
      prismaMock.unitOwnership.findUnique.mockResolvedValue(ownerOwnership);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(ownerOwnership);

      await expect(
        propertiesService.revokeResidentAccess('unit-101', 'own-1', mockOwner),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.CANNOT_REVOKE_SELF',
        }),
      });
    });
  });

  describe('5. Истечение срока аренды и фоновые задачи (PropertiesSchedulerService)', () => {
    it('handleLeaseExpirationsAndReminders: закрывает истекшие привязки и отзывает пропуска', async () => {
      const expiredOwnership = {
        id: 'expired-own-1',
        unitId: 'unit-101',
        userId: 'tenant-expired-1',
        leaseEndDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Вчера
        isVerified: true,
        unit: {
          building: { tenantId: 'tenant-shanyraq-1' },
        },
        user: { id: 'tenant-expired-1', tokenVersion: 1 },
      };
      prismaMock.unitOwnership.findMany
        .mockResolvedValueOnce([expiredOwnership]) // 1. Истекшие
        .mockResolvedValueOnce([]); // 2. Напоминания

      prismaMock.unitOwnership.count.mockResolvedValue(0);

      const summary = await schedulerService.handleLeaseExpirationsAndReminders();

      expect(summary.expiredClosed).toBe(1);
      expect(prismaMock.unitOwnership.delete).toHaveBeenCalledWith({
        where: { id: 'expired-own-1' },
      });
      expect(prismaMock.guestPass.updateMany).toHaveBeenCalledWith({
        where: {
          unitId: 'unit-101',
          creatorId: 'tenant-expired-1',
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
        }),
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'tenant-expired-1' },
        data: expect.objectContaining({
          tokenVersion: { increment: 1 },
        }),
      });
    });

    it('handleLeaseExpirationsAndReminders: отправляет уведомление собственнику за 7 дней до окончания', async () => {
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const expiringSoon = {
        id: 'soon-own-1',
        unitId: 'unit-101',
        userId: 'tenant-user-1',
        invitedById: 'owner-uuid-1',
        leaseEndDate: in7Days,
        isVerified: true,
        unit: {
          unitNumber: '101',
          building: { tenantId: 'tenant-shanyraq-1' },
          ownerships: [{ userId: 'owner-uuid-1', ownershipType: 'OWNER', isVerified: true }],
        },
        user: { id: 'tenant-user-1' },
      };

      prismaMock.unitOwnership.findMany
        .mockResolvedValueOnce([]) // 1. Истекшие
        .mockResolvedValueOnce([expiringSoon]); // 2. Напоминания за 7 дней

      redisServiceMock.get.mockResolvedValue(null); // Не отправляли ранее

      const summary = await schedulerService.handleLeaseExpirationsAndReminders();

      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'owner-uuid-1',
        expect.objectContaining({
          title: expect.stringContaining('Окончание срока аренды'),
        }),
      );
      expect(redisServiceMock.set).toHaveBeenCalledWith(
        'properties:lease-reminder:soon-own-1',
        '1',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('6. Продление срока аренды (PATCH /properties/units/:unitId/residents/:ownershipId/lease)', () => {
    it('позволяет собственнику изменить дату окончания аренды', async () => {
      const tenantOwnership = {
        id: 'own-tenant-1',
        unitId: 'unit-101',
        userId: 'tenant-user-1',
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
      };
      prismaMock.unitOwnership.findUnique.mockResolvedValue(tenantOwnership);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(mockUnit.ownerships[0]);

      const newDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      prismaMock.unitOwnership.update.mockResolvedValue({
        id: 'own-tenant-1',
        leaseEndDate: new Date(newDate),
      });

      const res = await propertiesService.extendLease('unit-101', 'own-tenant-1', { leaseEndDate: newDate }, mockOwner);

      expect(res.id).toBe('own-tenant-1');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEASE_EXTENDED',
          targetType: 'UnitOwnership',
        }),
      );
    });
  });

  describe('7. Изоляция ЖК (Cross-Tenant Security: staff другого ЖК -> 403, своего ЖК -> OK, SUPERADMIN -> OK)', () => {
    const foreignStaff = {
      id: 'staff-other-hoa',
      role: UserRole.HOA_ADMIN,
      tenantId: 'tenant-other-hoa-999',
    };

    const ownStaff = {
      id: 'staff-own-hoa',
      role: UserRole.DISPATCHER,
      tenantId: 'tenant-shanyraq-1',
    };

    const superAdmin = {
      id: 'super-admin-user',
      role: UserRole.SUPERADMIN,
      tenantId: null,
    };

    describe('7.1. inviteResident', () => {
      it('staff другого ЖК получает 403 PROPERTIES.CROSS_TENANT_FORBIDDEN', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);

        await expect(
          propertiesService.inviteResident('unit-101', foreignStaff, {
            phone: '+77017770001',
            ownershipType: OwnershipType.TENANT,
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PROPERTIES.CROSS_TENANT_FORBIDDEN',
          }),
        });
      });

      it('staff своего ЖК успешно приглашает жильца', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitInvitation.create.mockResolvedValue({ id: 'inv-own-staff' });

        const res = await propertiesService.inviteResident('unit-101', ownStaff, {
          phone: '+77017770001',
          ownershipType: OwnershipType.TENANT,
        });
        expect(res.id).toBe('inv-own-staff');
      });

      it('SUPERADMIN успешно приглашает жильца без привязки к ЖК', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitInvitation.create.mockResolvedValue({ id: 'inv-superadmin' });

        const res = await propertiesService.inviteResident('unit-101', superAdmin, {
          phone: '+77017770001',
          ownershipType: OwnershipType.TENANT,
        });
        expect(res.id).toBe('inv-superadmin');
      });
    });

    describe('7.2. getUnitResidents', () => {
      it('staff другого ЖК получает 403 PROPERTIES.CROSS_TENANT_FORBIDDEN', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);

        await expect(
          propertiesService.getUnitResidents('unit-101', foreignStaff),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PROPERTIES.CROSS_TENANT_FORBIDDEN',
          }),
        });
      });

      it('staff своего ЖК успешно просматривает жильцов', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);

        const res = await propertiesService.getUnitResidents('unit-101', ownStaff);
        expect(res.unit.id).toBe('unit-101');
        expect(Array.isArray(res.residents)).toBe(true);
      });

      it('SUPERADMIN успешно просматривает жильцов', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);

        const res = await propertiesService.getUnitResidents('unit-101', superAdmin);
        expect(res.unit.id).toBe('unit-101');
      });
    });

    describe('7.3. revokeResidentAccess', () => {
      const mockTenantOwnership = {
        id: 'own-tenant-revoke',
        unitId: 'unit-101',
        userId: 'tenant-user-1',
        ownershipType: OwnershipType.TENANT,
        isVerified: true,
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
        user: { id: 'tenant-user-1', tokenVersion: 1 },
      };

      it('staff другого ЖК получает 403 PROPERTIES.CROSS_TENANT_FORBIDDEN', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);

        await expect(
          propertiesService.revokeResidentAccess('unit-101', 'own-tenant-revoke', foreignStaff),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PROPERTIES.CROSS_TENANT_FORBIDDEN',
          }),
        });
      });

      it('staff своего ЖК успешно отзывает доступ жильца', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);
        prismaMock.unitOwnership.count.mockResolvedValue(0);

        const res = await propertiesService.revokeResidentAccess('unit-101', 'own-tenant-revoke', ownStaff);
        expect(res.success).toBe(true);
      });

      it('SUPERADMIN успешно отзывает доступ жильца', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);
        prismaMock.unitOwnership.count.mockResolvedValue(0);

        const res = await propertiesService.revokeResidentAccess('unit-101', 'own-tenant-revoke', superAdmin);
        expect(res.success).toBe(true);
      });
    });

    describe('7.4. extendLease', () => {
      const mockTenantOwnership = {
        id: 'own-tenant-lease',
        unitId: 'unit-101',
        userId: 'tenant-user-1',
        ownershipType: OwnershipType.TENANT,
        isVerified: true,
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
      };

      it('staff другого ЖК получает 403 PROPERTIES.CROSS_TENANT_FORBIDDEN', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);

        await expect(
          propertiesService.extendLease('unit-101', 'own-tenant-lease', {}, foreignStaff),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PROPERTIES.CROSS_TENANT_FORBIDDEN',
          }),
        });
      });

      it('staff своего ЖК успешно обновляет срок', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);
        prismaMock.unitOwnership.update.mockResolvedValue({ id: 'own-tenant-lease' });

        const res = await propertiesService.extendLease('unit-101', 'own-tenant-lease', {}, ownStaff);
        expect(res.id).toBe('own-tenant-lease');
      });

      it('SUPERADMIN успешно обновляет срок', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockTenantOwnership);
        prismaMock.unitOwnership.update.mockResolvedValue({ id: 'own-tenant-lease' });

        const res = await propertiesService.extendLease('unit-101', 'own-tenant-lease', {}, superAdmin);
        expect(res.id).toBe('own-tenant-lease');
      });
    });

    describe('7.5. revokeInvitation', () => {
      const mockInvitation = {
        id: 'inv-to-revoke',
        unitId: 'unit-101',
        status: InvitationStatus.PENDING,
        phone: '+77019998877',
        unit: { building: { tenantId: 'tenant-shanyraq-1' } },
      };

      it('staff другого ЖК получает 403 PROPERTIES.CROSS_TENANT_FORBIDDEN', async () => {
        prismaMock.unitInvitation.findUnique.mockResolvedValue(mockInvitation);

        await expect(
          propertiesService.revokeInvitation('unit-101', 'inv-to-revoke', foreignStaff),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PROPERTIES.CROSS_TENANT_FORBIDDEN',
          }),
        });
      });

      it('staff своего ЖК успешно отзывает приглашение', async () => {
        prismaMock.unitInvitation.findUnique.mockResolvedValue(mockInvitation);
        prismaMock.unitInvitation.update.mockResolvedValue({ id: 'inv-to-revoke', status: InvitationStatus.REVOKED });

        const res = await propertiesService.revokeInvitation('unit-101', 'inv-to-revoke', ownStaff);
        expect(res.status).toBe(InvitationStatus.REVOKED);
      });

      it('SUPERADMIN успешно отзывает приглашение', async () => {
        prismaMock.unitInvitation.findUnique.mockResolvedValue(mockInvitation);
        prismaMock.unitInvitation.update.mockResolvedValue({ id: 'inv-to-revoke', status: InvitationStatus.REVOKED });

        const res = await propertiesService.revokeInvitation('unit-101', 'inv-to-revoke', superAdmin);
        expect(res.status).toBe(InvitationStatus.REVOKED);
      });
    });
  });

  describe('8. Защита совладельца (Co-Owner Protection)', () => {
    const coOwnerRecord = {
      id: 'own-co-owner-2',
      unitId: 'unit-101',
      userId: 'other-owner-user-id',
      ownershipType: OwnershipType.OWNER,
      isVerified: true,
      unit: { building: { tenantId: 'tenant-shanyraq-1' } },
      user: { id: 'other-owner-user-id', phone: '+77015550202' },
    };

    it('собственник не может отозвать доступ у совладельца (HTTP 403 PROPERTIES.CANNOT_REVOKE_OWNER)', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue(coOwnerRecord);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(mockUnit.ownerships[0]);

      await expect(
        propertiesService.revokeResidentAccess('unit-101', 'own-co-owner-2', mockOwner),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.CANNOT_REVOKE_OWNER',
        }),
      });
    });

    it('нельзя устанавливать или изменять срок аренды для OWNER (HTTP 403 PROPERTIES.CANNOT_REVOKE_OWNER)', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue(coOwnerRecord);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(mockUnit.ownerships[0]);

      await expect(
        propertiesService.extendLease('unit-101', 'own-co-owner-2', { leaseEndDate: new Date().toISOString() }, mockOwner),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PROPERTIES.CANNOT_REVOKE_OWNER',
        }),
      });
    });
  });

  describe('9. Минимальный DTO без утечек данных (GET units/:unitId/residents)', () => {
    it('возвращает чистый DTO: без verificationDoc, без verifiedById/invitedById, sharePercent только для OWNER', async () => {
      const unitWithDetails = {
        ...mockUnit,
        ownerships: [
          {
            id: 'own-owner',
            unitId: 'unit-101',
            userId: mockOwner.id,
            ownershipType: OwnershipType.OWNER,
            sharePercent: 100,
            isVerified: true,
            verificationDoc: 'secret-deed-document-url.pdf',
            verifiedAt: new Date(),
            verifiedById: 'admin-id',
            invitedById: null,
            createdAt: new Date('2026-01-01'),
            user: {
              id: mockOwner.id,
              firstName: 'Айбек',
              lastName: 'Смагулов',
              phone: '+77015550101',
              role: UserRole.RESIDENT_OWNER,
            },
            invitedBy: null,
          },
          {
            id: 'own-tenant',
            unitId: 'unit-101',
            userId: 'tenant-user-1',
            ownershipType: OwnershipType.TENANT,
            sharePercent: 0,
            isVerified: true,
            verificationDoc: 'tenant-contract.pdf',
            verifiedAt: new Date(),
            verifiedById: 'admin-id',
            invitedById: mockOwner.id,
            leaseEndDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            createdAt: new Date('2026-02-01'),
            user: {
              id: 'tenant-user-1',
              firstName: 'Серик',
              lastName: 'Ахметов',
              phone: '+77015550199',
              role: UserRole.RESIDENT_TENANT,
            },
            invitedBy: {
              id: mockOwner.id,
              firstName: 'Айбек',
              lastName: 'Смагулов',
              phone: '+77015550101',
            },
          },
        ],
        invitations: [
          {
            id: 'inv-pending-1',
            unitId: 'unit-101',
            phone: '+77018889900',
            fullName: 'Асель Мусина',
            ownershipType: OwnershipType.FAMILY_MEMBER,
            status: InvitationStatus.PENDING,
            leaseEndDate: null,
            createdAt: new Date(),
            invitedBy: {
              id: mockOwner.id,
              firstName: 'Айбек',
              lastName: 'Смагулов',
              phone: '+77015550101',
            },
          },
        ],
      };
      prismaMock.unit.findUnique.mockResolvedValue(unitWithDetails);

      const res = await propertiesService.getUnitResidents('unit-101', mockOwner);

      expect(res.totalCount).toBe(2); // 1 tenant + 1 pending invitation (owner excluded from occupied count)
      expect(res.maxAllowed).toBe(MAX_RESIDENTS_PER_UNIT);
      expect(res.residents).toHaveLength(2);

      const ownerDto = res.residents[0] as any;
      expect(ownerDto.ownershipType).toBe(OwnershipType.OWNER);
      expect(ownerDto.sharePercent).toBe(100);
      expect(ownerDto.verificationDoc).toBeUndefined();
      expect(ownerDto.verifiedById).toBeUndefined();
      expect(ownerDto.invitedById).toBeUndefined();
      expect(ownerDto.phone).toBe('+77015550101');

      const tenantDto = res.residents[1] as any;
      expect(tenantDto.ownershipType).toBe(OwnershipType.TENANT);
      expect(tenantDto.sharePercent).toBeUndefined(); // Скрыто для не-собственников
      expect(tenantDto.verificationDoc).toBeUndefined();
      expect(tenantDto.verifiedById).toBeUndefined();
      expect(tenantDto.invitedById).toBeUndefined();
      expect(tenantDto.phone).toBe('+77015550199'); // Полный номер для собственника
      expect(tenantDto.status).toBe('ACTIVE');
      expect(tenantDto.invitedByName).toBe('Айбек Смагулов');

      const invDto = res.invitations[0] as any;
      expect(invDto.phone).toBe('+77018889900');
      expect(invDto.status).toBe(InvitationStatus.PENDING);
    });
  });
});
