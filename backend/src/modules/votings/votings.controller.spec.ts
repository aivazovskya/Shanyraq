import { Test, TestingModule } from '@nestjs/testing';
import { VotingsController } from './votings.controller';
import { VotingsService } from './votings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('VotingsController (Task 0087: Tenant access security)', () => {
  let controller: VotingsController;
  let votingsServiceMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    votingsServiceMock = {
      getMeetingsByTenant: jest.fn().mockResolvedValue([
        { id: 'meeting-1', title: 'ОСС 2026', tenantId: 'tenant-1' },
      ]),
      getMeetingDetails: jest.fn(),
      createMeeting: jest.fn(),
      castVote: jest.fn(),
      closeMeetingAndGenerateProtocol: jest.fn(),
    };

    prismaMock = {
      unitOwnership: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotingsController],
      providers: [
        { provide: VotingsService, useValue: votingsServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    controller = module.get<VotingsController>(VotingsController);
  });

  describe('getMeetingsByTenant', () => {
    it('должен блокировать жителя без верифицированного владения (403 VOTINGS.RESIDENT_ACCESS_FORBIDDEN)', async () => {
      const residentWithUnverifiedClaim = {
        id: 'user-resident-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      };

      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        controller.getMeetingsByTenant('tenant-1', residentWithUnverifiedClaim),
      ).rejects.toMatchObject({
        response: {
          code: 'VOTINGS.RESIDENT_ACCESS_FORBIDDEN',
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
      expect(votingsServiceMock.getMeetingsByTenant).not.toHaveBeenCalled();
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

      const res = await controller.getMeetingsByTenant('tenant-1', residentWithVerifiedClaim);

      expect(res).toEqual([
        { id: 'meeting-1', title: 'ОСС 2026', tenantId: 'tenant-1' },
      ]);
      expect(votingsServiceMock.getMeetingsByTenant).toHaveBeenCalledWith('tenant-1');
    });

    it('должен разрешать доступ персоналу своего ЖК без запроса в unitOwnership', async () => {
      const staffUser = {
        id: 'user-dispatcher-1',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-1',
      };

      const res = await controller.getMeetingsByTenant('tenant-1', staffUser);

      expect(res).toEqual([
        { id: 'meeting-1', title: 'ОСС 2026', tenantId: 'tenant-1' },
      ]);
      expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
      expect(votingsServiceMock.getMeetingsByTenant).toHaveBeenCalledWith('tenant-1');
    });

    it('должен блокировать персонал чужого ЖК (403 VOTINGS.STAFF_CROSS_TENANT_FORBIDDEN)', async () => {
      const foreignStaff = {
        id: 'user-admin-2',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-2',
      };

      await expect(
        controller.getMeetingsByTenant('tenant-1', foreignStaff),
      ).rejects.toMatchObject({
        response: {
          code: 'VOTINGS.STAFF_CROSS_TENANT_FORBIDDEN',
        },
      });

      expect(votingsServiceMock.getMeetingsByTenant).not.toHaveBeenCalled();
    });

    it('должен разрешать доступ SUPERADMIN к любому ЖК без ограничений', async () => {
      const superAdmin = {
        id: 'super-1',
        role: UserRole.SUPERADMIN,
        tenantId: null,
      };

      const res = await controller.getMeetingsByTenant('tenant-arbitrary', superAdmin);

      expect(res).toEqual([
        { id: 'meeting-1', title: 'ОСС 2026', tenantId: 'tenant-1' },
      ]);
      expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
      expect(votingsServiceMock.getMeetingsByTenant).toHaveBeenCalledWith('tenant-arbitrary');
    });
  });
});
