import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, Length, IsOptional } from 'class-validator';
import { DecisionType, VoteChoice } from '@prisma/client';

export class CreateAgendaItemDto {
  @ApiProperty({ example: 1 })
  orderIndex: number;

  @ApiProperty({ example: 'Утвердить смету расходов ОСИ на 2026-2027 годы' })
  @IsNotEmpty()
  @IsString()
  question: string;

  @ApiProperty({ example: 'Размер тарифа 110 тг/кв.м', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DecisionType, default: DecisionType.SIMPLE_MAJORITY })
  @IsEnum(DecisionType)
  decisionType: DecisionType;

  @ApiProperty({ example: ['https://storage.shanyraq.kz/docs/smeta_2026.pdf'], required: false })
  @IsOptional()
  documentUrls?: string[];
}

export class CreateMeetingDto {
  @ApiProperty({ example: 'tenant-uuid', required: false, description: 'ID ЖК (для супер-админа; для УК берется из профиля)' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'Годовое общее собрание собственников квартир ЖК «Шаңырақ»' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Обсуждение тарифа и утверждение состава совета дома', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({ example: '2026-10-15T23:59:59.000Z' })
  @IsNotEmpty()
  @IsString()
  endDate: string;

  @ApiProperty({ type: [CreateAgendaItemDto] })
  @IsNotEmpty()
  agendaItems: CreateAgendaItemDto[];
}

export class CastVoteDto {
  @ApiProperty({ description: 'ID вопроса повестки дня' })
  @IsNotEmpty()
  @IsString()
  agendaItemId: string;

  @ApiProperty({ description: 'ID квартиры/помещения от которого голосует собственник' })
  @IsNotEmpty()
  @IsString()
  unitId: string;

  @ApiProperty({ enum: VoteChoice, example: VoteChoice.FOR })
  @IsEnum(VoteChoice)
  choice: VoteChoice;

  @ApiProperty({ example: '849201', description: 'Обязательный 6-значный SMS OTP код для подписания волеизъявления' })
  @IsNotEmpty({ message: 'Для юридической фиксации голоса на ОСС обязателен код подтверждения из SMS' })
  @IsString()
  @Length(6, 6, { message: 'SMS-код подтверждения должен состоять ровно из 6 цифр' })
  otpCode: string;
}
