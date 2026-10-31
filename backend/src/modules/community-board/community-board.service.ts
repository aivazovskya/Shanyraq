import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ListingType, ListingStatus, AdPaymentStatus } from '@prisma/client';
import {
  CreateListingDto,
  UpdateListingDto,
  ModerateListingDto,
  GetListingsQueryDto,
  UpdatePhoneVisibilityDto,
  SetAdPricingDto,
  PinAdDto,
} from './dto/community-board.dto';
import { assertAccessToTenant, TenantAccessErrorCodes } from '../../common/guards/tenant.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const AD_MONTH_DAYS = 30;
const STAFF_ROLES: UserRole[] = [UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN];

@Injectable()
export class CommunityBoardService {
  private readonly logger = new Logger(CommunityBoardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private static readonly COMMUNITY_BOARD_ACCESS_ERRORS: TenantAccessErrorCodes = {
    authRequired: {
      code: 'COMMUNITY_BOARD.AUTH_REQUIRED',
      message: 'Требуется авторизация',
    },
    staffForbidden: {
      code: 'COMMUNITY_BOARD.STAFF_CROSS_TENANT_FORBIDDEN',
      message: 'Персонал имеет доступ только к ресурсам своего жилого комплекса',
    },
    residentForbidden: {
      code: 'COMMUNITY_BOARD.RESIDENT_ACCESS_FORBIDDEN',
      message:
        'У вас нет подтвержденного доступа к доске объявлений данного жилого комплекса',
    },
  };

  /**
   * Проверка доступа пользователя к ресурсам/доске тенанта.
   * Делегирует единому хелперу assertAccessToTenant.
   */
  async assertAccessToTenant(user: any, tenantId: string): Promise<boolean> {
    return assertAccessToTenant(
      this.prisma,
      user,
      tenantId,
      CommunityBoardService.COMMUNITY_BOARD_ACCESS_ERRORS,
    );
  }

  /**
   * Получение списка объявлений ЖК.
   * - Для не-персонала (жителей) принудительно возвращаются ТОЛЬКО ACTIVE объявления.
   * - Для персонала доступна фильтрация по всем статусам (ACTIVE, CLOSED, REMOVED).
   */
  async getListings(tenantId: string, user: any, query: GetListingsQueryDto) {
    const isStaff = await this.assertAccessToTenant(user, tenantId);

    const whereClause: any = { tenantId };

    if (!isStaff) {
      // Обычные жители никогда не видят снятые модератором или закрытые объявления в общей ленте
      whereClause.status = ListingStatus.ACTIVE;
      // Реклама пропадает ровно в момент окончания оплаченного срока, не дожидаясь ночного крона
      whereClause.OR = [{ adEndsAt: null }, { adEndsAt: { gt: new Date() } }];
    } else if (query.status) {
      whereClause.status = query.status;
    }

    if (query.type) {
      whereClause.type = query.type;
    }

    const listings = await this.prisma.communityListing.findMany({
      where: whereClause,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            hidePhoneInListings: true,
          },
        },
        removedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const isPinned = (l: { pinnedUntil: Date | null }) =>
      l.pinnedUntil != null && l.pinnedUntil.getTime() > now;
    // Закреплённая реклама сверху, остальное по дате (порядок БД сохраняется)
    const ordered = [...listings].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));

