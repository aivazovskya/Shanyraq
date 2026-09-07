import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/announcements.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

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

  async createAnnouncement(authorId: string, dto: CreateAnnouncementDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Жилой комплекс не найден');
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        tenantId: dto.tenantId,
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

    if (announcement.isUrgent) {
      console.log(`[PUSH-NOTIFICATION] 🚨 Отправлен экстренный Push всем жильцам ЖК "${tenant.name}": "${announcement.title}"`);
    }

    return announcement;
  }
}
