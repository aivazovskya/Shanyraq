import { Test, TestingModule } from '@nestjs/testing';
import { VotingsSchedulerService } from './votings-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { MeetingStatus, OwnershipType } from '@prisma/client';

describe('VotingsSchedulerService (Task 0045: Напоминания о дедлайне голосования ОСС)', () => {
  let service: VotingsSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map();

    prismaMock = {
      meeting: {
        findMany: jest.fn(),
      },
      unit: {
        findMany: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    redisServiceMock = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) || null)),
      set: jest.fn().mockImplementation((key: string, val: string) => {
        redisStore.set(key, val);
        return Promise.resolve('OK');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingsSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<VotingsSchedulerService>(VotingsSchedulerService);
  });

  describe('handleVotingDeadlineReminders', () => {
    const mockMeeting = {
      id: 'meeting-1',
      tenantId: 'tenant-1',
      title: 'Годовой отчет ОСИ 2026',
      status: MeetingStatus.ACTIVE,
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // in 24 hours (within 48h)
      agendaItems: [
        { id: 'agenda-1' },
        { id: 'agenda-2' },
      ],
    };

    it('должен фильтровать собрания с дедлайном в пределах 48 часов (окно напоминания)', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([]);

      const result = await service.handleVotingDeadlineReminders();

      expect(prismaMock.meeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: MeetingStatus.ACTIVE,
            endDate: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
      expect(result.meetingsChecked).toBe(0);
    });

    it('собрание, у которого дедлайн через 72 часа, не возвращается и не обрабатывается', async () => {
      // Prisma filter simulates returning only meetings in the 48h range.
      // If a meeting is 72h out, Prisma findMany returns []
      prismaMock.meeting.findMany.mockResolvedValue([]);

      const result = await service.handleVotingDeadlineReminders();
      expect(result.meetingsChecked).toBe(0);
      expect(prismaMock.unit.findMany).not.toHaveBeenCalled();
    });

    it('квартира, проголосовавшая по ВСЕМ вопросам повестки, не считается незавершенной и не получает напоминание', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      // Unit voted on both agenda-1 and agenda-2
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-1',
          ownerships: [{ userId: 'user-voted-all' }],
          votes: [
            { agendaItemId: 'agenda-1' },
            { agendaItemId: 'agenda-2' },
          ],
        },
      ]);

      const result = await service.handleVotingDeadlineReminders();

      expect(result.meetingsChecked).toBe(1);
      expect(result.unitsIncomplete).toBe(0);
      expect(result.remindersSent).toBe(0);
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
    });

    it('квартира, проголосовавшая лишь ЧАСТИЧНО (1 из 2 вопросов), считается незавершенной и получает напоминание', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      // Unit voted ONLY on agenda-1, missing agenda-2
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-partially-voted',
          ownerships: [{ userId: 'user-partial' }],
          votes: [
            { agendaItemId: 'agenda-1' },
          ],
        },
      ]);

      const result = await service.handleVotingDeadlineReminders();

      expect(result.meetingsChecked).toBe(1);
      expect(result.unitsIncomplete).toBe(1);
      expect(result.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'user-partial',
        expect.objectContaining({
          title: expect.stringContaining('Годовой отчет ОСИ 2026'),
          body: expect.stringContaining('ч.'),
          data: {
            type: 'VOTING_REMINDER',
            meetingId: 'meeting-1',
          },
        }),
      );
    });

    it('квартира с 0 голосов считается незавершенной и получает напоминание', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-no-votes',
          ownerships: [{ userId: 'user-silent' }],
          votes: [],
        },
      ]);

      const result = await service.handleVotingDeadlineReminders();

      expect(result.unitsIncomplete).toBe(1);
      expect(result.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-silent', expect.anything());
    });

    it('арендаторы (TENANT) и неподтвержденные пользователи не включаются в напоминания (только подтвержденные OWNER)', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);
      prismaMock.unit.findMany.mockResolvedValue([]);

      await service.handleVotingDeadlineReminders();

      // Verify unit query strictly filters ownershipType: OWNER and isVerified: true
      expect(prismaMock.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerships: {
              some: {
                isVerified: true,
                ownershipType: OwnershipType.OWNER,
              },
            },
          }),
          include: expect.objectContaining({
            ownerships: {
              where: {
                isVerified: true,
                ownershipType: OwnershipType.OWNER,
              },
              select: { userId: true },
            },
          }),
        }),
      );
    });

    it('при наличии нескольких собственников у квартиры (сособственники) напоминание отправляется ВСЕМ собственникам', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-multi-owner',
          ownerships: [
            { userId: 'owner-1' },
            { userId: 'owner-2' },
          ],
          votes: [],
        },
      ]);

      const result = await service.handleVotingDeadlineReminders();

      expect(result.unitsIncomplete).toBe(1);
      expect(result.remindersSent).toBe(2);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('owner-1', expect.anything());
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('owner-2', expect.anything());
    });

    it('повторный вызов крона не спамит пользователей (дебаунс через Redis на 30 дней)', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-debounce',
          ownerships: [{ userId: 'user-debounce' }],
          votes: [],
        },
      ]);

      // First cron run: should send reminder and set Redis key
      const result1 = await service.handleVotingDeadlineReminders();
      expect(result1.remindersSent).toBe(1);
      expect(result1.skippedAlreadyReminded).toBe(0);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);
      expect(redisServiceMock.set).toHaveBeenCalledWith(
        'voting:reminder:meeting-1:user-debounce',
        '1',
        30 * 24 * 60 * 60,
      );

      // Second cron run (e.g. next day tick while still in 48h window): should skip
      const result2 = await service.handleVotingDeadlineReminders();
      expect(result2.remindersSent).toBe(0);
      expect(result2.skippedAlreadyReminded).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('ошибка отправки push одному пользователю не прерывает отправку остальным (изоляция сбоев)', async () => {
      prismaMock.meeting.findMany.mockResolvedValue([mockMeeting]);

      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'unit-error-isolation',
          ownerships: [
            { userId: 'failing-user' },
            { userId: 'success-user' },
          ],
          votes: [],
        },
      ]);

      notificationsServiceMock.sendToUser.mockImplementation((userId: string) => {
        if (userId === 'failing-user') {
          return Promise.reject(new Error('FCM connection error'));
        }
        return Promise.resolve({ sent: 1 });
      });

      const result = await service.handleVotingDeadlineReminders();

      expect(result.unitsIncomplete).toBe(1);
      expect(result.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('failing-user', expect.anything());
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('success-user', expect.anything());
    });

    it('собрание без вопросов повестки (agendaItems = []) безопасно пропускается', async () => {
      const emptyMeeting = {
        ...mockMeeting,
        agendaItems: [],
      };
      prismaMock.meeting.findMany.mockResolvedValue([emptyMeeting]);

      const result = await service.handleVotingDeadlineReminders();

      expect(result.meetingsChecked).toBe(1);
      expect(result.unitsIncomplete).toBe(0);
      expect(result.remindersSent).toBe(0);
      expect(prismaMock.unit.findMany).not.toHaveBeenCalled();
    });
  });
});
