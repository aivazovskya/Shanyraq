import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'tenant-uuid', required: false, description: 'ID ЖК (для суперадмина; для сотрудников УК берется из токена)' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'Плановое отключение горячего водоснабжения' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'В связи с гидравлическими испытаниями с 10:00 до 18:00 будет отключена горячая вода.' })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty({ example: true, default: false, description: 'Срочное уведомление (отправляется Push-сообщением)' })
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;
}
