import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceRequestDto, UpdateRequestStatusDto, AddCommentDto, RateRequestDto } from './dto/service-requests.dto';
import { RequestStatus, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private uploadsService: UploadsService,
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

    const history = await this.prisma.auditLog.findMany({
      where: { tenantId: request.tenantId, targetType: 'ServiceRequest', targetId: request.id,
        action: { in: ['REQUEST_STATUS_CHANGED', 'REQUEST_ASSIGNEE_CHANGED'] } },
      select: { id: true, action: true, metadata: true, createdAt: true,
        actor: { select: { firstName: true, lastName: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { ...request, history };
  }

  async getAssignees(requestId: string, user: { id?: string; role?: UserRole; tenantId?: string }) {
    if (![UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN].includes(user.role as any)) {
      throw new ForbiddenException({ code: 'SERVICE_REQUESTS.STATUS_CHANGE_FORBIDDEN', message: 'Недостаточно прав для изменения статуса заявки' });
    }
    const request = await this.getRequestById(requestId, user);
    return this.prisma.user.findMany({
      where: { tenantId: request.tenantId, isActive: true, role: { in: [UserRole.HOA_ADMIN, UserRole.DISPATCHER] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getAttachmentFile(requestId: string, attachmentId: string, user: { id?: string; role?: UserRole; tenantId?: string }) {
    const request = await this.getRequestById(requestId, user);
    const attachment = request.attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new NotFoundException({ code: 'UPLOADS.FILE_NOT_FOUND', message: 'Вложение недоступно' });
    return this.uploadsService.openStoredFile(attachment.fileUrl, request.creatorId);
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
      const isStaff = ([UserRole.HOA_ADMIN, UserRole.DISPATCHER] as UserRole[]).includes(
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

    if (dto.expectedUpdatedAt && Date.parse(dto.expectedUpdatedAt) !== request.updatedAt.getTime()) {
      throw new ConflictException({ code: 'SERVICE_REQUESTS.UPDATE_CONFLICT', message: 'Заявка уже изменена другим сотрудником. Обновите карточку.' });
    }
    let assignee: { id: string; firstName: string; lastName: string } | null = null;
    if (dto.assigneeId !== undefined) {
      if (typeof dto.assigneeId !== 'string' || !dto.assigneeId.trim()) {
        throw new BadRequestException({ code: 'SERVICE_REQUESTS.INVALID_ASSIGNEE', message: 'Выберите активного сотрудника этого ЖК, который работает с заявками' });
      }
      const candidate = await this.prisma.user.findUnique({ where: { id: dto.assigneeId },
        select: { id: true, tenantId: true, isActive: true, role: true, firstName: true, lastName: true } });
      if (!candidate || !candidate.isActive || candidate.tenantId !== request.tenantId ||
          !([UserRole.HOA_ADMIN, UserRole.DISPATCHER] as UserRole[]).includes(candidate.role)) {
        throw new BadRequestException({ code: 'SERVICE_REQUESTS.INVALID_ASSIGNEE', message: 'Выберите активного сотрудника этого ЖК, который работает с заявками' });
      }
      assignee = candidate;
    }
    const nextAssigneeId = dto.assigneeId !== undefined ? dto.assigneeId : request.assigneeId;
    if (dto.status === RequestStatus.ASSIGNED && !nextAssigneeId) {
      throw new BadRequestException({ code: 'SERVICE_REQUESTS.ASSIGNEE_REQUIRED', message: 'Для назначения заявки выберите ответственного сотрудника' });
    }
    if (request.status === dto.status && nextAssigneeId === request.assigneeId) return request;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.serviceRequest.update({
      where: { id: requestId, updatedAt: request.updatedAt },
      data: {
        status: dto.status,
        assigneeId: nextAssigneeId,
      },
      include: {
        assignee: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
      });
      const changedStatus = request.status !== dto.status;
      await tx.auditLog.create({ data: {
        tenantId: request.tenantId, actorId: requestingUser?.id || null, targetType: 'ServiceRequest', targetId: request.id,
        action: changedStatus ? 'REQUEST_STATUS_CHANGED' : 'REQUEST_ASSIGNEE_CHANGED',
        metadata: { fromStatus: request.status, toStatus: dto.status,
          fromAssigneeId: request.assigneeId, toAssigneeId: nextAssigneeId,
          assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null },
      } });
      return result;
    }).catch((error) => {
      if (error?.code === 'P2025') throw new ConflictException({ code: 'SERVICE_REQUESTS.UPDATE_CONFLICT', message: 'Заявка уже изменена другим сотрудником. Обновите карточку.' });
      throw error;
    });

    // Push notification to the resident who created the service request
    const statusLabels: Record<string, string> = {
      PENDING: 'В очереди',
      ASSIGNED: 'Назначен ответственный',
      IN_PROGRESS: 'В работе',
      RESOLVED: 'Выполнена (требуется оценка)',
      REJECTED: 'Отклонена',
      CLOSED: 'Закрыта',
    };

    const statusText = statusLabels[dto.status] || dto.status;
    try { await this.notificationsService.sendToUser(request.creatorId, {
      title: `🛠️ Статус заявки №${request.id.slice(0, 8)} обновлен`,
      body: `Заявка "${request.title}": ${statusText}`,
      data: {
        type: 'SERVICE_REQUEST',
        requestId: request.id,
        status: dto.status,
      },
    }); } catch { this.logger.warn('Request updated; resident notification could not be delivered'); }

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
      try { await this.notificationsService.sendToUser(request.creatorId, {
        title: `💬 Сообщение по заявке "${request.title}"`,
        body: dto.text.length > 100 ? `${dto.text.slice(0, 97)}...` : dto.text,
        data: {
          type: 'SERVICE_REQUEST',
          requestId: request.id,
          commentId: comment.id,
        },
      }); } catch { this.logger.warn('Comment saved; resident notification could not be delivered'); }
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
      where: { id: requestId },
      data: {
        rating: dto.rating,
        feedback: dto.feedback,
        status: RequestStatus.CLOSED,
      },
      });
      if (request.status !== RequestStatus.CLOSED) await tx.auditLog.create({ data: {
        tenantId: request.tenantId, actorId: userId, action: 'REQUEST_STATUS_CHANGED', targetType: 'ServiceRequest', targetId: requestId,
        metadata: { fromStatus: request.status, toStatus: RequestStatus.CLOSED, fromAssigneeId: request.assigneeId, toAssigneeId: request.assigneeId },
      } });
      return updated;
    });
  }
}
