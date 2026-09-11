import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('NotificationsService (Push-уведомления)', () => {
  let service: NotificationsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
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

    // Default user mock: null preferences (default all enabled)
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-default',
      notificationPreferences: null,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    // Mock fetch so tests don't make real network calls to Expo
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: [] }),
    }) as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  describe('Notification Preferences (Настройки категорий)', () => {
    describe('getPreferences', () => {
      it('возвращает все категории активными (true) по умолчанию, если preferences не заданы (null)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-default',
          notificationPreferences: null,
        });

        const prefs = await service.getPreferences('user-default');
        expect(prefs).toEqual({
          CHAT: true,
          SERVICE_REQUEST: true,
          ANNOUNCEMENT: true,
          FINANCE: true,
        });
      });

      it('возвращает сохраненные настройки пользователя с сохранением значений true для отсутствующих ключей', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-custom',
          notificationPreferences: { CHAT: false, FINANCE: false },
        });

        const prefs = await service.getPreferences('user-custom');
        expect(prefs).toEqual({
          CHAT: false,
          SERVICE_REQUEST: true,
          ANNOUNCEMENT: true,
          FINANCE: false,
        });
      });
    });

    describe('updatePreferences', () => {
      it('обновляет выбранные категории и сохраняет их в БД', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-1',
          notificationPreferences: { CHAT: true },
        });
        prismaMock.user.update.mockResolvedValue({});

        const res = await service.updatePreferences('user-1', {
          CHAT: false,
          SERVICE_REQUEST: false,
        });

        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: {
            notificationPreferences: {
              CHAT: false,
              SERVICE_REQUEST: false,
            },
          },
        });
        expect(res).toEqual({
          CHAT: false,
          SERVICE_REQUEST: false,
          ANNOUNCEMENT: true,
          FINANCE: true,
        });
      });

      it('игнорирует попытки передать SOS, защищая от клиентских ошибок', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-1',
          notificationPreferences: {},
        });
        prismaMock.user.update.mockResolvedValue({});

        const res = await service.updatePreferences('user-1', {
          CHAT: false,
          ['SOS' as any]: false,
        });

        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: {
            notificationPreferences: {
              CHAT: false,
            },
          },
        });
        expect((res as any).SOS).toBeUndefined();
      });
    });

    describe('Filtering in sendToUser', () => {
      it('пользователь, отключивший CHAT, не получает push и не сохраняет в БД уведомление CHAT_MESSAGE', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-mute-chat',
          notificationPreferences: { CHAT: false },
        });
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-chat]' },
        ]);

        const res = await service.sendToUser('user-mute-chat', {
          title: 'Новое сообщение',
          body: 'Привет!',
          data: { type: 'CHAT_MESSAGE', conversationId: 'c-1' },
        });

        expect(res.sent).toBe(0);
        expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
      });

      it('пользователь с включенными уведомлениями успешно получает CHAT_MESSAGE', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-unmuted',
          notificationPreferences: null,
        });
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-chat-ok]' },
        ]);

        const res = await service.sendToUser('user-unmuted', {
          title: 'Новое сообщение',
          body: 'Привет!',
          data: { type: 'CHAT_MESSAGE', conversationId: 'c-1' },
        });

        expect(res.sent).toBe(1);
        expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              userId: 'user-unmuted',
              title: 'Новое сообщение',
            }),
          ],
        });
      });

      it('SOS_ALERT доставляется безусловно, даже если в БД сохранены { SOS: false } и все категории отключены', async () => {
        // Direct regression test for Architecture Decision #1
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-all-muted',
          notificationPreferences: {
            SOS: false,
            CHAT: false,
            SERVICE_REQUEST: false,
            ANNOUNCEMENT: false,
            FINANCE: false,
          },
        });
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-sos]' },
        ]);

        const res = await service.sendToUser('user-all-muted', {
          title: '🚨 ТРЕВОГА SOS',
          body: 'Срочный сигнал тревоги!',
          data: { type: 'SOS_ALERT', alertId: 'alert-1' },
        });

        expect(res.sent).toBe(1);
        expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              userId: 'user-all-muted',
              title: '🚨 ТРЕВОГА SOS',
            }),
          ],
        });
      });

      it('неизвестный или отсутствующий type доставляется безусловно (fail-open opt-out)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'user-all-muted',
          notificationPreferences: {
            CHAT: false,
            SERVICE_REQUEST: false,
            ANNOUNCEMENT: false,
            FINANCE: false,
          },
        });
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-unmapped]' },
        ]);

        const res = await service.sendToUser('user-all-muted', {
          title: 'Системное уведомление',
          body: 'Технические работы',
          data: { type: 'UNKNOWN_FUTURE_TYPE' },
        });

        expect(res.sent).toBe(1);
        expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              userId: 'user-all-muted',
              title: 'Системное уведомление',
            }),
          ],
        });
      });
    });

    describe('Filtering in sendToTenantRoles (Multi-recipient fanout)', () => {
      it('при рассылке 3 пользователям, если один отключил FINANCE, пуш и сохранение происходят только для 2 остальных', async () => {
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-user1]', userId: 'user-1' },
          { token: 'ExponentPushToken[dev-user2]', userId: 'user-2' },
          { token: 'ExponentPushToken[dev-user3]', userId: 'user-3' },
        ]);

        prismaMock.user.findMany.mockResolvedValue([
          { id: 'user-1', notificationPreferences: { FINANCE: true } },
          { id: 'user-2', notificationPreferences: { FINANCE: false } },
          { id: 'user-3', notificationPreferences: null },
        ]);

        const res = await service.sendToTenantRoles(
          'tenant-1',
          ['HOA_ADMIN' as any, 'DISPATCHER' as any],
          {
            title: 'Задолженность по счету',
            body: 'Напоминаем об оплате',
            data: { type: 'DEBT_REMINDER', accountId: 'acc-1' },
          },
        );

        // Dispatched only to user-1 and user-3
        expect(res.sent).toBe(2);
        expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({ userId: 'user-1' }),
            expect.objectContaining({ userId: 'user-3' }),
          ],
        });
      });

      it('SOS_ALERT через sendToTenantRoles доставляется всем сотрудникам независимо от настроек', async () => {
        prismaMock.deviceToken.findMany.mockResolvedValue([
          { token: 'ExponentPushToken[dev-sec1]', userId: 'sec-1' },
          { token: 'ExponentPushToken[dev-sec2]', userId: 'sec-2' },
        ]);

        prismaMock.user.findMany.mockResolvedValue([
          { id: 'sec-1', notificationPreferences: { SOS: false, CHAT: false } },
          { id: 'sec-2', notificationPreferences: { FINANCE: false, CHAT: false } },
        ]);

        const res = await service.sendToTenantRoles(
          'tenant-1',
          ['SECURITY' as any, 'DISPATCHER' as any],
          {
            title: '🚨 Сигнал SOS',
            body: 'Вызов охраны',
            data: { type: 'SOS_ALERT', alertId: 'alert-99' },
          },
        );

        expect(res.sent).toBe(2);
        expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({ userId: 'sec-1' }),
            expect.objectContaining({ userId: 'sec-2' }),
          ],
        });
      });
    });
  });
});
