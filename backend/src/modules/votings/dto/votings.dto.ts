import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsArray, ValidateNested, IsOptional, IsDateString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { DecisionType, VoteChoice } from '@prisma/client';

export class CreateAgendaItemDto {
  @ApiProperty({ example: 1 })
  orderIndex: number;

  @ApiProperty({ example: 'Утвердить смету расходов ОСИ на 2026-2027 годы' })
  question: string;

  @ApiProperty({ example: 'Размер тарифа 110 тг/кв.м', required: false })
  description?: string;

  @ApiProperty({ enum: DecisionType, default: DecisionType.SIMPLE_MAJORITY })
  decisionType: DecisionType;

  @ApiProperty({ example: ['https://storage.shanyraq.kz/docs/smeta_2026.pdf'], required: false })
  documentUrls?: string[];
}

export class CreateMeetingDto {
  @ApiProperty({ example: 'tenant-uuid' })
  tenantId: string;

  @ApiProperty({ example: 'Годовое общее собрание собственников квартир ЖК «Шаңырақ»' })
  title: string;

  @ApiProperty({ example: 'Обсуждение тарифа и утверждение состава совета дома', required: false })
  description?: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  startDate: string;

  @ApiProperty({ example: '2026-10-15T23:59:59.000Z' })
  endDate: string;

  @ApiProperty({ type: [CreateAgendaItemDto] })
  agendaItems: CreateAgendaItemDto[];
}

export class CastVoteDto {
  @ApiProperty({ description: 'ID вопроса повестки дня' })
  agendaItemId: string;

  @ApiProperty({ description: 'ID квартиры/помещения от которого голосует собственник' })
  unitId: string;

  @ApiProperty({ enum: VoteChoice, example: VoteChoice.FOR })
  choice: VoteChoice;

  @ApiProperty({ example: '1234', description: 'SMS OTP код для подтверждения подписи голоса' })
  otpCode?: string;
}
