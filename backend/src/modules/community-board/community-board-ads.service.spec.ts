import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, ListingType, ListingStatus, AdPaymentStatus } from '@prisma/client';
import { CommunityBoardService } from './community-board.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('CommunityBoardService: реклама', () => {
  let service: CommunityBoardService;
  let prismaMock: any;
  let auditLogMock: any;
  let notificationsMock: any;

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
    title: 'Кофейня у дома',
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
        updateMany: jest.fn().mockImplementation(async () => ({ count: 1 })),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'owner-1' }]),
      },
    };
    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };
    notificationsMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: NotificationsService, useValue: notificationsMock },
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

    it('отклонённая реклама или реклама на модерации не расходует бесплатный пробный период (TRIAL)', async () => {
      prismaMock.communityListing.count.mockImplementation(async ({ where }: any) => {
        expect(where.status?.in).toEqual([
          ListingStatus.ACTIVE,
          ListingStatus.EXPIRED,
          ListingStatus.AWAITING_PAYMENT,
        ]);
        expect(where.status?.in).not.toContain(ListingStatus.REMOVED);
        expect(where.status?.in).not.toContain(ListingStatus.PENDING_REVIEW);
        return 0;
      });

      const res: any = await service.createListing(tenantId, resident, adDto as any);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.TRIAL);
      expect(res.adPriceKzt).toBe(0);
      expect(res.adMonths).toBe(1);
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

    it('при создании рекламы жителем отправляет уведомление модераторам ЖК (COMMUNITY_AD_PENDING, без председателя)', async () => {
      await service.createListing(tenantId, resident, adDto as any);
      expect(notificationsMock.sendToTenantRoles).toHaveBeenCalledWith(
        tenantId,
        [UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN],
        expect.objectContaining({
          title: expect.stringContaining('Новая реклама на проверку'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_PENDING',
            listingId: 'new',
            tenantId,
          }),
        }),
      );
      const recipientRoles = notificationsMock.sendToTenantRoles.mock.calls[0][1];
      expect(recipientRoles).not.toContain(UserRole.HOA_CHAIRMAN);
    });

    it('при создании рекламы персоналом уведомление персоналу не отправляется', async () => {
      await service.createListing(tenantId, dispatcher, adDto as any);
      expect(notificationsMock.sendToTenantRoles).not.toHaveBeenCalled();
    });

    it('сбой отправки уведомления персоналу не ломает создание рекламы', async () => {
      notificationsMock.sendToTenantRoles.mockRejectedValueOnce(new Error('Push gateway offline'));
      await expect(service.createListing(tenantId, resident, adDto as any)).resolves.toMatchObject({
        type: ListingType.AD,
      });
    });
  });

  describe('approveAd', () => {
    it('TRIAL сразу выходит в ленту на adTrialDays дней и уведомляет автора (COMMUNITY_AD_APPROVED)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ adPaymentStatus: AdPaymentStatus.TRIAL }),
      );
      const res: any = await service.approveAd('ad-1', dispatcher);
      expect(res.status).toBe(ListingStatus.ACTIVE);
      const days = (res.adEndsAt.getTime() - res.adStartsAt.getTime()) / 86400000;
      expect(Math.round(days)).toBe(30);

      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        resident.id,
        expect.objectContaining({
          title: expect.stringContaining('Реклама одобрена и опубликована'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_APPROVED',
            listingId: 'ad-1',
          }),
        }),
      );
    });

    it('платная реклама переходит в ожидание оплаты и уведомляет автора и суперадмина (COMMUNITY_AD_AWAITING_PAYMENT)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      const res: any = await service.approveAd('ad-1', dispatcher);
      expect(res.status).toBe(ListingStatus.AWAITING_PAYMENT);
      expect(res.adEndsAt).toBeUndefined();

      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        resident.id,
        expect.objectContaining({
          title: expect.stringContaining('Реклама одобрена, ожидает оплаты'),
          body: expect.stringContaining('6000 ₸'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_AWAITING_PAYMENT',
            listingId: 'ad-1',
            adPriceKzt: 6000,
            adMonths: 2,
          }),
        }),
      );

      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        'owner-1',
        expect.objectContaining({
          title: expect.stringContaining('Реклама ожидает подтверждения оплаты'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_AWAITING_PAYMENT',
            listingId: 'ad-1',
            tenantId,
            adPriceKzt: 6000,
            adMonths: 2,
          }),
        }),
      );
    });

    it('approve twice: повторный вызов отклоняется атомарно, уведомление отправляется ровно один раз', async () => {
      let callCount = 0;
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      prismaMock.communityListing.updateMany.mockImplementation(async () => {
        callCount++;
        return { count: callCount === 1 ? 1 : 0 };
      });

      await expect(service.approveAd('ad-1', dispatcher)).resolves.toMatchObject({
        status: ListingStatus.AWAITING_PAYMENT,
      });

      await expect(service.approveAd('ad-1', dispatcher)).rejects.toThrow(BadRequestException);

      const authorCalls = notificationsMock.sendToUser.mock.calls.filter(
        (call: any[]) => call[0] === resident.id,
      );
      expect(authorCalls).toHaveLength(1);
    });

    it('сбой отправки уведомления при approveAd не ломает операцию', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ adPaymentStatus: AdPaymentStatus.TRIAL }),
      );
      notificationsMock.sendToUser.mockRejectedValueOnce(new Error('push error'));
      await expect(service.approveAd('ad-1', dispatcher)).resolves.toMatchObject({
        status: ListingStatus.ACTIVE,
      });
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

    it('активирует рекламу на оплаченное число месяцев (по 30 дней) и уведомляет автора (COMMUNITY_AD_PAID)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ status: ListingStatus.AWAITING_PAYMENT }),
      );
      const res: any = await service.markAdPaid('ad-1', owner);
      expect(res.status).toBe(ListingStatus.ACTIVE);
      expect(res.adPaymentStatus).toBe(AdPaymentStatus.PAID);
      const days = (res.adEndsAt.getTime() - res.adStartsAt.getTime()) / 86400000;
      expect(Math.round(days)).toBe(60);
      expect(auditLogMock.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AD_PAID' }));

      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        resident.id,
        expect.objectContaining({
          title: expect.stringContaining('Оплата получена, реклама опубликована'),
          body: expect.stringMatching(/опубликована до \d{4}-\d{2}-\d{2}/),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_PAID',
            listingId: 'ad-1',
            adEndsAt: expect.any(String),
          }),
        }),
      );
    });

    it('сбой отправки уведомления при markAdPaid не ломает операцию', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ status: ListingStatus.AWAITING_PAYMENT }),
      );
      notificationsMock.sendToUser.mockRejectedValueOnce(new Error('network error'));
      await expect(service.markAdPaid('ad-1', owner)).resolves.toMatchObject({
        status: ListingStatus.ACTIVE,
      });
    });

    it('нельзя оплатить рекламу, не прошедшую проверку', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue(adRow());
      await expect(service.markAdPaid('ad-1', owner)).rejects.toThrow(BadRequestException);
    });

    it('markAdPaid twice: повторный вызов отклоняется атомарно, уведомление отправляется ровно один раз', async () => {
      let callCount = 0;
      prismaMock.communityListing.findUnique.mockResolvedValue(
        adRow({ status: ListingStatus.AWAITING_PAYMENT }),
      );
      prismaMock.communityListing.updateMany.mockImplementation(async () => {
        callCount++;
        return { count: callCount === 1 ? 1 : 0 };
      });

      await expect(service.markAdPaid('ad-1', owner)).resolves.toMatchObject({
        status: ListingStatus.ACTIVE,
      });

      await expect(service.markAdPaid('ad-1', owner)).rejects.toThrow(BadRequestException);

      const authorCalls = notificationsMock.sendToUser.mock.calls.filter(
        (call: any[]) => call[0] === resident.id,
      );
      expect(authorCalls).toHaveLength(1);
    });
  });

  describe('moderateListing (отклонение рекламы)', () => {
    it('при отклонении рекламы отправляет автору уведомление с причиной (COMMUNITY_AD_REJECTED)', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: 'ad-1',
        tenantId,
        authorId: resident.id,
        title: 'Кофейня Арба',
        type: ListingType.AD,
        status: ListingStatus.PENDING_REVIEW,
      });
      prismaMock.communityListing.update.mockResolvedValue({
        id: 'ad-1',
        status: ListingStatus.REMOVED,
        removedById: dispatcher.id,
        removedReason: 'Запрещенная деятельность',
      });

      const res = await service.moderateListing('ad-1', dispatcher, {
        reason: 'Запрещенная деятельность',
      });
      expect(res.status).toBe(ListingStatus.REMOVED);

      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        resident.id,
        expect.objectContaining({
          title: expect.stringContaining('Реклама отклонена'),
          body: expect.stringContaining('Запрещенная деятельность'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_REJECTED',
            listingId: 'ad-1',
            reason: 'Запрещенная деятельность',
          }),
        }),
      );
    });

    it('сбой отправки уведомления при отклонении рекламы не ломает операцию', async () => {
      prismaMock.communityListing.findUnique.mockResolvedValue({
        id: 'ad-1',
        tenantId,
        authorId: resident.id,
        title: 'Кофейня Арба',
        type: ListingType.AD,
        status: ListingStatus.PENDING_REVIEW,
      });
      prismaMock.communityListing.update.mockResolvedValue({
        id: 'ad-1',
        status: ListingStatus.REMOVED,
      });
      notificationsMock.sendToUser.mockRejectedValueOnce(new Error('push error'));

      await expect(
        service.moderateListing('ad-1', dispatcher, { reason: 'Отказ' }),
      ).resolves.toMatchObject({ status: ListingStatus.REMOVED });
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
