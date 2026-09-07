import { Test, TestingModule } from '@nestjs/testing';
import { VotingsService } from './votings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { MeetingStatus, OwnershipType, VoteChoice, DecisionType, UserRole } from '@prisma/client';
import { ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('VotingsService (Аудит безопасности и алгоритм ОСС)', () => {
  let service: VotingsService;
  let prismaMock: any;
  let authServiceMock: any;
  let configServiceMock: any;

  const mockSigningKey = 'test_secret_hmac_signing_key_for_votes_2026';

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      user: {
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

    authServiceMock = {
      verifyVoteOtp: jest.fn().mockResolvedValue(true),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'VOTE_SIGNING_KEY') return mockSigningKey;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<VotingsService>(VotingsService);
  });

  describe('createMeeting (Защита от фиктивного кворума)', () => {
    it('должен блокировать создание собрания ОСС, если площадь ЖК равна 0 или не задана', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК Без площадей',
        totalArea: 0, // Не заполнена
      });

      await expect(
        service.createMeeting('tenant-1', {
          title: 'Собрание',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
          agendaItems: [
            {
              orderIndex: 1,
              question: 'Вопрос 1',
              decisionType: DecisionType.SIMPLE_MAJORITY,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('castVote (Безопасность волеизъявления и криптоподпись)', () => {
    const mockUser = {
      id: 'owner-1',
      phone: '+77015550101',
      isActive: true,
      role: UserRole.RESIDENT_OWNER,
    };

    const mockMeeting = {
      id: 'meeting-123',
      tenantId: 'tenant-1',
      status: MeetingStatus.ACTIVE,
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 86400000),
      totalEligibleArea: 1000.0,
      quorumThresholdPercent: 50.0,
    };

    const mockAgendaItem = {
      id: 'agenda-1',
      meetingId: 'meeting-123',
      question: 'Утвердить смету расходов ОСИ',
      decisionType: DecisionType.SIMPLE_MAJORITY,
      meeting: mockMeeting,
    };

    it('должен блокировать голосование, если пользователь не является подтвержденным собственником', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.castVote('owner-1', {
          agendaItemId: 'agenda-1',
          unitId: 'unit-42',
          choice: VoteChoice.FOR,
          otpCode: '849201',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен проверять SMS-OTP код и отклонять голос, если код неверный', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        userId: 'owner-1',
        unitId: 'unit-42',
        ownershipType: OwnershipType.OWNER,
        sharePercent: 100.0,
        isVerified: true,
        unit: {
          id: 'unit-42',
          area: 75.5,
          building: { tenantId: 'tenant-1' },
        },
      });

      authServiceMock.verifyVoteOtp.mockRejectedValue(new BadRequestException('Неверный SMS-код'));

      await expect(
        service.castVote('owner-1', {
          agendaItemId: 'agenda-1',
          unitId: 'unit-42',
          choice: VoteChoice.FOR,
          otpCode: '000000',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.vote.create).not.toHaveBeenCalled();
    });

    it('должен формировать криптографический HMAC-SHA256 отпечаток голоса при валидном OTP', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.agendaItem.findUnique.mockResolvedValue(mockAgendaItem);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        userId: 'owner-1',
        unitId: 'unit-42',
        ownershipType: OwnershipType.OWNER,
        sharePercent: 100.0,
        isVerified: true,
        unit: {
          id: 'unit-42',
          area: 75.5,
          building: { tenantId: 'tenant-1' },
        },
      });

      authServiceMock.verifyVoteOtp.mockResolvedValue(true);
      prismaMock.vote.findUnique.mockResolvedValue(null);
      prismaMock.vote.create.mockImplementation((args) => Promise.resolve({ id: 'vote-1', ...args.data }));
      prismaMock.meeting.findUnique.mockResolvedValue({
        ...mockMeeting,
        agendaItems: [{ votes: [{ unitId: 'unit-42', areaWeight: 75.5 }] }],
      });

      const result = await service.castVote('owner-1', {
        agendaItemId: 'agenda-1',
        unitId: 'unit-42',
        choice: VoteChoice.FOR,
        otpCode: '849201',
      });

      expect(result.success).toBe(true);
      expect(result.vote.areaWeight).toBe(75.5);
      expect(result.vote.voteHash).toBeDefined();
      expect(result.vote.voteHash.length).toBe(64); // HMAC-SHA256 hex length
      expect(authServiceMock.verifyVoteOtp).toHaveBeenCalledWith(mockUser.phone, '849201');
    });
  });

  describe('getMeetingDetails (Tenant Isolation и защита ПДн)', () => {
    const meetingData = {
      id: 'meeting-1',
      tenantId: 'tenant-1',
      title: 'Собрание ОСИ',
      totalEligibleArea: 1000.0,
      quorumThresholdPercent: 50.0,
      agendaItems: [
        {
          id: 'item-1',
          question: 'Вопрос 1',
          decisionType: DecisionType.SIMPLE_MAJORITY,
          votes: [
            {
              unitId: 'unit-1',
              userId: 'owner-1',
              choice: VoteChoice.FOR,
              areaWeight: 300.0,
              user: { firstName: 'Иван', lastName: 'Иванов', phone: '+77011112233' },
            },
            {
              unitId: 'unit-2',
              userId: 'owner-2',
              choice: VoteChoice.FOR,
              areaWeight: 250.0,
              user: { firstName: 'Петр', lastName: 'Петров', phone: '+77012223344' },
            },
          ],
        },
      ],
    };

    it('должен блокировать доступ жителя к собранию чужого ЖК (BOLA)', async () => {
      prismaMock.meeting.findUnique.mockResolvedValue(meetingData);

      await expect(
        service.getMeetingDetails('meeting-1', {
          id: 'alien-user',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-OTHER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен скрывать персональные данные других жильцов при запросе от жителя своего ЖК', async () => {
      prismaMock.meeting.findUnique.mockResolvedValue(meetingData);

      const details = await service.getMeetingDetails('meeting-1', {
        id: 'owner-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      });

      // votes list should be undefined for residents
      expect(details.agendaItems[0].votes).toBeUndefined();
      // but their own vote should be visible
      expect(details.agendaItems[0].myVote).toBeDefined();
      expect(details.agendaItems[0].myVote.choice).toBe(VoteChoice.FOR);
      // and aggregated quorum results are visible
      expect(details.quorum.isQuorumAchieved).toBe(true);
      expect(details.quorum.totalVotedArea).toBe(550.0);
    });

    it('должен предоставлять полный реестр голосов председателю ОСИ и УК', async () => {
      prismaMock.meeting.findUnique.mockResolvedValue(meetingData);

      const details = await service.getMeetingDetails('meeting-1', {
        id: 'chairman-1',
        role: UserRole.HOA_CHAIRMAN,
        tenantId: 'tenant-1',
      });

      expect(details.agendaItems[0].votes).toBeDefined();
      expect(details.agendaItems[0].votes.length).toBe(2);
    });
  });
});
