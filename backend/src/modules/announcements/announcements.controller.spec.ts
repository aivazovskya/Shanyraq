import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('AnnouncementsController (Task 0087: Tenant access security)', () => {
  let controller: AnnouncementsController;
  let announcementsServiceMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    announcementsServiceMock = {
      getAnnouncements: jest.fn().mockResolvedValue([
        { id: 'ann-1', title: 'Отключение воды', tenantId: 'tenant-1' },
      ]),
      createAnnouncement: jest.fn(),
      removeAnnouncement: jest.fn(),
      exportAnnouncementsCsv: jest.fn(),
    };

    prismaMock = {
      unitOwnership: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        { provide: AnnouncementsService, useValue: announcementsServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    controller = module.get<AnnouncementsController>(AnnouncementsController);
  });

  describe('getAnnouncements', () => {
    it('должен блокировать жителя без верифицированного владения (403 ANNOUNCEMENTS.RESIDENT_ACCESS_FORBIDDEN)', async () => {
      const residentWithUnverifiedClaim = {
        id: 'user-resident-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      };

      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        controller.getAnnouncements('tenant-1', residentWithUnverifiedClaim),
      ).rejects.toMatchObject({
        response: {
          code: 'ANNOUNCEMENTS.RESIDENT_ACCESS_FORBIDDEN',
        },
      });

      expect(prismaMock.unitOwnership.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-resident-1',
          isVerified: true,
          unit: {
            building: {
              tenantId: 'tenant-1',
            },
          },
        },
      });
      expect(announcementsServiceMock.getAnnouncements).not.toHaveBeenCalled();
    });

    it('должен разрешать доступ жителю с верифицированным владением', async () => {
      const residentWithVerifiedClaim = {
        id: 'user-resident-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      };

      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        userId: 'user-resident-1',
        isVerified: true,
      });

      const res = await controller.getAnnouncements('tenant-1', residentWithVerifiedClaim);

      expect(res).toEqual([
        { id: 'ann-1', title: 'Отключение воды', tenantId: 'tenant-1' },
      ]);
      expect(announcementsServiceMock.getAnnouncements).toHaveBeenCalledWith('tenant-1', residentWithVerifiedClaim);
    });

    it('должен разрешать доступ персоналу своего ЖК без запроса в unitOwnership', async () => {
      const staffUser = {
        id: 'user-dispatcher-1',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-1',
      };

      const res = await controller.getAnnouncements('tenant-1', staffUser);

      expect(res).toEqual([
        { id: 'ann-1', title: 'Отключение воды', tenantId: 'tenant-1' },
      ]);
      expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
      expect(announcementsServiceMock.getAnnouncements).toHaveBeenCalledWith('tenant-1', staffUser);
    });

    it('должен блокировать персонал чужого ЖК (403 ANNOUNCEMENTS.STAFF_CROSS_TENANT_FORBIDDEN)', async () => {
      const foreignStaff = {
        id: 'user-admin-2',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-2',
      };

      await expect(
        controller.getAnnouncements('tenant-1', foreignStaff),
      ).rejects.toMatchObject({
        response: {
          code: 'ANNOUNCEMENTS.STAFF_CROSS_TENANT_FORBIDDEN',
        },
      });

      expect(announcementsServiceMock.getAnnouncements).not.toHaveBeenCalled();
    });

    it('должен разрешать доступ SUPERADMIN к любому ЖК без ограничений', async () => {
      const superAdmin = {
        id: 'super-1',
        role: UserRole.SUPERADMIN,
        tenantId: null,
      };

      const res = await controller.getAnnouncements('tenant-arbitrary', superAdmin);

      expect(res).toEqual([
        { id: 'ann-1', title: 'Отключение воды', tenantId: 'tenant-1' },
      ]);
      expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
      expect(announcementsServiceMock.getAnnouncements).toHaveBeenCalledWith('tenant-arbitrary', superAdmin);
    });
  });
});
