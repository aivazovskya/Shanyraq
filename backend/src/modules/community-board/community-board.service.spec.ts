import { Test, TestingModule } from '@nestjs/testing';
import { CommunityBoardService } from './community-board.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, ListingType, ListingStatus } from '@prisma/client';

describe('CommunityBoardService', () => {
  let service: CommunityBoardService;
  let prismaMock: any;

  const mockTenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';
  const mockListingId = 'listing-123';

  const verifiedResidentOwner = {
    id: 'user-resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Айбек',
    lastName: 'Нурланов',
    phone: '+77015550101',
    isVerified: true,
  };

  const verifiedResidentTenant = {
    id: 'user-resident-2',
    role: UserRole.RESIDENT_TENANT,
    tenantId: mockTenantId,
    firstName: 'Динара',
    lastName: 'Серикова',
    phone: '+77017778899',
    isVerified: true,
  };

  const unverifiedResident = {
    id: 'user-resident-3',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Берик',
    lastName: 'Неверифицированный',
    phone: '+77011112233',
    isVerified: false,
  };

  const otherTenantResident = {
    id: 'user-resident-other',
    role: UserRole.RESIDENT_OWNER,
    tenantId: otherTenantId,
    firstName: 'Серик',
    lastName: 'Чужой',
    phone: '+77014445566',
    isVerified: true,
  };

  const dispatcherUser = {
    id: 'dispatcher-1',
    role: UserRole.DISPATCHER,
    tenantId: mockTenantId,
    firstName: 'Гульнара',
    lastName: 'Диспетчерова',
  };

  const otherTenantDispatcher = {
    id: 'dispatcher-2',
    role: UserRole.DISPATCHER,
    tenantId: otherTenantId,
    firstName: 'Кайрат',
    lastName: 'ЧужойДиспетчер',
  };

  const hoaAdminUser = {
    id: 'hoa-admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
    firstName: 'Ерлан',
    lastName: 'Управляющий',
  };

  const superAdminUser = {
    id: 'super-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
    firstName: 'Админ',
    lastName: 'Главный',
  };

  beforeEach(async () => {
    prismaMock = {
      unitOwnership: {
        findFirst: jest.fn(),
      },
      communityListing: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CommunityBoardService>(CommunityBoardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createListing', () => {
    it('allows verified resident owner to post a listing', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        isVerified: true,
        userId: verifiedResidentOwner.id,
      });

      prismaMock.communityListing.create.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        authorId: verifiedResidentOwner.id,
        type: ListingType.SELL,
        title: 'Продам велосипед',
        description: 'Отличное состояние, 21 скорость',
        price: 45000,
        photoUrls: ['http://minio/photo1.jpg'],
        status: ListingStatus.ACTIVE,
      });

      const result = await service.createListing(mockTenantId, verifiedResidentOwner, {
        type: ListingType.SELL,
        title: 'Продам велосипед',
        description: 'Отличное состояние, 21 скорость',
        price: 45000,
        photoUrls: ['http://minio/photo1.jpg'],
      });

      expect(result.id).toBe(mockListingId);
      expect(prismaMock.communityListing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            authorId: verifiedResidentOwner.id,
            price: 45000,
            status: ListingStatus.ACTIVE,
          }),
        }),
      );
    });

    it('allows verified resident tenant to post a listing', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-2',
        isVerified: true,
        userId: verifiedResidentTenant.id,
      });

      prismaMock.communityListing.create.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        authorId: verifiedResidentTenant.id,
        type: ListingType.RENT,
        title: 'Сдам парковочное место',
        description: 'Удобный заезд, рядом с лифтом',
        price: 25000,
        status: ListingStatus.ACTIVE,
      });

      const result = await service.createListing(mockTenantId, verifiedResidentTenant, {
        type: ListingType.RENT,
        title: 'Сдам парковочное место',
        description: 'Удобный заезд, рядом с лифтом',
        price: 25000,
      });

      expect(result.id).toBe(mockListingId);
    });

    it('rejects unverified resident from posting (ForbiddenException)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createListing(mockTenantId, unverifiedResident, {
          type: ListingType.SELL,
          title: 'Продам диван',
          description: 'Кожаный диван в хорошем состоянии',
          price: 50000,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.communityListing.create).not.toHaveBeenCalled();
    });

    it('rejects resident of another tenant from posting (ForbiddenException)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createListing(mockTenantId, otherTenantResident, {
          type: ListingType.SELL,
          title: 'Продам стол',
          description: 'Письменный стол',
          price: 15000,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.communityListing.create).not.toHaveBeenCalled();
    });

    it('rejects GIVE_AWAY listing if price is specified (>0)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        isVerified: true,
        userId: verifiedResidentOwner.id,
      });

      await expect(
        service.createListing(mockTenantId, verifiedResidentOwner, {
          type: ListingType.GIVE_AWAY,
          title: 'Отдам книги даром',
          description: 'Художественная литература',
          price: 500,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets price to null for GIVE_AWAY listing', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        isVerified: true,
        userId: verifiedResidentOwner.id,
      });

      prismaMock.communityListing.create.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        type: ListingType.GIVE_AWAY,
        price: null,
      });

      await service.createListing(mockTenantId, verifiedResidentOwner, {
        type: ListingType.GIVE_AWAY,
        title: 'Отдам книги даром',
        description: 'Художественная литература',
      });

      expect(prismaMock.communityListing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            price: null,
          }),
        }),
      );
    });
  });

  describe('getListings', () => {
    it('forces status filter to ACTIVE for non-staff callers even if query asks for REMOVED', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        isVerified: true,
        userId: verifiedResidentOwner.id,
      });

      prismaMock.communityListing.findMany.mockResolvedValue([]);

      await service.getListings(mockTenantId, verifiedResidentOwner, {
        status: ListingStatus.REMOVED,
        type: ListingType.SELL,
      });

      expect(prismaMock.communityListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: mockTenantId,
            status: ListingStatus.ACTIVE,
            type: ListingType.SELL,
          },
        }),
      );
    });

    it('allows staff to filter by any status or view all', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([]);

      await service.getListings(mockTenantId, dispatcherUser, {
        status: ListingStatus.REMOVED,
      });

      expect(prismaMock.communityListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: mockTenantId,
            status: ListingStatus.REMOVED,
          },
        }),
      );
    });

    it('rejects resident of another tenant from viewing listings (ForbiddenException)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.getListings(mockTenantId, otherTenantResident, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects staff from another tenant from viewing listings (ForbiddenException)', async () => {
      await expect(
        service.getListings(mockTenantId, otherTenantDispatcher, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateListing', () => {
    it('allows author to edit their own listing', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        authorId: verifiedResidentOwner.id,
        tenantId: mockTenantId,
        type: ListingType.SELL,
        status: ListingStatus.ACTIVE,
      });

      prismaMock.communityListing.update.mockResolvedValue({
        id: mockListingId,
        title: 'Новый заголовок',
        status: ListingStatus.ACTIVE,
      });

      const result = await service.updateListing(mockListingId, verifiedResidentOwner, {
        title: 'Новый заголовок',
      });

      expect(result.id).toBe(mockListingId);
      expect(prismaMock.communityListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockListingId },
          data: expect.objectContaining({ title: 'Новый заголовок' }),
        }),
      );
    });

    it('allows author to close their own listing (status: CLOSED)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        authorId: verifiedResidentOwner.id,
        tenantId: mockTenantId,
        type: ListingType.SELL,
        status: ListingStatus.ACTIVE,
      });

      prismaMock.communityListing.update.mockResolvedValue({
        id: mockListingId,
        status: ListingStatus.CLOSED,
      });

      const result = await service.updateListing(mockListingId, verifiedResidentOwner, {
        status: ListingStatus.CLOSED,
      });

      expect(result.status).toBe(ListingStatus.CLOSED);
    });

    it('rejects a different resident from editing someone else listing (ForbiddenException)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        authorId: verifiedResidentOwner.id,
        tenantId: mockTenantId,
        status: ListingStatus.ACTIVE,
      });

      await expect(
        service.updateListing(mockListingId, verifiedResidentTenant, {
          title: 'Попытка взлома',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects editing an already REMOVED listing', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        authorId: verifiedResidentOwner.id,
        tenantId: mockTenantId,
        status: ListingStatus.REMOVED,
      });

      await expect(
        service.updateListing(mockListingId, verifiedResidentOwner, {
          title: 'Попытка обновить снятое',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('moderateListing', () => {
    it('allows DISPATCHER to moderate (REMOVE) a listing with a reason in their tenant', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        status: ListingStatus.ACTIVE,
      });

      prismaMock.communityListing.update.mockResolvedValue({
        id: mockListingId,
        status: ListingStatus.REMOVED,
        removedById: dispatcherUser.id,
        removedReason: 'Спам / реклама',
      });

      const result = await service.moderateListing(mockListingId, dispatcherUser, {
        reason: 'Спам / реклама',
      });

      expect(result.status).toBe(ListingStatus.REMOVED);
      expect(prismaMock.communityListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockListingId },
          data: {
            status: ListingStatus.REMOVED,
            removedById: dispatcherUser.id,
            removedReason: 'Спам / реклама',
          },
        }),
      );
    });

    it('allows HOA_ADMIN to moderate a listing in their tenant', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        status: ListingStatus.ACTIVE,
      });

      prismaMock.communityListing.update.mockResolvedValue({
        id: mockListingId,
        status: ListingStatus.REMOVED,
        removedById: hoaAdminUser.id,
        removedReason: 'Запрещенный контент',
      });

      const result = await service.moderateListing(mockListingId, hoaAdminUser, {
        reason: 'Запрещенный контент',
      });

      expect(result.status).toBe(ListingStatus.REMOVED);
    });

    it('rejects staff from another tenant from moderating (ForbiddenException)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        status: ListingStatus.ACTIVE,
      });

      await expect(
        service.moderateListing(mockListingId, otherTenantDispatcher, {
          reason: 'Снять чужое',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects resident from moderating (ForbiddenException)', async () => {
      await expect(
        service.moderateListing(mockListingId, verifiedResidentOwner, {
          reason: 'Не нравится',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects moderating an already REMOVED listing twice (BadRequestException)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        status: ListingStatus.REMOVED,
        removedReason: 'Уже удалено',
      });

      await expect(
        service.moderateListing(mockListingId, dispatcherUser, {
          reason: 'Повторное удаление',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects moderation without a reason (BadRequestException)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        tenantId: mockTenantId,
        status: ListingStatus.ACTIVE,
      });

      await expect(
        service.moderateListing(mockListingId, dispatcherUser, {
          reason: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyListings', () => {
    it('returns author own listings of all statuses', async () => {
      const mockUserListings = [
        { id: '1', title: 'Активное', status: ListingStatus.ACTIVE },
        { id: '2', title: 'Закрытое', status: ListingStatus.CLOSED },
        { id: '3', title: 'Снятое', status: ListingStatus.REMOVED },
      ];

      prismaMock.communityListing.findMany.mockResolvedValue(mockUserListings);

      const result = await service.getMyListings(verifiedResidentOwner);
      expect(result.length).toBe(3);
      expect(prismaMock.communityListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: verifiedResidentOwner.id },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
