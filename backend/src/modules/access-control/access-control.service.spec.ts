import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessPointType, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AccessControlService (Аудит безопасности СКУД и IDOR)', () => {
  let service: AccessControlService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      accessPoint: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      accessLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      guestPass: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
  });

  describe('createGuestPass (IDOR защита)', () => {
    it('должен блокировать создание гостевого пропуска для чужой квартиры', async () => {
      // Пользователь 'resident-1' пытается выписать пропуск на квартиру 'unit-alien-99'
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createGuestPass(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          {
            unitId: 'unit-alien-99',
            guestName: 'Курьер',
            validFrom: new Date().toISOString(),
            validTo: new Date(Date.now() + 3600000).toISOString(),
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.guestPass.create).not.toHaveBeenCalled();
    });

    it('должен разрешать создание пропуска для своей подтвержденной квартиры', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-own-101',
        isVerified: true,
      });

      prismaMock.guestPass.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'pass-1', ...args.data }),
      );

      const res = await service.createGuestPass(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        {
          unitId: 'unit-own-101',
          guestName: 'Гость Азамат',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 3600000).toISOString(),
        },
      );

      expect(res.id).toBe('pass-1');
      expect(res.accessCode).toBeDefined();
      expect(res.accessCode.length).toBe(6);
    });
  });

  describe('openBarrier (Достоверный аудит-трейл)', () => {
    const mockBarrier = {
      id: 'barrier-1',
      tenantId: 'tenant-1',
      name: 'Шлагбаум Въезд',
      type: AccessPointType.BARRIER,
      controllerType: 'PAL_ES',
    };

    it('должен сохранять в аудит-лог истинную квартиру жителя из базы, а не поддельный unitId из запроса', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      
      // Житель владеет квартирой unit-real-101
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-real-101',
        isVerified: true,
      });

      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-1', createdAt: new Date(), ...args.data }),
      );

      // Клиент пытается передать unitId чужой квартиры: 'unit-fake-999'
      const res = await service.openBarrier('resident-1', UserRole.RESIDENT_OWNER, {
        accessPointId: 'barrier-1',
        unitId: 'unit-fake-999',
      });

      expect(res.success).toBe(true);
      // В лог ОБЯЗАН записаться unit-real-101
      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'unit-real-101',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('должен блокировать открытие шлагбаума и фиксировать DENIED в логе при отсутствии прав', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null); // нет подтвержденных квартир в этом ЖК

      await expect(
        service.openBarrier('unverified-user', UserRole.RESIDENT_OWNER, {
          accessPointId: 'barrier-1',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DENIED',
          }),
        }),
      );
    });
  });
});
