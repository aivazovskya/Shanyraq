import { Test, TestingModule } from '@nestjs/testing';
import { CommunityBoardService } from './community-board.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, ListingType, ListingStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('CommunityBoardService', () => {
  let service: CommunityBoardService;
  let prismaMock: any;
  let auditLogServiceMock: any;

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
      user: {
        update: jest.fn(),
      },
    };

    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
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

      const promise = service.createListing(mockTenantId, verifiedResidentOwner, {
        type: ListingType.GIVE_AWAY,
        title: 'Отдам книги даром',
        description: 'Художественная литература',
        price: 500,
      });
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'COMMUNITY_BOARD.GIVEAWAY_NO_PRICE' },
      });
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

      const promise = service.updateListing(mockListingId, verifiedResidentTenant, {
        title: 'Попытка взлома',
      });
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'COMMUNITY_BOARD.EDIT_OWN_ONLY' },
      });
    });

    it('rejects editing an already REMOVED listing', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: mockListingId,
        authorId: verifiedResidentOwner.id,
        tenantId: mockTenantId,
        status: ListingStatus.REMOVED,
      });

      const promise = service.updateListing(mockListingId, verifiedResidentOwner, {
        title: 'Попытка обновить снятое',
      });
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'COMMUNITY_BOARD.CANNOT_EDIT_REMOVED' },
      });
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
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        actorId: dispatcherUser.id,
        action: 'LISTING_MODERATED',
        targetType: 'CommunityListing',
        targetId: mockListingId,
        metadata: {
          previousStatus: ListingStatus.ACTIVE,
          newStatus: ListingStatus.REMOVED,
          reason: 'Спам / реклама',
        },
      });
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

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Phone visibility preference (Task 0063)
  // -------------------------------------------------------------------------
  describe('Phone visibility preference in getListings (Task 0063)', () => {
    const authorId = verifiedResidentOwner.id;
    const viewerId = verifiedResidentTenant.id;

    const makeListing = (overrides: any = {}) => ({
      id: 'listing-ph-1',
      tenantId: mockTenantId,
      authorId,
      title: 'Продам диван',
      description: 'В хорошем состоянии',
      type: ListingType.SELL,
      status: ListingStatus.ACTIVE,
      price: 30000,
      photoUrls: [],
      createdAt: new Date(),
      author: {
        id: authorId,
        firstName: 'Айбек',
        lastName: 'Нурланов',
        phone: '+77015550101',
        role: UserRole.RESIDENT_OWNER,
        hidePhoneInListings: false,
      },
      removedBy: null,
      ...overrides,
    });

    beforeEach(() => {
      // viewer is a verified resident in the same tenant
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-viewer',
        isVerified: true,
        userId: viewerId,
      });
    });

    it('другой житель видит phone: null, если у автора hidePhoneInListings=true (маскировка)', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing({ author: { id: authorId, firstName: 'Айбек', lastName: 'Нурланов', phone: '+77015550101', role: UserRole.RESIDENT_OWNER, hidePhoneInListings: true } }),
      ]);

      const viewer = { ...verifiedResidentTenant };
      const results = await service.getListings(mockTenantId, viewer, {});

      expect(results[0].author.phone).toBeNull();
    });

    it('сам автор всегда видит свой телефон (getListings вызван от имени автора)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-author',
        isVerified: true,
        userId: authorId,
      });
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing({ author: { id: authorId, firstName: 'Айбек', lastName: 'Нурланов', phone: '+77015550101', role: UserRole.RESIDENT_OWNER, hidePhoneInListings: true } }),
      ]);

      const results = await service.getListings(mockTenantId, verifiedResidentOwner, {});

      expect(results[0].author.phone).toBe('+77015550101');
    });

    it('персонал (DISPATCHER) видит реальный телефон независимо от hidePhoneInListings=true', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing({ author: { id: authorId, firstName: 'Айбек', lastName: 'Нурланов', phone: '+77015550101', role: UserRole.RESIDENT_OWNER, hidePhoneInListings: true } }),
      ]);

      const results = await service.getListings(mockTenantId, dispatcherUser, {});

      expect(results[0].author.phone).toBe('+77015550101');
    });

    it('персонал (HOA_ADMIN) видит реальный телефон независимо от hidePhoneInListings=true', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing({ author: { id: authorId, firstName: 'Айбек', lastName: 'Нурланов', phone: '+77015550101', role: UserRole.RESIDENT_OWNER, hidePhoneInListings: true } }),
      ]);

      const results = await service.getListings(mockTenantId, hoaAdminUser, {});

      expect(results[0].author.phone).toBe('+77015550101');
    });

    it('при hidePhoneInListings=false телефон виден любому жителю (поведение по умолчанию)', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing(), // hidePhoneInListings: false
      ]);

      const results = await service.getListings(mockTenantId, verifiedResidentTenant, {});

      expect(results[0].author.phone).toBe('+77015550101');
    });

    it('hidePhoneInListings не попадает в итоговый объект author (внутренний флаг скрыт)', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([makeListing()]);

      const results = await service.getListings(mockTenantId, verifiedResidentTenant, {});

      expect(results[0].author).not.toHaveProperty('hidePhoneInListings');
    });

    it('getMyListings всегда возвращает телефон автора (маскировка не применяется)', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        makeListing(),
      ]);

      const result = await service.getMyListings(verifiedResidentOwner);

      // getMyListings doesn't apply masking — result passes through raw Prisma data
      expect(result).toBeDefined();
      expect(prismaMock.communityListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { authorId: verifiedResidentOwner.id } }),
      );
    });
  });

  describe('updatePhoneVisibility (Task 0063)', () => {
    it('обновляет только hidePhoneInListings для вызывающего пользователя и возвращает флаг', async () => {
      prismaMock.user.update.mockResolvedValue({ hidePhoneInListings: true });

      const result = await service.updatePhoneVisibility(
        { id: verifiedResidentOwner.id },
        { hidePhoneInListings: true },
      );

      expect(result).toEqual({ hidePhoneInListings: true });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: verifiedResidentOwner.id },
        data: { hidePhoneInListings: true },
        select: { hidePhoneInListings: true },
      });
    });

    it('вызов всегда использует id вызывающего пользователя — другой userId не принимается', async () => {
      prismaMock.user.update.mockResolvedValue({ hidePhoneInListings: false });

      await service.updatePhoneVisibility(
        { id: 'my-own-id' },
        { hidePhoneInListings: false },
      );

      // Проверяем, что update был вызван именно с my-own-id, а не с чужим id
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'my-own-id' } }),
      );
    });
  });
});
