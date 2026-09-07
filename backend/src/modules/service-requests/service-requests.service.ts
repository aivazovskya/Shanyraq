import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceRequestDto, UpdateRequestStatusDto, AddCommentDto, RateRequestDto } from './dto/service-requests.dto';
import { RequestStatus, UserRole } from '@prisma/client';

@Injectable()
export class ServiceRequestsService {
  constructor(private prisma: PrismaService) {}

  async createRequest(userId: string, dto: CreateServiceRequestDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { building: true },
    });

    if (!unit) {
      throw new NotFoundException('Квартира/помещение не найдено');
    }

    return this.prisma.serviceRequest.create({
      data: {
        tenantId: unit.building.tenantId,
        unitId: dto.unitId,
        creatorId: userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        status: RequestStatus.PENDING,
        attachments: dto.attachmentUrls
          ? {
              create: dto.attachmentUrls.map((url) => ({
                fileUrl: url,
                fileType: 'image/jpeg',
              })),
            }
          : undefined,
      },
      include: {
        unit: {
          include: { building: true },
        },
        creator: {
          select: { firstName: true, lastName: true, phone: true },
        },
        attachments: true,
      },
    });
  }

  async getRequests(filter: { tenantId?: string; userId?: string; status?: RequestStatus }) {
    const where: any = {};
    if (filter.tenantId) where.tenantId = filter.tenantId;
    if (filter.userId) where.creatorId = filter.userId;
    if (filter.status) where.status = filter.status;

    return this.prisma.serviceRequest.findMany({
      where,
      include: {
        unit: {
          include: { building: true },
        },
        creator: {
          select: { firstName: true, lastName: true, phone: true },
        },
        assignee: {
          select: { firstName: true, lastName: true, phone: true },
        },
        _count: {
          select: { comments: true, attachments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequestById(requestId: string, userRole: UserRole) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: {
          include: { building: true },
        },
        creator: {
          select: { firstName: true, lastName: true, phone: true },
        },
        assignee: {
          select: { firstName: true, lastName: true, phone: true },
        },
        comments: {
          where: userRole === UserRole.RESIDENT_OWNER || userRole === UserRole.RESIDENT_TENANT
            ? { isInternal: false } // Hide internal dispatcher notes from residents
            : {},
          include: {
            author: {
              select: { firstName: true, lastName: true, role: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    return request;
  }

  async updateStatus(requestId: string, dto: UpdateRequestStatusDto) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    return this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        assigneeId: dto.assigneeId !== undefined ? dto.assigneeId : request.assigneeId,
      },
      include: {
        assignee: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });
  }

  async addComment(requestId: string, authorId: string, dto: AddCommentDto) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    return this.prisma.requestComment.create({
      data: {
        requestId,
        authorId,
        text: dto.text,
        isInternal: dto.isInternal || false,
      },
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });
  }

  async rateRequest(requestId: string, userId: string, dto: RateRequestDto) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }

    if (request.creatorId !== userId) {
      throw new ForbiddenException('Оценить качество выполнения может только создатель заявки');
    }

    return this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        rating: dto.rating,
        feedback: dto.feedback,
        status: RequestStatus.CLOSED,
      },
    });
  }
}
