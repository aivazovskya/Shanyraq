import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ListingType, ListingStatus } from '@prisma/client';
import {
  CreateListingDto,
  UpdateListingDto,
  ModerateListingDto,
  GetListingsQueryDto,
} from './dto/community-board.dto';

@Injectable()
export class CommunityBoardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Проверка доступа пользователя к ресурсам/доске тенанта.
   * Полностью повторяет форму assertAccessToTenant() из BookingsService.
   * - SUPERADMIN: доступ ко всем ЖК.
   * - Персонал (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY): доступ только к своему ЖК (user.tenantId === tenantId).
   * - Жители (OWNER, TENANT): доступ только при наличии верифицированного владения/проживания в зданиях данного ЖК.
   * Возвращает true, если пользователь является персоналом (или SUPERADMIN), и false, если жителем.
   */
  async assertAccessToTenant(user: any, tenantId: string): Promise<boolean> {
    if (!user) {
      throw new ForbiddenException('Требуется авторизация');
    }

    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    const staffRoles = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    if (staffRoles.includes(user.role)) {
      if (user.tenantId !== tenantId) {
        throw new ForbiddenException('Персонал имеет доступ только к ресурсам своего жилого комплекса');
      }
      return true;
    }

    // Проверяем подтвержденное владение/проживание в здании данного ЖК
    const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
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

    if (!verifiedOwnership) {
      throw new ForbiddenException(
        'У вас нет подтвержденного доступа к доске объявлений данного жилого комплекса',
      );
    }

    return false;
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
    } else if (query.status) {
      whereClause.status = query.status;
    }

    if (query.type) {
      whereClause.type = query.type;
    }

    return this.prisma.communityListing.findMany({
      where: whereClause,
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
   * Публикация нового объявления в ЖК.
   * Требует подтвержденного проживания/владения в данном ЖК (ветка жителя).
   */
  async createListing(tenantId: string, user: any, dto: CreateListingDto) {
    const isStaff = await this.assertAccessToTenant(user, tenantId);

    // Персонал без подтвержденного владения не может публиковать объявления жильцов
    if (isStaff && user.role !== UserRole.SUPERADMIN) {
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
        throw new ForbiddenException(
          'Публикация объявлений доступна только верифицированным жителям данного ЖК',
        );
      }
    }

    // Валидация цены: для "Отдам даром" цена не должна указываться
    if (dto.type === ListingType.GIVE_AWAY && dto.price != null && dto.price > 0) {
      throw new BadRequestException('Для категории "Отдам даром" указание цены недопустимо');
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
      throw new NotFoundException('Объявление не найдено');
    }

    if (listing.authorId !== user.id && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Вы можете редактировать только свои объявления');
    }

    if (listing.status === ListingStatus.REMOVED) {
      throw new BadRequestException('Нельзя редактировать объявление, снятое модератором');
    }

    if (dto.status === ListingStatus.REMOVED) {
      throw new BadRequestException('Автор не может присвоить статус снятого модератором');
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description.trim();
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.photoUrls !== undefined) updateData.photoUrls = dto.photoUrls;

    if (dto.price !== undefined) {
      if (listing.type === ListingType.GIVE_AWAY && dto.price != null && dto.price > 0) {
        throw new BadRequestException('Для категории "Отдам даром" указание цены недопустимо');
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
      throw new ForbiddenException('Недостаточно прав для модерации объявлений');
    }

    const listing = await this.prisma.communityListing.findUnique({
      where: { id },
    });

    if (!listing) {
      throw new NotFoundException('Объявление не найдено');
    }

    if (user.role !== UserRole.SUPERADMIN && user.tenantId !== listing.tenantId) {
      throw new ForbiddenException('Вы можете модерировать объявления только своего жилого комплекса');
    }

    if (listing.status === ListingStatus.REMOVED) {
      throw new BadRequestException('Объявление уже снято с публикации модератором');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Причина удаления обязательна для заполнения');
    }

    return this.prisma.communityListing.update({
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
  }

  /**
   * Получение списка всех собственных объявлений жильца (любые статусы).
   */
  async getMyListings(user: any) {
    if (!user) {
      throw new ForbiddenException('Требуется авторизация');
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
}
