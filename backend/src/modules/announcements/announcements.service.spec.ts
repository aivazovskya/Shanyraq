import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole, AnnouncementStatus } from '@prisma/client';

describe('AnnouncementsModule (Безопасность и Tenant-изоляция новостей)', () => {
  let service: AnnouncementsService;
  let controller: AnnouncementsController;
  let prismaMock: any;
  let notificationsMock: any;
  let auditLogMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      announcement: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    notificationsMock = {
      sendToTenant: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    auditLogMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    controller = module.get<AnnouncementsController>(AnnouncementsController);
  });

  describe('GET /announcements/tenant/:tenantId (BOLA защита)', () => {
    it('должен блокировать доступ жителя к новостям чужого ЖК', async () => {
      const alienUser = {
        id: 'user-alien',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-MY-HOA',
      };

      await expect(
        controller.getAnnouncements('tenant-OTHER-HOA', alienUser),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.announcement.findMany).not.toHaveBeenCalled();
    });

    it('должен разрешать доступ жителя к новостям своего ЖК', async () => {
      const myUser = {
        id: 'user-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      };

      prismaMock.announcement.findMany.mockResolvedValue([
        { id: 'ann-1', title: 'Отключение воды', isUrgent: true },
      ]);

      const result = await controller.getAnnouncements('tenant-1', myUser);
      expect(result).toHaveLength(1);
      expect(prismaMock.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', status: AnnouncementStatus.ACTIVE },
        }),
      );
    });

    it('должен разрешать супер-админу доступ к новостям любого ЖК', async () => {
      const superAdmin = {
        id: 'super-1',
        role: UserRole.SUPERADMIN,
        tenantId: null,
      };

      prismaMock.announcement.findMany.mockResolvedValue([]);
      await controller.getAnnouncements('tenant-ANY', superAdmin);
      expect(prismaMock.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-ANY' } }),
      );
    });
  });

  describe('POST /announcements (Защита от подмены tenantId)', () => {
    it('должен принудительно использовать tenantId из токена сотрудника, игнорируя чужой tenantId в DTO', async () => {
      const staffUser = {
        id: 'staff-1',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-MY-HOA',
      };

      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-MY-HOA', name: 'Мой ЖК' });
      prismaMock.announcement.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'ann-1', ...args.data }),
      );

      // Клиент пытается подставить чужой ЖК 'tenant-OTHER-HOA' в DTO
      await controller.createAnnouncement(staffUser, {
        tenantId: 'tenant-OTHER-HOA',
        title: 'Фальшивая новость',
        content: 'Текст',
      });

      // Сервер обязан создать новость в 'tenant-MY-HOA'
      expect(prismaMock.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-MY-HOA',
          }),
        }),
      );
    });

    it('должен отклонять запрос, если у пользователя нет tenantId и он не суперадмин', async () => {
      const userWithoutTenant = {
        id: 'user-2',
        role: UserRole.HOA_ADMIN,
        tenantId: null,
      };

      const promise = controller.createAnnouncement(userWithoutTenant, {
        title: 'Новость',
        content: 'Текст',
      });
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'ANNOUNCEMENTS.TENANT_ID_REQUIRED' },
      });
    });

    it('должен выбрасывать NotFoundException с кодом при несуществующем tenantId', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);

      const promise = service.createAnnouncement('user-1', 'non-existent', {
        title: 'Новость',
        content: 'Текст',
      });
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'ANNOUNCEMENTS.COMPLEX_NOT_FOUND' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Announcement removal/deactivation (Task 0064)
  // -------------------------------------------------------------------------
  describe('getAnnouncements — видимость REMOVED новостей (Task 0064)', () => {
    it('персонал (HOA_ADMIN/HOA_CHAIRMAN/DISPATCHER/SUPERADMIN) видит новости без фильтра по статусу (включая REMOVED)', async () => {
      prismaMock.announcement.findMany.mockResolvedValue([]);
      const dispatcherUser = { id: 'd-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' };

      await service.getAnnouncements('tenant-1', dispatcherUser);

      expect(prismaMock.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      );
    });

    it('SECURITY трактуется как обычный житель — видит только ACTIVE', async () => {
      prismaMock.announcement.findMany.mockResolvedValue([]);
      const securityUser = { id: 'sec-1', role: UserRole.SECURITY, tenantId: 'tenant-1' };

      await service.getAnnouncements('tenant-1', securityUser);

      expect(prismaMock.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', status: AnnouncementStatus.ACTIVE },
        }),
      );
    });
  });

  describe('removeAnnouncement (Task 0064)', () => {
    const activeAnnouncement = {
      id: 'ann-1',
      tenantId: 'tenant-1',
      authorId: 'staff-1',
      status: AnnouncementStatus.ACTIVE,
    };

    it.each([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN])(
      'позволяет роли %s удалить новость своего ЖК с указанием причины',
      async (role) => {
        prismaMock.announcement.findUnique.mockResolvedValue(activeAnnouncement);
        prismaMock.announcement.update.mockResolvedValue({
          ...activeAnnouncement,
          status: AnnouncementStatus.REMOVED,
          removedById: 'actor-1',
          removedReason: 'Опубликовано по ошибке',
        });

        const actor = { id: 'actor-1', role, tenantId: 'tenant-1' };
        const result = await service.removeAnnouncement('ann-1', actor, {
          reason: 'Опубликовано по ошибке',
        });

        expect(result.status).toBe(AnnouncementStatus.REMOVED);
        expect(prismaMock.announcement.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'ann-1' },
            data: {
              status: AnnouncementStatus.REMOVED,
              removedById: 'actor-1',
              removedReason: 'Опубликовано по ошибке',
            },
          }),
        );
        expect(auditLogMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          action: 'ANNOUNCEMENT_REMOVED',
          targetType: 'Announcement',
          targetId: 'ann-1',
          metadata: { reason: 'Опубликовано по ошибке' },
        });
      },
    );

    it('отклоняет удаление жителем (ForbiddenException)', async () => {
      const resident = { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

      await expect(
        service.removeAnnouncement('ann-1', resident, { reason: 'Не нравится' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.announcement.findUnique).not.toHaveBeenCalled();
    });

    it('отклоняет удаление сотрудником чужого ЖК (ForbiddenException)', async () => {
      prismaMock.announcement.findUnique.mockResolvedValue(activeAnnouncement);
      const otherTenantStaff = { id: 'staff-2', role: UserRole.HOA_ADMIN, tenantId: 'tenant-2' };

      await expect(
        service.removeAnnouncement('ann-1', otherTenantStaff, { reason: 'Чужое' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.announcement.update).not.toHaveBeenCalled();
    });

    it('разрешает SUPERADMIN удалять новость любого ЖК (кросс-тенант)', async () => {
      prismaMock.announcement.findUnique.mockResolvedValue(activeAnnouncement);
      prismaMock.announcement.update.mockResolvedValue({
        ...activeAnnouncement,
        status: AnnouncementStatus.REMOVED,
      });
      const superAdmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };

      await expect(
        service.removeAnnouncement('ann-1', superAdmin, { reason: 'Модерация платформы' }),
      ).resolves.toBeDefined();
    });

    it('отклоняет повторное удаление уже удалённой новости (BadRequestException)', async () => {
      prismaMock.announcement.findUnique.mockResolvedValue({
        ...activeAnnouncement,
        status: AnnouncementStatus.REMOVED,
      });
      const staff = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };

      await expect(
        service.removeAnnouncement('ann-1', staff, { reason: 'Повторно' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет удаление без причины (пустая/пробельная строка)', async () => {
      prismaMock.announcement.findUnique.mockResolvedValue(activeAnnouncement);
      const staff = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };

      await expect(
        service.removeAnnouncement('ann-1', staff, { reason: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.announcement.update).not.toHaveBeenCalled();
      expect(auditLogMock.log).not.toHaveBeenCalled();
    });

    it('выбрасывает NotFoundException для несуществующей новости', async () => {
      prismaMock.announcement.findUnique.mockResolvedValue(null);
      const staff = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };

      await expect(
        service.removeAnnouncement('missing-id', staff, { reason: 'Причина' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
