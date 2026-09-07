import { Test, TestingModule } from '@nestjs/testing';
import { VotingsService } from './votings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus, OwnershipType, VoteChoice, DecisionType } from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('VotingsService (Алгоритм голосований ОСС по законодательству РК)', () => {
  let service: VotingsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      meeting: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      agendaItem: {
        findUnique: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      vote: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      meetingProtocol: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<VotingsService>(VotingsService);
  });

  describe('castVote', () => {
    const mockMeeting = {
      id: 'meeting-123',
      tenantId: 'tenant-1',
      status: MeetingStatus.ACTIVE,
      startDate: new Date(Date.now() - 3600000), // 1 hour ago
      endDate: new Date(Date.now() + 86400000), // in 1 day
      totalEligibleArea: 1000.0, // 1000 м²
      quorumThresholdPercent: 50.0,
    };

    const mockAgendaItem = {
      id: 'agenda-1',
      meetingId: 'meeting-123',
      question: 'Утвердить смету расходов ОСИ',
      decisionType: DecisionType.SIMPLE_MAJORITY,
      meeting: mockMeeting,
    };

    it('должен блокировать голосование, если пользователь не является подтвержденным собственником (Закон РК)', async () => {
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      // Пользователь не является подтвержденным собственником (например, арендатор)
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.castVote('tenant-user-id', {
          agendaItemId: 'agenda-1',
          unitId: 'unit-42',
          choice: VoteChoice.FOR,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен корректно рассчитывать вес голоса пропорционально площади квартиры (кв.м) и фиксировать SHA-256 хэш', async () => {
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      
      // Собственник квартиры 75.5 м² со 100% долей
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        userId: 'owner-1',
        unitId: 'unit-42',
        ownershipType: OwnershipType.OWNER,
        sharePercent: 100.0,
        isVerified: true,
        unit: {
          id: 'unit-42',
          area: 75.5,
        },
      });

      prismaMock.vote.findUnique.mockResolvedValue(null); // еще не голосовал
      prismaMock.vote.create.mockImplementation((args) => Promise.resolve({ id: 'vote-1', ...args.data }));
      prismaMock.meeting.findUnique.mockResolvedValue({
        ...mockMeeting,
        agendaItems: [{ votes: [{ unitId: 'unit-42', areaWeight: 75.5 }] }],
      });

      const result = await service.castVote('owner-1', {
        agendaItemId: 'agenda-1',
        unitId: 'unit-42',
        choice: VoteChoice.FOR,
      });

      expect(result.success).toBe(true);
      expect(result.vote.areaWeight).toBe(75.5);
      expect(result.vote.choice).toBe(VoteChoice.FOR);
      expect(result.vote.voteHash).toBeDefined();
      expect(result.vote.voteHash.length).toBe(64); // SHA-256 hex length
    });

    it('должен запрещать повторное голосование от одной и той же квартиры по одному вопросу', async () => {
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        userId: 'owner-1',
        unitId: 'unit-42',
        ownershipType: OwnershipType.OWNER,
        sharePercent: 100.0,
        isVerified: true,
        unit: { id: 'unit-42', area: 75.5 },
      });

      // Имитация уже существующего голоса
      prismaMock.vote.findUnique.mockResolvedValue({ id: 'existing-vote-id' });

      await expect(
        service.castVote('owner-1', {
          agendaItemId: 'agenda-1',
          unitId: 'unit-42',
          choice: VoteChoice.AGAINST,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('enrichMeetingWithResults (Расчет кворума и большинства)', () => {
    it('должен признавать кворум состоявшимся, если суммарная площадь проголосовавших > 50%', async () => {
      // Общая площадь ЖК = 1000 м²
      // Проголосовали: кв 1 (300 м²), кв 2 (250 м²) -> Всего 550 м² (55.0% > 50%)
      const meetingData = {
        id: 'meeting-1',
        title: 'Собрание ОСИ',
        totalEligibleArea: 1000.0,
        quorumThresholdPercent: 50.0,
        agendaItems: [
          {
            id: 'item-1',
            question: 'Вопрос 1',
            decisionType: DecisionType.SIMPLE_MAJORITY,
            votes: [
              { unitId: 'unit-1', choice: VoteChoice.FOR, areaWeight: 300.0 },
              { unitId: 'unit-2', choice: VoteChoice.FOR, areaWeight: 250.0 },
            ],
          },
        ],
      };

      prismaMock.meeting.findUnique.mockResolvedValue(meetingData);

      const details = await service.getMeetingDetails('meeting-1');

      expect(details.quorum.totalEligibleArea).toBe(1000.0);
      expect(details.quorum.totalVotedArea).toBe(550.0);
      expect(details.quorum.quorumPercent).toBe(55.0);
      expect(details.quorum.isQuorumAchieved).toBe(true);
      expect(details.agendaItems[0].results.isApproved).toBe(true);
    });

    it('должен фиксировать отсутствие кворума, если проголосовало менее 50% площадей', async () => {
      // Общая площадь ЖК = 1000 м²
      // Проголосовала: кв 1 (400 м²) -> Всего 400 м² (40.0% <= 50%)
      const meetingData = {
        id: 'meeting-1',
        title: 'Собрание ОСИ',
        totalEligibleArea: 1000.0,
        quorumThresholdPercent: 50.0,
        agendaItems: [
          {
            id: 'item-1',
            question: 'Вопрос 1',
            decisionType: DecisionType.SIMPLE_MAJORITY,
            votes: [
              { unitId: 'unit-1', choice: VoteChoice.FOR, areaWeight: 400.0 },
            ],
          },
        ],
      };

      prismaMock.meeting.findUnique.mockResolvedValue(meetingData);

      const details = await service.getMeetingDetails('meeting-1');

      expect(details.quorum.quorumPercent).toBe(40.0);
      expect(details.quorum.isQuorumAchieved).toBe(false);
    });
  });
});