    return ordered.map((listing) => {
      const { hidePhoneInListings, ...authorPublic } = listing.author;
      const shouldMask =
        !isStaff &&
        listing.authorId !== user.id &&
        hidePhoneInListings;
      return {
        ...listing,
        author: {
          ...authorPublic,
          phone: shouldMask ? null : authorPublic.phone,
        },
      };
    });
  }

  /**
   * Публикация нового объявления в ЖК.
   * Требует подтвержденного проживания/владения в данном ЖК (ветка жителя).
   */
  async createListing(tenantId: string, user: any, dto: CreateListingDto) {
    const isStaff = await this.assertAccessToTenant(user, tenantId);

    const isAd = dto.type === ListingType.AD;
    const isStaffRole = STAFF_ROLES.includes(user.role);

    // Персонал без подтвержденного владения не может публиковать объявления жильцов.
    // Исключение: реклама, которую персонал заводит от имени бизнеса ЖК.
    if (isStaff && user.role !== UserRole.SUPERADMIN && !isAd) {
      const hasVerifiedOwnership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId: user.id,
          isVerified: true,
          unit: {
            building: {
              tenantId,
            },
          },
        },
      });
      if (!hasVerifiedOwnership) {
        throw new ForbiddenException({
          code: 'COMMUNITY_BOARD.PUBLISH_VERIFIED_RESIDENTS_ONLY',
          message:
            'Публикация объявлений доступна только верифицированным жителям данного ЖК',
        });
      }
    }

    if (isAd) {
      return this.createAd(tenantId, user, dto, isStaffRole);
    }

    // Валидация цены: для "Отдам даром" цена не должна указываться
    if (dto.type === ListingType.GIVE_AWAY && dto.price != null && dto.price > 0) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.GIVEAWAY_NO_PRICE',
        message: 'Для категории "Отдам даром" указание цены недопустимо',
      });
    }

    const price = dto.type === ListingType.GIVE_AWAY ? null : (dto.price ?? null);

    return this.prisma.communityListing.create({
      data: {
        tenantId,
        authorId: user.id,
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description.trim(),
        price,
        photoUrls: dto.photoUrls || [],
        status: ListingStatus.ACTIVE,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Редактирование объявления автором (или закрытие).
   */
  async updateListing(id: string, user: any, dto: UpdateListingDto) {
    const listing = await this.prisma.communityListing.findUnique({
      where: { id },
    });

    if (!listing) {
      throw new NotFoundException({
        code: 'COMMUNITY_BOARD.LISTING_NOT_FOUND',
        message: 'Объявление не найдено',
      });
    }

    if (listing.authorId !== user.id && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.EDIT_OWN_ONLY',
        message: 'Вы можете редактировать только свои объявления',
      });
    }

    if (listing.status === ListingStatus.REMOVED) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.CANNOT_EDIT_REMOVED',
        message: 'Нельзя редактировать объявление, снятое модератором',
      });
    }

    if (dto.status === ListingStatus.REMOVED) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.CANNOT_SELF_ASSIGN_REMOVED_STATUS',
        message: 'Автор не может присвоить статус снятого модератором',
      });
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description.trim();
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.photoUrls !== undefined) updateData.photoUrls = dto.photoUrls;

    if (dto.price !== undefined) {
      if (listing.type === ListingType.GIVE_AWAY && dto.price != null && dto.price > 0) {
        throw new BadRequestException({
          code: 'COMMUNITY_BOARD.GIVEAWAY_NO_PRICE',
          message: 'Для категории "Отдам даром" указание цены недопустимо',
        });
      }
      updateData.price = listing.type === ListingType.GIVE_AWAY ? null : dto.price;
    }

    return this.prisma.communityListing.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
        removedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Модерация объявления персоналом (DISPATCHER, HOA_ADMIN, SUPERADMIN).
   */
  async moderateListing(id: string, user: any, dto: ModerateListingDto) {
    const allowedRoles = [UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.MODERATE_FORBIDDEN',
        message: 'Недостаточно прав для модерации объявлений',
      });
    }

    const listing = await this.prisma.communityListing.findUnique({
      where: { id },
    });

    if (!listing) {
      throw new NotFoundException({
        code: 'COMMUNITY_BOARD.LISTING_NOT_FOUND',
        message: 'Объявление не найдено',
      });
    }

    if (user.role !== UserRole.SUPERADMIN && user.tenantId !== listing.tenantId) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.MODERATE_CROSS_TENANT_FORBIDDEN',
        message: 'Вы можете модерировать объявления только своего жилого комплекса',
      });
    }

    if (listing.status === ListingStatus.REMOVED) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.ALREADY_REMOVED',
        message: 'Объявление уже снято с публикации модератором',
      });
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.REMOVAL_REASON_REQUIRED',
        message: 'Причина удаления обязательна для заполнения',
      });
    }

    const updated = await this.prisma.communityListing.update({
      where: { id },
      data: {
        status: ListingStatus.REMOVED,
        removedById: user.id,
        removedReason: dto.reason.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
        removedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (listing.type === ListingType.AD && listing.authorId) {
      try {
        await this.notificationsService.sendToUser(listing.authorId, {
          title: '❌ Реклама отклонена',
          body: `Реклама "${listing.title}" отклонена модератором. Причина: ${dto.reason.trim()}`,
          data: {
            type: 'COMMUNITY_AD_REJECTED',
            listingId: id,
            reason: dto.reason.trim(),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send ad rejection notification for ad ${id}: ${err.message}`);
      }
    }

    await this.auditLogService.log({
      tenantId: listing.tenantId,
      actorId: user.id,
      action: 'LISTING_MODERATED',
      targetType: 'CommunityListing',
      targetId: id,
      metadata: {
        previousStatus: listing.status,
        newStatus: ListingStatus.REMOVED,
        reason: dto.reason.trim(),
      },
    });

    return updated;
  }

  /**
   * Заявка на рекламу. Первое размещение жителя бесплатно (TRIAL),
   * дальше цена берётся из настроек ЖК. Публикуется только после проверки.
   */
  private async createAd(tenantId: string, user: any, dto: CreateListingDto, isStaffRole: boolean) {
    if (!dto.adBusinessName?.trim()) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.AD_BUSINESS_NAME_REQUIRED',
        message: 'Для рекламы укажите название бизнеса',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { adPriceMonthly: true, adTrialDays: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'COMMUNITY_BOARD.TENANT_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    // Бесплатный пробный период только жителю и только на первую рекламу
    let isTrial = false;
    if (!isStaffRole && tenant.adTrialDays > 0) {
      const previousAds = await this.prisma.communityListing.count({
        where: { authorId: user.id, type: ListingType.AD },
      });
      isTrial = previousAds === 0;
    }

    const months = isTrial ? 1 : (dto.adMonths ?? 1);

    const created = await this.prisma.communityListing.create({
      data: {
        tenantId,
        authorId: user.id,
        type: ListingType.AD,
        title: dto.title.trim(),
        description: dto.description.trim(),
        price: null,
        photoUrls: dto.photoUrls || [],
        status: ListingStatus.PENDING_REVIEW,
        adBusinessName: dto.adBusinessName.trim(),
        adContactPhone: dto.adContactPhone?.trim() || null,
        adPaymentStatus: isTrial ? AdPaymentStatus.TRIAL : AdPaymentStatus.UNPAID,
        adMonths: months,
        adPriceKzt: isTrial ? 0 : tenant.adPriceMonthly * months,
      },
      include: CommunityBoardService.AD_INCLUDE,
    });

    // При создании рекламы жителем оповещаем персонал ЖК о новой заявке на проверку
    if (!isStaffRole) {
      try {
        await this.notificationsService.sendToTenantRoles(
          tenantId,
          [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER],
          {
            title: '📢 Новая реклама на проверку',
            body: `Подана новая реклама на проверку: "${created.title}" (${created.adBusinessName || ''}).`,
            data: {
              type: 'COMMUNITY_AD_PENDING',
              listingId: created.id,
              tenantId,
            },
          },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to send ad pending notification to staff: ${err.message}`);
      }
    }

    return created;
  }

  private static readonly AD_INCLUDE = {
    author: {
      select: { id: true, firstName: true, lastName: true, phone: true, role: true },
    },
  };

  private assertStaffOfListing(user: any, listing: { tenantId: string }) {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.MODERATE_FORBIDDEN',
        message: 'Недостаточно прав для модерации объявлений',
      });
    }
    if (user.role !== UserRole.SUPERADMIN && user.tenantId !== listing.tenantId) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.MODERATE_CROSS_TENANT_FORBIDDEN',
        message: 'Вы можете модерировать объявления только своего жилого комплекса',
      });
    }
  }

  private async getAdOrThrow(id: string) {
    const listing = await this.prisma.communityListing.findUnique({ where: { id } });
    if (!listing || listing.type !== ListingType.AD) {
      throw new NotFoundException({
        code: 'COMMUNITY_BOARD.AD_NOT_FOUND',
        message: 'Рекламное объявление не найдено',
      });
    }
    return listing;
  }

  /**
   * Проверка рекламы персоналом ЖК. Бесплатная (TRIAL) сразу выходит в ленту,
   * платная ждёт оплаты.
   */
  async approveAd(id: string, user: any) {
    const listing = await this.getAdOrThrow(id);
    this.assertStaffOfListing(user, listing);

    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.AD_NOT_PENDING_REVIEW',
        message: 'Реклама уже обработана или не ожидает проверки',
      });
    }

    let updated;
    if (listing.adPaymentStatus === AdPaymentStatus.TRIAL) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: listing.tenantId },
        select: { adTrialDays: true },
      });
      const now = new Date();
      updated = await this.prisma.communityListing.update({
        where: { id },
        data: {
          status: ListingStatus.ACTIVE,
          adStartsAt: now,
          adEndsAt: new Date(now.getTime() + (tenant?.adTrialDays ?? 30) * DAY_MS),
        },
        include: CommunityBoardService.AD_INCLUDE,
      });

      try {
        await this.notificationsService.sendToUser(listing.authorId, {
          title: '✅ Реклама одобрена и опубликована',
          body: `Ваша реклама "${listing.title}" одобрена и опубликована.`,
          data: {
            type: 'COMMUNITY_AD_APPROVED',
            listingId: id,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send ad approval notification for ad ${id}: ${err.message}`);
      }
    } else {
      updated = await this.prisma.communityListing.update({
        where: { id },
        data: { status: ListingStatus.AWAITING_PAYMENT },
        include: CommunityBoardService.AD_INCLUDE,
      });

      const priceText = listing.adPriceKzt ? `${listing.adPriceKzt} ₸` : '';
      const monthsText = listing.adMonths ? `${listing.adMonths} мес.` : '';
      const detailParts = [priceText, monthsText].filter(Boolean).join(', ');
      try {
        await this.notificationsService.sendToUser(listing.authorId, {
          title: '💳 Реклама одобрена, ожидает оплаты',
          body: `Реклама "${listing.title}" одобрена и ожидает оплаты${detailParts ? `: ${detailParts}` : ''}. После оплаты она появится на доске.`,
          data: {
            type: 'COMMUNITY_AD_AWAITING_PAYMENT',
            listingId: id,
            adPriceKzt: listing.adPriceKzt,
            adMonths: listing.adMonths,
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to send ad awaiting payment notification for ad ${id}: ${err.message}`,
        );
      }
    }

    await this.auditLogService.log({
      tenantId: listing.tenantId,
      actorId: user.id,
      action: 'AD_APPROVED',
      targetType: 'CommunityListing',
      targetId: id,
      metadata: { newStatus: updated.status, paymentStatus: listing.adPaymentStatus },
    });
    return updated;
  }

  /**
   * Подтверждение оплаты рекламы. Деньги получает платформа, поэтому
   * только владелец сервиса.
   */
  async markAdPaid(id: string, user: any) {
    if (user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.AD_PAYMENT_SUPERADMIN_ONLY',
        message: 'Оплату рекламы подтверждает только владелец сервиса',
      });
    }
    const listing = await this.getAdOrThrow(id);

    if (listing.status !== ListingStatus.AWAITING_PAYMENT) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.AD_NOT_AWAITING_PAYMENT',
        message: 'Реклама не ожидает оплаты: сначала она должна пройти проверку',
      });
    }

    const now = new Date();
    const months = listing.adMonths ?? 1;
    const adEndsAt = new Date(now.getTime() + months * AD_MONTH_DAYS * DAY_MS);
    const updated = await this.prisma.communityListing.update({
      where: { id },
      data: {
        status: ListingStatus.ACTIVE,
        adPaymentStatus: AdPaymentStatus.PAID,
        adStartsAt: now,
        adEndsAt,
      },
      include: CommunityBoardService.AD_INCLUDE,
    });

    const dateStr = adEndsAt.toISOString().slice(0, 10);
    try {
      await this.notificationsService.sendToUser(listing.authorId, {
        title: '✅ Оплата получена, реклама опубликована',
        body: `Оплата получена, реклама "${listing.title}" опубликована до ${dateStr}.`,
        data: {
          type: 'COMMUNITY_AD_PAID',
          listingId: id,
          adEndsAt: adEndsAt.toISOString(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to send ad paid notification for ad ${id}: ${err.message}`);
    }

    await this.auditLogService.log({
      tenantId: listing.tenantId,
      actorId: user.id,
      action: 'AD_PAID',
      targetType: 'CommunityListing',
      targetId: id,
      metadata: { months, priceKzt: listing.adPriceKzt },
    });
    return updated;
  }

  /**
   * Закрепление рекламы наверху ленты (платная опция, как и оплата: владелец сервиса).
   */
  async pinAd(id: string, user: any, dto: PinAdDto) {
    if (user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.AD_PIN_SUPERADMIN_ONLY',
        message: 'Закрепление рекламы подтверждает только владелец сервиса',
      });
    }
    const listing = await this.getAdOrThrow(id);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'COMMUNITY_BOARD.AD_NOT_ACTIVE',
        message: 'Закрепить можно только опубликованную рекламу',
      });
    }

    const base =
      listing.pinnedUntil && listing.pinnedUntil.getTime() > Date.now()
        ? listing.pinnedUntil.getTime()
        : Date.now();
    return this.prisma.communityListing.update({
      where: { id },
      data: { pinnedUntil: new Date(base + dto.weeks * 7 * DAY_MS) },
      include: CommunityBoardService.AD_INCLUDE,
    });
  }

  /** Текущие цены рекламы ЖК, видны всем с доступом к доске. */
  async getAdPricing(tenantId: string, user: any) {
    await this.assertAccessToTenant(user, tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { adPriceMonthly: true, adPinPriceWeekly: true, adTrialDays: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'COMMUNITY_BOARD.TENANT_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }
    return tenant;
  }

  async setAdPricing(tenantId: string, user: any, dto: SetAdPricingDto) {
    if (user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.AD_PRICING_SUPERADMIN_ONLY',
        message: 'Цены на рекламу задаёт только владелец сервиса',
      });
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.adPriceMonthly !== undefined && { adPriceMonthly: dto.adPriceMonthly }),
        ...(dto.adPinPriceWeekly !== undefined && { adPinPriceWeekly: dto.adPinPriceWeekly }),
        ...(dto.adTrialDays !== undefined && { adTrialDays: dto.adTrialDays }),
      },
      select: { adPriceMonthly: true, adPinPriceWeekly: true, adTrialDays: true },
    });
  }

  /**
   * Получение списка всех собственных объявлений жильца (любые статусы).
   */
  async getMyListings(user: any) {
    if (!user) {
      throw new ForbiddenException({
        code: 'COMMUNITY_BOARD.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    return this.prisma.communityListing.findMany({
      where: { authorId: user.id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
        removedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Обновление настройки видимости телефона на доске объявлений.
   * Применяется только к аккаунту вызывающего пользователя — BOLA-поверхность отсутствует.
   */
  async updatePhoneVisibility(
    user: { id: string },
    dto: UpdatePhoneVisibilityDto,
  ): Promise<{ hidePhoneInListings: boolean }> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { hidePhoneInListings: dto.hidePhoneInListings },
      select: { hidePhoneInListings: true },
    });
    return updated;
  }
}
