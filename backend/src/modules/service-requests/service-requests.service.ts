import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceRequestDto, UpdateRequestStatusDto, AddCommentDto, RateRequestDto } from './dto/service-requests.dto';
import { RequestStatus, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';

@Injectable()
export class ServiceRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async createRequest(userId: string, dto: CreateServiceRequestDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: {
        building: true,
        ownerships: true,
      },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'SERVICE_REQUESTS.UNIT_NOT_FOUND',
        message: 'Квартира/помещение не найдено',
      });
    }

    // Аудит безопасности: проверка прав на помещение (BOLA/IDOR protection)
    const hasVerifiedOwnership = unit.ownerships?.some(
      (o) => o.userId === userId && o.isVerified,
    );

    if (!hasVerifiedOwnership) {
      // Разрешаем сотрудникам обслуживающей организации данного ЖК и суперадминам
      const caller = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tenantId: true },
      });

      const staffRoles = [
        UserRole.HOA_ADMIN,
        UserRole.HOA_CHAIRMAN,
        UserRole.DISPATCHER,
        UserRole.SECURITY,
      ];
      const isStaff = caller && (staffRoles as UserRole[]).includes(caller.role);

      if (!caller || (!isStaff && caller.role !== UserRole.SUPERADMIN)) {
        throw new ForbiddenException({
          code: 'SERVICE_REQUESTS.UNIT_ACCESS_FORBIDDEN',
          message: 'У вас нет подтвержденного доступа к данному помещению',
        });
      }

      assertUserBelongsToTenant(caller, unit.building.tenantId, {
        code: 'SERVICE_REQUESTS.UNIT_ACCESS_FORBIDDEN',
        message: 'У вас нет подтвержденного доступа к данному помещению',
      });
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

  async getRequestById(
    requestId: string,
    requestingUser?: { id?: string; role?: UserRole; tenantId?: string },
  ) {
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
          where:
            requestingUser &&
            (requestingUser.role === UserRole.RESIDENT_OWNER || requestingUser.role === UserRole.RESIDENT_TENANT)
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
      throw new NotFoundException({
        code: 'SERVICE_REQUESTS.REQUEST_NOT_FOUND',
        message: 'Заявка не найдена',
      });
    }

    if (requestingUser && requestingUser.role !== UserRole.SUPERADMIN) {
      const isStaff = ([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER] as UserRole[]).includes(
        requestingUser.role as UserRole,
      );
      if (isStaff) {
        assertUserBelongsToTenant(requestingUser, request.tenantId, {
          code: 'SERVICE_REQUESTS.CROSS_TENANT_VIEW_FORBIDDEN',
          message: 'Доступ к заявке другого ЖК запрещен',
        });
      } else {
        if (request.creatorId !== requestingUser.id) {
          throw new ForbiddenException({
            code: 'SERVICE_REQUESTS.FOREIGN_REQUEST_VIEW_FORBIDDEN',
            message: 'Доступ к чужой заявке запрещен',
          });
        }
      }
    }

    return request;
  }

  async updateStatus(
    requestId: string,
    dto: UpdateRequestStatusDto,
    requestingUser?: { id?: string; role?: UserRole; tenantId?: string },
  ) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException({
        code: 'SERVICE_REQUESTS.REQUEST_NOT_FOUND',
        message: 'Заявка не найдена',
      });
    }

    if (requestingUser && requestingUser.role !== UserRole.SUPERADMIN) {
      const isStaff = ([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER] as UserRole[]).includes(
        requestingUser.role as UserRole,
      );
      if (!isStaff) {
        throw new ForbiddenException({
          code: 'SERVICE_REQUESTS.STATUS_CHANGE_FORBIDDEN',
          message: 'Недостаточно прав для изменения статуса заявки',
        });
      }
      assertUserBelongsToTenant(requestingUser, request.tenantId, {
        code: 'SERVICE_REQUESTS.CROSS_TENANT_EDIT_FORBIDDEN',
        message: 'Редактирование заявки другого ЖК запрещено',
      });
    }

    const updated = await this.prisma.serviceRequest.update({
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

    // Push notification to the resident who created the service request
    const statusLabels: Record<string, string> = {
      PENDING: 'В очереди',
      ASSIGNED: 'Назначен мастер',
      IN_PROGRESS: 'В работе',
      RESOLVED: 'Выполнена (требуется оценка)',
      REJECTED: 'Отклонена',
      CLOSED: 'Закрыта',
    };

    const statusText = statusLabels[dto.status] || dto.status;
    await this.notificationsService.sendToUser(request.creatorId, {
      title: `🛠️ Статус заявки №${request.id.slice(0, 8)} обновлен`,
      body: `Заявка "${request.title}": ${statusText}`,
      data: {
        type: 'SERVICE_REQUEST',
        requestId: request.id,
        status: dto.status,
      },
    });

    return updated;
  }

  async addComment(
    requestId: string,
    authorId: string,
    dto: AddCommentDto,
    requestingUser?: { id?: string; role?: UserRole; tenantId?: string },
  ) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException({
        code: 'SERVICE_REQUESTS.REQUEST_NOT_FOUND',
        message: 'Заявка не найдена',
      });
    }

    if (requestingUser && requestingUser.role !== UserRole.SUPERADMIN) {
      const isStaff = ([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER] as UserRole[]).includes(
        requestingUser.role as UserRole,
      );
      if (isStaff) {
        assertUserBelongsToTenant(requestingUser, request.tenantId, {
          code: 'SERVICE_REQUESTS.CROSS_TENANT_COMMENT_FORBIDDEN',
          message: 'Добавление комментариев к заявкам другого ЖК запрещено',
        });
      } else {
        if (request.creatorId !== requestingUser.id) {
          throw new ForbiddenException({
            code: 'SERVICE_REQUESTS.FOREIGN_REQUEST_COMMENT_FORBIDDEN',
            message: 'Добавление комментариев к чужой заявке запрещено',
          });
        }
      }
    }

    const isStaffOrAdmin =
      requestingUser?.role === UserRole.SUPERADMIN ||
      ([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER] as UserRole[]).includes(
        requestingUser?.role as UserRole,
      );

    const comment = await this.prisma.requestComment.create({
      data: {
        requestId,
        authorId,
        text: dto.text,
        isInternal: isStaffOrAdmin ? dto.isInternal || false : false,
      },
      include: {
        author: {
          select: { firstName: true, lastName: true, role: true },
        },
      },
    });

    // Notify creator if someone else (e.g. dispatcher/staff) commented publicly
    if (request.creatorId !== authorId && !dto.isInternal) {
      await this.notificationsService.sendToUser(request.creatorId, {
        title: `💬 Сообщение по заявке "${request.title}"`,
        body: dto.text.length > 100 ? `${dto.text.slice(0, 97)}...` : dto.text,
        data: {
          type: 'SERVICE_REQUEST',
          requestId: request.id,
          commentId: comment.id,
        },
      });
    }

    return comment;
  }

  async rateRequest(requestId: string, userId: string, dto: RateRequestDto) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException({
        code: 'SERVICE_REQUESTS.REQUEST_NOT_FOUND',
        message: 'Заявка не найдена',
      });
    }

    if (request.creatorId !== userId) {
      throw new ForbiddenException({
        code: 'SERVICE_REQUESTS.RATING_CREATOR_ONLY',
        message: 'Оценить качество выполнения может только создатель заявки',
      });
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
