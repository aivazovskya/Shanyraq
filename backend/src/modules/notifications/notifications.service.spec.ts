import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('NotificationsService (Push-уведомления)', () => {
  let service: NotificationsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      deviceToken: {
        upsert: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('registerDevice', () => {
    it('должен сохранять или обновлять push-токен устройства пользователя', async () => {
      prismaMock.deviceToken.upsert.mockResolvedValue({
        id: 'token-uuid-1',
        userId: 'user-123',
        token: 'ExponentPushToken[AbCdEf123456]',
        platform: 'expo',
      });

      const res = await service.registerDevice('user-123', {
        token: 'ExponentPushToken[AbCdEf123456]',
        platform: 'expo',
      });

      expect(res.success).toBe(true);
      expect(res.platform).toBe('expo');
      expect(prismaMock.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'ExponentPushToken[AbCdEf123456]' },
        update: expect.objectContaining({ userId: 'user-123', platform: 'expo' }),
        create: expect.objectContaining({ userId: 'user-123', token: 'ExponentPushToken[AbCdEf123456]', platform: 'expo' }),
      });
    });
  });

  describe('unregisterDevice', () => {
    it('должен удалять push-токен при выходе', async () => {
      prismaMock.deviceToken.delete.mockResolvedValue({});

      const res = await service.unregisterDevice('ExponentPushToken[AbCdEf123456]');
      expect(res.success).toBe(true);
      expect(prismaMock.deviceToken.delete).toHaveBeenCalledWith({
        where: { token: 'ExponentPushToken[AbCdEf123456]' },
      });
    });
  });

  describe('sendToUser', () => {
    it('должен корректно отрабатывать при отсутствии токенов у пользователя и сохранять уведомление в БД', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([]);

      const res = await service.sendToUser('user-empty', {
        title: 'Тест',
        body: 'Текст',
        data: { type: 'TEST' },
      });

      expect(res.sent).toBe(0);
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-empty',
            title: 'Тест',
            body: 'Текст',
            data: { type: 'TEST' },
          },
        ],
      });
    });

    it('должен отправлять пуш при наличии зарегистрированных токенов и персистить уведомление', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { token: 'ExponentPushToken[111111111111]' },
      ]);

      const res = await service.sendToUser('user-active', {
        title: 'Заявка обновлена',
        body: 'Статус: Выполнена',
      });

      expect(res.sent).toBe(1);
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-active',
            title: 'Заявка обновлена',
            body: 'Статус: Выполнена',
          },
        ],
      });
    });
  });

  describe('sendToTenant & sendToTenantRoles (Deduplication)', () => {
    it('sendToTenant должен дедуплицировать токены пользователя и сохранять ровно 1 запись для пользователя с 2 девайсами', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { token: 'ExponentPushToken[dev-1]', userId: 'user-dup' },
        { token: 'ExponentPushToken[dev-2]', userId: 'user-dup' },
        { token: 'ExponentPushToken[dev-3]', userId: 'user-other' },
      ]);

      const res = await service.sendToTenant('tenant-1', {
        title: 'Общее собрание',
        body: 'Собрание начнется в 19:00',
        data: { meetingId: 'm-1' },
      });

      expect(res.sent).toBe(3);
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-dup',
            title: 'Общее собрание',
            body: 'Собрание начнется в 19:00',
            data: { meetingId: 'm-1' },
          },
          {
            userId: 'user-other',
            title: 'Общее собрание',
            body: 'Собрание начнется в 19:00',
            data: { meetingId: 'm-1' },
          },
        ],
      });
    });

    it('sendToTenantRoles должен дедуплицировать пользователей', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { token: 'ExponentPushToken[dev-1]', userId: 'staff-1' },
        { token: 'ExponentPushToken[dev-2]', userId: 'staff-1' },
      ]);

      await service.sendToTenantRoles('tenant-1', ['DISPATCHER' as any], {
        title: 'Новая авария',
        body: 'Прорыв трубы',
      });

      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'staff-1',
            title: 'Новая авария',
            body: 'Прорыв трубы',
          },
        ],
      });
    });
  });

  describe('getNotifications & getUnreadCount', () => {
    it('должен возвращать уведомления пользователя с пагинацией', async () => {
      const mockItems = [
        { id: 'notif-1', title: 'Уведомление 1', isRead: false },
        { id: 'notif-2', title: 'Уведомление 2', isRead: true },
      ];
      prismaMock.notification.findMany.mockResolvedValue(mockItems);

      const res = await service.getNotifications('user-1', { take: 10, skip: 0 });
      expect(res).toEqual(mockItems);
      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
    });

    it('должен возвращать количество непрочитанных', async () => {
      prismaMock.notification.count.mockResolvedValue(5);

      const res = await service.getUnreadCount('user-1');
      expect(res.unreadCount).toBe(5);
      expect(res.count).toBe(5);
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });
  });

  describe('markAsRead & markAllAsRead', () => {
    it('должен выбрасывать NotFoundException если уведомление не существует', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead('missing-id', 'user-1')).rejects.toThrow();
    });

    it('должен выбрасывать ForbiddenException при попытке прочитать чужое уведомление (IDOR защита)', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({
        id: 'notif-other',
        userId: 'other-user',
        isRead: false,
      });

      await expect(service.markAsRead('notif-other', 'user-attacker')).rejects.toThrow();
      expect(prismaMock.notification.update).not.toHaveBeenCalled();
    });

    it('должен успешно помечать свое уведомление прочитанным', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-owner',
        isRead: false,
      });
      prismaMock.notification.update.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-owner',
        isRead: true,
      });

      const res = await service.markAsRead('notif-1', 'user-owner');
      expect(res.isRead).toBe(true);
      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { isRead: true },
      });
    });

    it('markAllAsRead должен обновлять все непрочитанные уведомления текущего пользователя', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });

      const res = await service.markAllAsRead('user-1');
      expect(res.success).toBe(true);
      expect(res.updated).toBe(3);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
    });
  });
});
