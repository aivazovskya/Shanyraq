import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../uploads/uploads.service';
import { UploadCategory } from '../uploads/dto/uploads.dto';
import { CreateMeetingDto, CastVoteDto } from './dto/votings.dto';
import { MeetingStatus, OwnershipType, VoteChoice, DecisionType, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import {
  createPdfBuffer,
  drawHeader,
  drawSectionTitle,
  drawTable,
  drawFooter,
  TableColumn,
} from '../../common/pdf/pdf-document.helper';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { buildCsv } from '../../common/csv/csv.helper';

const VOTE_FULL_ROSTER_ROLES: UserRole[] = [
  UserRole.SUPERADMIN,
  UserRole.HOA_ADMIN,
  UserRole.HOA_CHAIRMAN,
];

@Injectable()
export class VotingsService {
  private readonly voteSigningKey: string;

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private configService: ConfigService,
    private uploadsService: UploadsService,
  ) {
    this.voteSigningKey = this.configService.get<string>('VOTE_SIGNING_KEY');
    if (!this.voteSigningKey) {
      throw new Error(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: VOTE_SIGNING_KEY не задан для цифровой подписи голосов ОСС!',
      );
    }
  }

  async createMeeting(creatorTenantId: string, dto: CreateMeetingDto) {
    // Безопасность: доверяем только tenantId, авторизованному контроллером (предотвращение IDOR/cross-tenant инъекции)
    const targetTenantId = creatorTenantId;
    if (!targetTenantId) {
      throw new BadRequestException({
        code: 'VOTINGS.TENANT_ID_REQUIRED',
        message: 'Не указан идентификатор жилого комплекса',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: targetTenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'VOTINGS.TENANT_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    // Аудит безопасности: категорический запрет фиктивной площади
    if (!tenant.totalArea || tenant.totalArea <= 0) {
      throw new BadRequestException({
        code: 'VOTINGS.ZERO_TOTAL_AREA',
        message:
          'Невозможно инициировать собрание ОСС: суммарная площадь помещений ЖК не рассчитана или равна 0. ' +
          'Сначала внесите жилой фонд (дома и квартиры с площадями в кв.м) в систему.',
      });
    }

    return this.prisma.meeting.create({
      data: {
        tenantId: targetTenantId,
        title: dto.title,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: MeetingStatus.ACTIVE,
        totalEligibleArea: tenant.totalArea,
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

    return Promise.all(meetings.map((m) => this.enrichMeetingWithResults(m, null)));
  }

  async getMeetingDetails(meetingId: string, requestingUser?: { id: string; role: UserRole; tenantId?: string | null }) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        tenant: true,
        agendaItems: {
          include: {
            votes: {
              include: {
                unit: {
                  include: {
                    building: true,
                  },
                },
                user: {
                  select: { id: true, firstName: true, lastName: true, phone: true },
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
      throw new NotFoundException({
        code: 'VOTINGS.MEETING_NOT_FOUND',
        message: 'Собрание ОСС не найдено',
      });
    }

    // Аудит безопасности (Tenant isolation): проверка принадлежности собрания к ЖК пользователя
    if (requestingUser) {
      assertUserBelongsToTenant(requestingUser, meeting.tenantId, {
        code: 'VOTINGS.CROSS_TENANT_FORBIDDEN',
        message: 'Доступ к собранию другого жилого комплекса запрещен',
      });
    }

    return this.enrichMeetingWithResults(meeting, requestingUser);
  }

  async castVote(userId: string, dto: CastVoteDto, clientMeta?: { ip?: string; userAgent?: string }) {
    // 1. Verify user exists and retrieve phone for OTP verification
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'VOTINGS.USER_NOT_FOUND_OR_BLOCKED',
        message: 'Пользователь не найден или заблокирован',
      });
    }

    // 2. Verify agenda item & active meeting
    const agendaItem = await this.prisma.agendaItem.findUnique({
      where: { id: dto.agendaItemId },
      include: { meeting: true },
    });

    if (!agendaItem) {
      throw new NotFoundException({
        code: 'VOTINGS.AGENDA_ITEM_NOT_FOUND',
        message: 'Вопрос повестки дня не найден',
      });
    }

    if (agendaItem.meeting.status !== MeetingStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'VOTINGS.MEETING_NOT_ACTIVE',
        message: 'Голосование по данному собранию не активно',
      });
    }

    const now = new Date();
    if (now < agendaItem.meeting.startDate || now > agendaItem.meeting.endDate) {
      throw new BadRequestException({
        code: 'VOTINGS.OUTSIDE_VOTING_PERIOD',
        message: 'Срок проведения голосования истек или еще не начался',
      });
    }

    // 3. Verify ownership and right to vote (only verified OWNER can vote under RK law)
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId,
        unitId: dto.unitId,
        ownershipType: OwnershipType.OWNER,
        isVerified: true,
      },
      include: {
        unit: {
          include: {
            building: true,
          },
        },
      },
    });

    if (!ownership) {
      throw new ForbiddenException({
        code: 'VOTINGS.NOT_ELIGIBLE_VOTER',
        message:
          'Право голоса на ОСС имеют только подтвержденные собственники помещения. ' +
          'Арендаторы и неподтвержденные пользователи голосовать не могут.',
      });
    }

    // 4. Verify that unit belongs to the meeting's tenant
    if (ownership.unit.building.tenantId !== agendaItem.meeting.tenantId) {
      throw new ForbiddenException({
        code: 'VOTINGS.UNIT_TENANT_MISMATCH',
        message: 'Помещение не принадлежит жилому комплексу, в котором проводится собрание',
      });
    }

    // 5. Check for duplicate vote by this unit for this agenda item
    const existingVote = await this.prisma.vote.findUnique({
      where: {
        agendaItemId_unitId: {
          agendaItemId: dto.agendaItemId,
          unitId: dto.unitId,
        },
      },
    });

    if (existingVote) {
      throw new BadRequestException({
        code: 'VOTINGS.ALREADY_VOTED',
        message: 'Голос от данной квартиры по этому вопросу уже был учтен ранее',
      });
    }

    // 6. Аудит безопасности: обязательная криптографическая проверка SMS-OTP кода
    await this.authService.verifyVoteOtp(user.phone, dto.otpCode);

    // 7. Calculate vote weight in accordance with RK Law (area * ownership share)
    const areaWeight = parseFloat(((ownership.unit.area * ownership.sharePercent) / 100).toFixed(2));

    // 8. Generate HMAC-SHA256 cryptographic signature using server signing key
    const timestamp = new Date().toISOString();
    const payloadToSign = `${userId}:${agendaItem.meetingId}:${dto.agendaItemId}:${dto.unitId}:${dto.choice}:${areaWeight}:${timestamp}`;
    const voteHash = crypto
      .createHmac('sha256', this.voteSigningKey)
      .update(payloadToSign)
      .digest('hex');

    const vote = await this.prisma.vote.create({
      data: {
        agendaItemId: dto.agendaItemId,
        userId,
        unitId: dto.unitId,
        choice: dto.choice,
        areaWeight,
        voteHash,
        otpVerified: true, // Истинно проверен через verifyVoteOtp
        ipAddress: clientMeta?.ip || '127.0.0.1',
        userAgent: clientMeta?.userAgent || 'Shanyraq-Mobile/1.0',
      },
    });

    // Update real-time quorum on meeting
    await this.updateMeetingQuorum(agendaItem.meetingId);

    return {
      success: true,
      message: 'Ваш голос успешно принят, подписан криптографическим отпечатком и зафиксирован в протоколе',
      vote: {
        id: vote.id,
        choice: vote.choice,
        areaWeight: vote.areaWeight,
        voteHash: vote.voteHash,
        createdAt: vote.createdAt,
      },
    };
  }

  async closeMeetingAndGenerateProtocol(
    meetingId: string,
    closingUser: { id: string; role: UserRole; tenantId?: string | null },
  ) {
    const enriched = await this.getMeetingDetails(meetingId, closingUser);

    // Close meeting
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.COMPLETED },
    });

    // Fetch tenant details for document header
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: enriched.tenantId },
    });

    // Generate Protocol Number (e.g. ОСС-2026/03)
    const protocolNumber = `ОСС-${new Date().getFullYear()}/${meetingId.slice(0, 6).toUpperCase()}`;

    // Build real PDF document
    const pdfBuffer = await this.buildMeetingProtocolPdf(enriched, tenant, protocolNumber);

    // Upload generated PDF to S3/MinIO in shanyraq-documents bucket
    const file: Express.Multer.File = {
      buffer: pdfBuffer,
      mimetype: 'application/pdf',
      originalname: `protocol_${meetingId.slice(0, 8)}.pdf`,
      size: pdfBuffer.length,
      fieldname: 'file',
      encoding: '7bit',
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const uploadResult = await this.uploadsService.uploadFile(file, UploadCategory.DOCUMENT);

    const protocol = await this.prisma.meetingProtocol.upsert({
      where: { meetingId },
      create: {
        meetingId,
        protocolNumber,
        isSigned: true,
        pdfUrl: uploadResult.url,
      },
      update: {
        isSigned: true,
        pdfUrl: uploadResult.url,
      },
    });

    return {
      meeting: enriched,
      protocol,
    };
  }

  private async buildMeetingProtocolPdf(
    meeting: any,
    tenant: any,
    protocolNumber: string,
  ): Promise<Buffer> {
    const formatDate = (date: Date | string) => {
      const d = new Date(date);
      return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    return createPdfBuffer((doc) => {
      // 1. Header
      const headerY = drawHeader(doc, {
        title: 'ПРОТОКОЛ ОБЩЕГО СОБРАНИЯ СОБСТВЕННИКОВ',
        subtitle: `№ ${protocolNumber} от ${formatDate(new Date())}`,
        meta: [
          { label: 'Жилой комплекс', value: tenant?.name || 'Жилой комплекс' },
          { label: 'Адрес', value: tenant?.address || 'Не указан' },
          { label: 'Тема собрания', value: meeting.title },
          {
            label: 'Период проведения',
            value: `${formatDate(meeting.startDate)} — ${formatDate(meeting.endDate)}`,
          },
        ],
      });

      // 2. Quorum section
      drawSectionTitle(doc, '1. Сведения о кворуме и правомочности собрания', headerY);

      const q = meeting.quorum || {};
      const quorumText =
        `Общая площадь помещений ЖК: ${q.totalEligibleArea ?? 0} м²\n` +
        `Площадь помещений участников, принявших участие: ${q.totalVotedArea ?? 0} м² (${q.quorumPercent ?? 0}%)\n` +
        `Количество принявших участие помещений (квартир/паркингов): ${q.participatedUnitsCount ?? 0}\n` +
        `ИТОГ КВОРУМА: ${
          q.isQuorumAchieved
            ? 'КВОРУМ ИМЕЕТСЯ. Собрание правомочно принимать решения.'
            : 'КВОРУМ НЕ НАБРАН. Собрание неправомочно.'
        }`;

      doc.font('DejaVuSans').fontSize(9).fillColor('#1E293B').text(quorumText, {
        lineGap: 3,
      });

      doc.moveDown(0.8);

      // 3. Agenda and results table
      drawSectionTitle(doc, '2. Повестка дня и принятые решения');

      const columns: TableColumn[] = [
        { header: '№', width: 25, align: 'center' },
        { header: 'Вопрос повестки дня', width: 215, align: 'left' },
        { header: 'Тип решения', width: 95, align: 'center' },
        { header: 'Итоги голосования', width: 100, align: 'left' },
        { header: 'Решение', width: 80, align: 'center' },
      ];

      const rows = (meeting.agendaItems || []).map((item: any) => {
        const r = item.results || {};
        const decisionTypeLabel =
          item.decisionType === DecisionType.SIMPLE_MAJORITY
            ? 'Простое (>50% голосов)'
            : 'Квалиф. (≥2/3 от ЖК)';

        const voteBreakdown =
          `За: ${r.forPercentFromVoted ?? 0}%\n` +
          `Против: ${r.areaAgainst ?? 0} м²\n` +
          `Воздерж.: ${r.areaAbstain ?? 0} м²`;

        const statusLabel = r.isApproved ? 'ПРИНЯТО' : 'ОТКЛОНЕНО';

        return [
          item.orderIndex,
          item.question,
          decisionTypeLabel,
          voteBreakdown,
          statusLabel,
        ];
      });

      drawTable(doc, { columns, rows });

      // 4. Signatures and legal validity note
      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) {
        doc.addPage();
      }

      drawSectionTitle(doc, '3. Заключительные положения и подписи');
      doc
        .font('DejaVuSans')
        .fontSize(8.5)
        .fillColor('#475569')
        .text(
          'Голоса собственников зафиксированы в электронном виде, верифицированы посредством SMS-OTP ' +
            'и защищены криптографическими сигнатурами HMAC-SHA256 в соответствии с регламентом платформы Shanyraq.',
          { lineGap: 2 },
        );

      doc.moveDown(1.2);

      const signY = doc.y;
      const colW =
        (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;

      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B');
      doc.text('Председатель собрания:', doc.page.margins.left, signY);
      doc
        .font('DejaVuSans')
        .fontSize(9)
        .text(
          '____________________ / ____________________',
          doc.page.margins.left,
          signY + 16,
        );

      const rightX = doc.page.margins.left + colW + 20;
      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B');
      doc.text('Секретарь собрания:', rightX, signY);
      doc
        .font('DejaVuSans')
        .fontSize(9)
        .text('____________________ / ____________________', rightX, signY + 16);

      // Footer
      drawFooter(
        doc,
        `Протокол № ${protocolNumber} | Документ имеет юридическую силу в системе Shanyraq`,
      );
    });
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

  /**
   * Экспорт построчного (по каждому голосу) результата собрания в CSV.
   * Доступно только ролям из VOTE_FULL_ROSTER_ROLES — тем же, кому JSON API
   * уже показывает персональные данные голосовавших (enrichMeetingWithResults).
   */
  async exportMeetingVotesCsv(
    meetingId: string,
    user: { role: UserRole; tenantId?: string | null },
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!VOTE_FULL_ROSTER_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: 'VOTINGS.EXPORT_FORBIDDEN',
        message: 'Недостаточно прав для экспорта результатов голосования',
      });
    }

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { tenant: true },
    });

    if (!meeting) {
      throw new NotFoundException({
        code: 'VOTINGS.MEETING_NOT_FOUND',
        message: 'Собрание ОСС не найдено',
      });
    }

    assertUserBelongsToTenant(user, meeting.tenantId, {
      code: 'VOTINGS.CROSS_TENANT_FORBIDDEN',
      message: 'Доступ к собранию другого жилого комплекса запрещен',
    });

    const agendaItems = await this.prisma.agendaItem.findMany({
      where: { meetingId },
      include: {
        votes: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            unit: { include: { building: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    const choiceLabels: Record<VoteChoice, string> = {
      [VoteChoice.FOR]: 'За',
      [VoteChoice.AGAINST]: 'Против',
      [VoteChoice.ABSTAIN]: 'Воздержался',
    };

    const formatDate = (d: Date) =>
      d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const rows: unknown[][] = [
      ['Результаты голосования ОСС (построчно)'],
      ['Жилой комплекс', meeting.tenant?.name || 'Не указан'],
      ['Тема собрания', meeting.title],
      ['Период', `${formatDate(meeting.startDate)} — ${formatDate(meeting.endDate)}`],
      [],
      [
        '№ вопроса',
        'Вопрос повестки дня',
        'Житель (ФИО)',
        'Квартира/Помещение',
        'Блок/Подъезд',
        'Выбор',
        'Вес голоса (м²)',
        'Дата голосования',
        'Подпись (HMAC)',
      ],
    ];

    for (const item of agendaItems) {
      for (const vote of item.votes) {
        const voterFullName = vote.user
          ? `${vote.user.lastName || ''} ${vote.user.firstName || ''}`.trim() || '—'
          : '—';

        rows.push([
          item.orderIndex,
          item.question,
          voterFullName,
          vote.unit?.unitNumber || '',
          vote.unit?.building?.blockName || '',
          choiceLabels[vote.choice],
          vote.areaWeight,
          vote.createdAt.toISOString(),
          vote.voteHash,
        ]);
      }
    }

    const buffer = buildCsv(rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `voting-results-${meetingId}-${dateStr}.csv`;

    return { buffer, filename };
  }

  private enrichMeetingWithResults(
    meeting: any,
    requestingUser?: { id: string; role: UserRole; tenantId?: string | null },
  ) {
    const uniqueVotedUnitAreas = new Map<string, number>();

    // Determine if requester can view full personal voter identities
    const canViewFullRoster =
      requestingUser && VOTE_FULL_ROSTER_ROLES.includes(requestingUser.role);

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

      let isApproved = false;
      if (item.decisionType === DecisionType.SIMPLE_MAJORITY) {
        isApproved = forPercentFromVoted > 50.0;
      } else {
        isApproved = forPercentFromTotalHOA >= 66.67;
      }

      // Аудит безопасности: защита персональных данных участников ОСС
      // Если запрос от жильца, скрываем персональные данные других жильцов (ФИО, телефоны)
      let sanitizedVotes = undefined;
      let myVote = undefined;

      if (canViewFullRoster) {
        sanitizedVotes = item.votes;
      } else if (requestingUser) {
        // Житель видит только свой собственный голос
        myVote = item.votes?.find((v: any) => v.userId === requestingUser.id);
      }

      return {
        id: item.id,
        orderIndex: item.orderIndex,
        question: item.question,
        description: item.description,
        decisionType: item.decisionType,
        documentUrls: item.documentUrls,
        results: {
          areaFor: parseFloat(areaFor.toFixed(2)),
          areaAgainst: parseFloat(areaAgainst.toFixed(2)),
          areaAbstain: parseFloat(areaAbstain.toFixed(2)),
          totalItemVotedArea: parseFloat(totalItemVotedArea.toFixed(2)),
          forPercentFromVoted: parseFloat(forPercentFromVoted.toFixed(2)),
          forPercentFromTotalHOA: parseFloat(forPercentFromTotalHOA.toFixed(2)),
          isApproved,
        },
        votes: sanitizedVotes,
        myVote: myVote
          ? {
              choice: myVote.choice,
              areaWeight: myVote.areaWeight,
              voteHash: myVote.voteHash,
              createdAt: myVote.createdAt,
            }
          : undefined,
      };
    });

    const totalVotedArea = Array.from(uniqueVotedUnitAreas.values()).reduce((sum, w) => sum + w, 0);
    const quorumPercent = meeting.totalEligibleArea > 0 ? (totalVotedArea / meeting.totalEligibleArea) * 100 : 0;

    return {
      id: meeting.id,
      tenantId: meeting.tenantId,
      title: meeting.title,
      description: meeting.description,
      startDate: meeting.startDate,
      endDate: meeting.endDate,
      status: meeting.status,
      protocol: meeting.protocol,
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
