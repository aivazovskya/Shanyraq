import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/announcements.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getAnnouncements(tenantId: string) {
    return this.prisma.announcement.findMany({
      where: { tenantId },
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
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
      throw new NotFoundException('Жилой комплекс не найден');
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
        announcementId: announcement.id,
        tenantId,
        isUrgent: announcement.isUrgent,
      },
    });

    return announcement;
  }
}
