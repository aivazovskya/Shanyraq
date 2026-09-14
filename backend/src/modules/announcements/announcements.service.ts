import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementStatus, UserRole } from '@prisma/client';
import { CreateAnnouncementDto, RemoveAnnouncementDto } from './dto/announcements.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ANNOUNCEMENT_STAFF_ROLES: UserRole[] = [
  UserRole.HOA_ADMIN,
  UserRole.HOA_CHAIRMAN,
  UserRole.DISPATCHER,
  UserRole.SUPERADMIN,
];

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditLogService: AuditLogService,
  ) {}

  async getAnnouncements(tenantId: string, user: { role: UserRole }) {
    const whereClause: any = { tenantId };

    if (!ANNOUNCEMENT_STAFF_ROLES.includes(user.role)) {
      // Обычные жители и SECURITY никогда не видят снятые новости в общей ленте
      whereClause.status = AnnouncementStatus.ACTIVE;
    }

    return this.prisma.announcement.findMany({
      where: whereClause,
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
        },
        removedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [
        { isUrgent: 'desc' }, // Urgent alerts appear first
        { createdAt: 'desc' },
      ],
    });
  }

  async createAnnouncement(authorId: string, tenantId: string, dto: CreateAnnouncementDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENTS.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        tenantId,
        authorId,
        title: dto.title,
        content: dto.content,
        isUrgent: dto.isUrgent || false,
      },
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });

    // Send push notification to all devices registered in this tenant
    await this.notificationsService.sendToTenant(tenantId, {
      title: announcement.isUrgent ? `🚨 Экстренное сообщение: ${announcement.title}` : `📢 ${announcement.title}`,
      body: announcement.content.length > 120 ? `${announcement.content.slice(0, 117)}...` : announcement.content,
      data: {
        type: 'ANNOUNCEMENT',
        announcementId: announcement.id,
        tenantId,
        isUrgent: announcement.isUrgent,
      },
    });

    return announcement;
  }

  /**
   * Удаление/деактивация опубликованной новости (soft-delete по аналогии с moderateListing).
   * Доступно тем же ролям, что и публикация новости.
   */
  async removeAnnouncement(id: string, user: { id: string; role: UserRole; tenantId?: string | null }, dto: RemoveAnnouncementDto) {
    if (!ANNOUNCEMENT_STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: 'ANNOUNCEMENTS.REMOVE_FORBIDDEN',
        message: 'Недостаточно прав для удаления новости',
      });
    }

    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENTS.NOT_FOUND',
        message: 'Новость не найдена',
      });
    }

    if (user.role !== UserRole.SUPERADMIN && user.tenantId !== announcement.tenantId) {
      throw new ForbiddenException({
        code: 'ANNOUNCEMENTS.REMOVE_CROSS_TENANT_FORBIDDEN',
        message: 'Вы можете удалять новости только своего жилого комплекса',
      });
    }

    if (announcement.status === AnnouncementStatus.REMOVED) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENTS.ALREADY_REMOVED',
        message: 'Новость уже удалена',
      });
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENTS.REMOVAL_REASON_REQUIRED',
        message: 'Причина удаления обязательна для заполнения',
      });
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        status: AnnouncementStatus.REMOVED,
        removedById: user.id,
        removedReason: dto.reason.trim(),
      },
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });

    await this.auditLogService.log({
      tenantId: announcement.tenantId,
      actorId: user.id,
      action: 'ANNOUNCEMENT_REMOVED',
      targetType: 'Announcement',
      targetId: id,
      metadata: { reason: dto.reason.trim() },
    });

    return updated;
  }
}
