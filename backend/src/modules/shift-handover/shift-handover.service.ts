import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateShiftHandoverNoteDto } from './dto/shift-handover.dto';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';

const SHIFT_HANDOVER_POST_ROLES: UserRole[] = [
  UserRole.SECURITY,
  UserRole.DISPATCHER,
  UserRole.HOA_ADMIN,
  UserRole.SUPERADMIN,
];

const SHIFT_HANDOVER_READ_ROLES: UserRole[] = [
  ...SHIFT_HANDOVER_POST_ROLES,
  UserRole.HOA_CHAIRMAN,
];

@Injectable()
export class ShiftHandoverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Оставить заметку для передачи следующей смене (охрана/диспетчерская).
   * Председатель ОСИ не работает посменно — только чтение (см. getNotes).
   */
  async createNote(
    tenantId: string,
    user: { id: string; role: UserRole; tenantId?: string | null },
    dto: CreateShiftHandoverNoteDto,
  ) {
    if (!SHIFT_HANDOVER_POST_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: 'SHIFT_HANDOVER.POST_FORBIDDEN',
        message: 'Недостаточно прав для публикации заметки передачи смены',
      });
    }

    assertUserBelongsToTenant(user, tenantId, 'заметок передачи смены');

    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException({
        code: 'SHIFT_HANDOVER.CONTENT_REQUIRED',
        message: 'Текст заметки не может быть пустым',
      });
    }

    return this.prisma.shiftHandoverNote.create({
      data: {
        tenantId,
        authorId: user.id,
        content,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }

  /**
   * Последние 50 заметок передачи смены ЖК, от новых к старым.
   */
  async getNotes(
    tenantId: string,
    user: { role: UserRole; tenantId?: string | null },
  ) {
    if (!SHIFT_HANDOVER_READ_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: 'SHIFT_HANDOVER.VIEW_FORBIDDEN',
        message: 'Недостаточно прав для просмотра заметок передачи смены',
      });
    }

    assertUserBelongsToTenant(user, tenantId, 'заметок передачи смены');

    return this.prisma.shiftHandoverNote.findMany({
      where: { tenantId },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
  }
}
