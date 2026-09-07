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
    it('должен корректно отрабатывать при отсутствии токенов у пользователя', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([]);

      const res = await service.sendToUser('user-empty', {
        title: 'Тест',
        body: 'Текст',
      });

      expect(res.sent).toBe(0);
    });

    it('должен отправлять пуш при наличии зарегистрированных токенов', async () => {
      prismaMock.deviceToken.findMany.mockResolvedValue([
        { token: 'ExponentPushToken[111111111111]' },
      ]);

      const res = await service.sendToUser('user-active', {
        title: 'Заявка обновлена',
        body: 'Статус: Выполнена',
      });

      expect(res.sent).toBe(1);
    });
  });
});
