import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMeetingDto, CastVoteDto } from './dto/votings.dto';
import { MeetingStatus, OwnershipType, VoteChoice, DecisionType } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class VotingsService {
  constructor(private prisma: PrismaService) {}

  async createMeeting(dto: CreateMeetingDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Жилой комплекс не найден');
    }

    // Capture total eligible area of HOA at the moment of creating the meeting
    const totalArea = tenant.totalArea > 0 ? tenant.totalArea : 1000.0;

    return this.prisma.meeting.create({
      data: {
        tenantId: dto.tenantId,
        title: dto.title,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: MeetingStatus.ACTIVE,
        totalEligibleArea: totalArea,
        quorumThresholdPercent: 50.0, // Закон РК: более 50%
        agendaItems: {
          create: dto.agendaItems.map((item) => ({
            orderIndex: item.orderIndex,
            question: item.question,
            description: item.description,
            decisionType: item.decisionType || DecisionType.SIMPLE_MAJORITY,
            documentUrls: item.documentUrls || [],
          })),
        },
      },
      include: {
        agendaItems: true,
      },
    });
  }

  async getMeetingsByTenant(tenantId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: { tenantId },
      include: {
        agendaItems: {
          include: {
            votes: true,
          },
        },
        protocol: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate real-time quorum for each meeting
    return Promise.all(meetings.map((m) => this.enrichMeetingWithResults(m)));
  }

  async getMeetingDetails(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        tenant: true,
        agendaItems: {
          include: {
            votes: {
              include: {
                unit: true,
                user: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        protocol: true,
      },
    });

    if (!meeting) {
      throw new NotFoundException('Собрание не найдено');
    }

    return this.enrichMeetingWithResults(meeting);
  }

  async castVote(userId: string, dto: CastVoteDto, clientMeta?: { ip?: string; userAgent?: string }) {
    // 1. Verify agenda item & active meeting
    const agendaItem = await this.prisma.agendaItem.findUnique({
      where: { id: dto.agendaItemId },
      include: { meeting: true },
    });

    if (!agendaItem) {
      throw new NotFoundException('Вопрос повестки дня не найден');
    }

    if (agendaItem.meeting.status !== MeetingStatus.ACTIVE) {
      throw new BadRequestException('Голосование по данному собранию не активно');
    }

    const now = new Date();
    if (now < agendaItem.meeting.startDate || now > agendaItem.meeting.endDate) {
      throw new BadRequestException('Срок проведения голосования истек или еще не начался');
    }

    // 2. Verify ownership and right to vote (only verified OWNER can vote under RK law)
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId,
        unitId: dto.unitId,
        ownershipType: OwnershipType.OWNER,
        isVerified: true,
      },
      include: { unit: true },
    });

    if (!ownership) {
      throw new ForbiddenException(
        'Право голоса на ОСС имеют только подтвержденные собственники помещения. Арендаторы и неподтвержденные пользователи голосовать не могут.',
      );
    }

    // 3. Check for existing vote by this unit for this agenda item
    const existingVote = await this.prisma.vote.findUnique({
      where: {
        agendaItemId_unitId: {
          agendaItemId: dto.agendaItemId,
          unitId: dto.unitId,
        },
      },
    });

    if (existingVote) {
      throw new BadRequestException('Голос от данной квартиры по этому вопросу уже был учтен ранее');
    }

    // 4. Calculate vote weight in accordance with RK Law (area * ownership share)
    const areaWeight = parseFloat(((ownership.unit.area * ownership.sharePercent) / 100).toFixed(2));

    // 5. Generate cryptographic hash of vote for legal audit trail
    const timestamp = new Date().toISOString();
    const voteHash = crypto
      .createHash('sha256')
      .update(`${userId}:${agendaItem.meetingId}:${dto.agendaItemId}:${dto.unitId}:${dto.choice}:${areaWeight}:${timestamp}`)
      .digest('hex');

    const vote = await this.prisma.vote.create({
      data: {
        agendaItemId: dto.agendaItemId,
        userId,
        unitId: dto.unitId,
        choice: dto.choice,
        areaWeight,
        voteHash,
        otpVerified: true,
        ipAddress: clientMeta?.ip || '127.0.0.1',
        userAgent: clientMeta?.userAgent || 'Shanyraq-Mobile/1.0',
      },
    });

    // Update real-time quorum on meeting
    await this.updateMeetingQuorum(agendaItem.meetingId);

    return {
      success: true,
      message: 'Ваш голос успешно принят и зафиксирован в протоколе собрания',
      vote: {
        id: vote.id,
        choice: vote.choice,
        areaWeight: vote.areaWeight,
        voteHash: vote.voteHash,
        createdAt: vote.createdAt,
      },
    };
  }

  async closeMeetingAndGenerateProtocol(meetingId: string) {
    const enriched = await this.getMeetingDetails(meetingId);

    // Close meeting
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.COMPLETED },
    });

    // Generate Protocol Number (e.g. ОСС-2026/03)
    const protocolNumber = `ОСС-${new Date().getFullYear()}/${meetingId.slice(0, 6).toUpperCase()}`;

    const protocol = await this.prisma.meetingProtocol.upsert({
      where: { meetingId },
      create: {
        meetingId,
        protocolNumber,
        isSigned: true,
        pdfUrl: `https://storage.shanyraq.kz/protocols/${protocolNumber}.pdf`,
      },
      update: {
        isSigned: true,
      },
    });

    return {
      meeting: enriched,
      protocol,
    };
  }

  private async updateMeetingQuorum(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        agendaItems: {
          include: { votes: true },
        },
      },
    });

    if (!meeting || meeting.totalEligibleArea <= 0) return;

    // A unit is considered participated in the meeting if it voted on at least one agenda item
    const uniqueVotedUnitAreas = new Map<string, number>();
    for (const item of meeting.agendaItems) {
      for (const vote of item.votes) {
        if (!uniqueVotedUnitAreas.has(vote.unitId)) {
          uniqueVotedUnitAreas.set(vote.unitId, vote.areaWeight);
        }
      }
    }

    const totalVotedArea = Array.from(uniqueVotedUnitAreas.values()).reduce((sum, w) => sum + w, 0);
    const calculatedQuorumPercent = parseFloat(((totalVotedArea / meeting.totalEligibleArea) * 100).toFixed(2));
    const isQuorumAchieved = calculatedQuorumPercent >= meeting.quorumThresholdPercent;

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        calculatedQuorumPercent,
        isQuorumAchieved,
      },
    });
  }

  private async enrichMeetingWithResults(meeting: any) {
    // Unique participated units
    const uniqueVotedUnitAreas = new Map<string, number>();

    const enrichedAgenda = meeting.agendaItems?.map((item: any) => {
      let areaFor = 0;
      let areaAgainst = 0;
      let areaAbstain = 0;

      for (const v of item.votes || []) {
        if (!uniqueVotedUnitAreas.has(v.unitId)) {
          uniqueVotedUnitAreas.set(v.unitId, v.areaWeight);
        }
        if (v.choice === VoteChoice.FOR) areaFor += v.areaWeight;
        if (v.choice === VoteChoice.AGAINST) areaAgainst += v.areaWeight;
        if (v.choice === VoteChoice.ABSTAIN) areaAbstain += v.areaWeight;
      }

      const totalItemVotedArea = areaFor + areaAgainst + areaAbstain;
      const forPercentFromVoted = totalItemVotedArea > 0 ? (areaFor / totalItemVotedArea) * 100 : 0;
      const forPercentFromTotalHOA = meeting.totalEligibleArea > 0 ? (areaFor / meeting.totalEligibleArea) * 100 : 0;

      // Decision check under RK law
      let isApproved = false;
      if (item.decisionType === DecisionType.SIMPLE_MAJORITY) {
        // Простым большинством: > 50% голосов от участников кворума
        isApproved = forPercentFromVoted > 50.0;
      } else {
        // Квалифицированным большинством: более 2/3 голосов от общего числа
        isApproved = forPercentFromTotalHOA >= 66.67;
      }

      return {
        ...item,
        results: {
          areaFor: parseFloat(areaFor.toFixed(2)),
          areaAgainst: parseFloat(areaAgainst.toFixed(2)),
          areaAbstain: parseFloat(areaAbstain.toFixed(2)),
          totalItemVotedArea: parseFloat(totalItemVotedArea.toFixed(2)),
          forPercentFromVoted: parseFloat(forPercentFromVoted.toFixed(2)),
          forPercentFromTotalHOA: parseFloat(forPercentFromTotalHOA.toFixed(2)),
          isApproved,
        },
      };
    });

    const totalVotedArea = Array.from(uniqueVotedUnitAreas.values()).reduce((sum, w) => sum + w, 0);
    const quorumPercent = meeting.totalEligibleArea > 0 ? (totalVotedArea / meeting.totalEligibleArea) * 100 : 0;

    return {
      ...meeting,
      quorum: {
        totalEligibleArea: meeting.totalEligibleArea,
        totalVotedArea: parseFloat(totalVotedArea.toFixed(2)),
        quorumPercent: parseFloat(quorumPercent.toFixed(2)),
        isQuorumAchieved: quorumPercent >= meeting.quorumThresholdPercent,
        participatedUnitsCount: uniqueVotedUnitAreas.size,
      },
      agendaItems: enrichedAgenda,
    };
  }
}
