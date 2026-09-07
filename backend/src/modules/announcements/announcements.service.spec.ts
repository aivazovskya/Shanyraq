import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('AnnouncementsModule (Безопасность и Tenant-изоляция новостей)', () => {
  let service: AnnouncementsService;
  let controller: AnnouncementsController;
  let prismaMock: any;
  let notificationsMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      announcement: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    notificationsMock = {
      sendToTenant: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
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
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
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

      await expect(
        controller.createAnnouncement(userWithoutTenant, {
          title: 'Новость',
          content: 'Текст',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
