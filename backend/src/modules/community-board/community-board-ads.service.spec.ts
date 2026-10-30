import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, ListingType, ListingStatus, AdPaymentStatus } from '@prisma/client';
import { CommunityBoardService } from './community-board.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('CommunityBoardService: реклама', () => {
  let service: CommunityBoardService;
  let prismaMock: any;
  let auditLogMock: any;

  const tenantId = 'tenant-1';
  const resident = { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId };
  const dispatcher = { id: 'disp-1', role: UserRole.DISPATCHER, tenantId };
  const otherDispatcher = { id: 'disp-2', role: UserRole.DISPATCHER, tenantId: 'tenant-2' };
  const owner = { id: 'owner-1', role: UserRole.SUPERADMIN, tenantId: null };

  const adDto = {
    type: ListingType.AD,
    title: 'Кофейня у дома',
    description: 'Кофе и выпечка каждый день',
    adBusinessName: 'Кофейня Арба',
    adContactPhone: '+77011234567',
  };

  const adRow = (over: any = {}) => ({
    id: 'ad-1',
    tenantId,
    authorId: resident.id,
    type: ListingType.AD,
    status: ListingStatus.PENDING_REVIEW,
    adPaymentStatus: AdPaymentStatus.UNPAID,
    adMonths: 2,
    adPriceKzt: 6000,
    pinnedUntil: null,
    ...over,
  });

  beforeEach(async () => {
    prismaMock = {
      unitOwnership: { findFirst: jest.fn().mockResolvedValue({ id: 'own-1' }) },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          adPriceMonthly: 3000,
          adPinPriceWeekly: 2000,
          adTrialDays: 30,
        }),
        update: jest.fn(),
      },
      communityListing: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'new', ...data })),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ad-1', ...data })),
      },
    };
    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = module.get(CommunityBoardService);
  });

  describe('createListing (AD)', () => {
    it('первая реклама жителя бесплатна: TRIAL, цена 0, 1 мес., ждёт проверки', async () => {
      const res: any = await service.createListing(tenantId, resident, adDto as any);
      expect(res.status).toBe(ListingStatus.PENDING_REVIEW);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.TRIAL);
      expect(res.adPriceKzt).toBe(0);
      expect(res.adMonths).toBe(1);
    });

    it('повторная реклама платная: цена ЖК × месяцы', async () => {
      prismaMock.communityListing.count.mockResolvedValue(1);
      const res: any = await service.createListing(tenantId, resident, { ...adDto, adMonths: 3 } as any);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.UNPAID);
      expect(res.adPriceKzt).toBe(9000);
      expect(res.adMonths).toBe(3);
    });

    it('при нулевом пробном периоде ЖК бесплатного размещения нет', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ adPriceMonthly: 3000, adTrialDays: 0 });
      const res: any = await service.createListing(tenantId, resident, adDto as any);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.UNPAID);
      expect(res.adPriceKzt).toBe(3000);
    });

    it('персонал заводит рекламу без права собственности, но без пробного периода', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      const res: any = await service.createListing(tenantId, dispatcher, adDto as any);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.UNPAID);
      expect(res.authorId).toBe(dispatcher.id);
    });

    it('требует название бизнеса', async () => {
      await expect(
        service.createListing(tenantId, resident, { ...adDto, adBusinessName: '  ' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveAd', () => {
    it('TRIAL сразу выходит в ленту на adTrialDays дней', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ adPaymentStatus: AdPaymentStatus.TRIAL }),
      );
      const res: any = await service.approveAd('ad-1', dispatcher);
      expect(res.status).toBe(ListingStatus.ACTIVE);
      const days = (res.adEndsAt.getTime() - res.adStartsAt.getTime()) / 86400000;
      expect(Math.round(days)).toBe(30);
    });

    it('платная реклама переходит в ожидание оплаты, не в ленту', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      const res: any = await service.approveAd('ad-1', dispatcher);
      expect(res.status).toBe(ListingStatus.AWAITING_PAYMENT);
      expect(res.adEndsAt).toBeUndefined();
    });

    it('персонал другого ЖК и житель не могут одобрять', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      await expect(service.approveAd('ad-1', otherDispatcher)).rejects.toThrow(ForbiddenException);
      await expect(service.approveAd('ad-1', resident)).rejects.toThrow(ForbiddenException);
    });

    it('нельзя одобрить повторно', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow({ status: ListingStatus.ACTIVE }));
      await expect(service.approveAd('ad-1', dispatcher)).rejects.toThrow(BadRequestException);
    });

    it('не находит обычное объявление как рекламу', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow({ type: ListingType.SELL }));
      await expect(service.approveAd('ad-1', dispatcher)).rejects.toThrow();
    });
  });

  describe('markAdPaid', () => {
    it('только владелец сервиса', async () => {
      await expect(service.markAdPaid('ad-1', dispatcher)).rejects.toThrow(ForbiddenException);
    });

    it('активирует рекламу на оплаченное число месяцев (по 30 дней)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ status: ListingStatus.AWAITING_PAYMENT }),
      );
      const res: any = await service.markAdPaid('ad-1', owner);
      expect(res.status).toBe(ListingStatus.ACTIVE);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.PAID);
      const days = (res.adEndsAt.getTime() - res.adStartsAt.getTime()) / 86400000;
      expect(Math.round(days)).toBe(60);
      expect(auditLogMock.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AD_PAID' }));
    });

    it('нельзя оплатить рекламу, не прошедшую проверку', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      await expect(service.markAdPaid('ad-1', owner)).rejects.toThrow(BadRequestException);
    });
  });

  describe('pinAd', () => {
    it('только владелец сервиса и только опубликованная реклама', async () => {
      await expect(service.pinAd('ad-1', dispatcher, { weeks: 1 })).rejects.toThrow(ForbiddenException);
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      await expect(service.pinAd('ad-1', owner, { weeks: 1 })).rejects.toThrow(BadRequestException);
    });

    it('закрепляет на N недель, повторное закрепление продлевает', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow({ status: ListingStatus.ACTIVE }));
      const first: any = await service.pinAd('ad-1', owner, { weeks: 2 });
      expect(Math.round((first.pinnedUntil.getTime() - Date.now()) / 86400000)).toBe(14);

      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ status: ListingStatus.ACTIVE, pinnedUntil: first.pinnedUntil }),
      );
      const second: any = await service.pinAd('ad-1', owner, { weeks: 1 });
      expect(Math.round((second.pinnedUntil.getTime() - Date.now()) / 86400000)).toBe(21);
    });
  });

  describe('ценообразование', () => {
    it('setAdPricing только для владельца сервиса', async () => {
      await expect(service.setAdPricing(tenantId, dispatcher, { adPriceMonthly: 1 })).rejects.toThrow(
        ForbiddenException,
      );
      await service.setAdPricing(tenantId, owner, { adPriceMonthly: 5000 });
      expect(prismaMock.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { adPriceMonthly: 5000 } }),
      );
    });

    it('getAdPricing доступен жителю своего ЖК', async () => {
      const res = await service.getAdPricing(tenantId, resident);
      expect(res.adPriceMonthly).toBe(3000);
    });
  });

  describe('getListings (лента)', () => {
    it('жителю скрывает рекламу с истёкшим сроком', async () => {
      await service.getListings(tenantId, resident, {} as any);
      const where = prismaMock.communityListing.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(ListingStatus.ACTIVE);
      expect(where.OR).toEqual([{ adEndsAt: null }, { adEndsAt: { gt: expect.any(Date) } }]);
    });

    it('закреплённая реклама идёт первой, истёкшее закрепление не считается', async () => {
      const author = { id: 'a', firstName: 'a', lastName: 'a', phone: '1', role: 'RESIDENT_OWNER', hidePhoneInListings: false };
      const future = new Date(Date.now() + 86400000);
      const past = new Date(Date.now() - 86400000);
      prismaMock.communityListing.findMany.mockResolvedValue([
        { id: 'plain', authorId: 'a', pinnedUntil: null, author },
        { id: 'expired-pin', authorId: 'a', pinnedUntil: past, author },
        { id: 'pinned', authorId: 'a', pinnedUntil: future, author },
      ]);
      const res = await service.getListings(tenantId, resident, {} as any);
      expect(res.map((l: any) => l.id)).toEqual(['pinned', 'plain', 'expired-pin']);
    });
  });
});
