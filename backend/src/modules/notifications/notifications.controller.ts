import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  RegisterDeviceDto,
  UnregisterDeviceDto,
  GetNotificationsQueryDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications (Push-уведомления)')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Получить настройки категорий уведомлений текущего пользователя' })
  async getPreferences(@CurrentUser('id') userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновить настройки категорий уведомлений текущего пользователя' })
  async updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(userId, dto);
  }

  @Post('register-device')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Зарегистрировать push-токен мобильного устройства жильца (Expo / FCM / APNs)' })
  async registerDevice(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.notificationsService.registerDevice(userId, dto);
  }

  @Post('unregister-device')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить push-токен устройства (при логауте)' })
  async unregisterDevice(@Body() dto: UnregisterDeviceDto) {
    return this.notificationsService.unregisterDevice(dto.token);
  }

  @Get()
  @ApiOperation({ summary: 'Получить историю уведомлений текущего пользователя' })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationsQueryDto,
  ) {
    return this.notificationsService.getNotifications(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Получить количество непрочитанных уведомлений' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Пометить все уведомления пользователя как прочитанные' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Пометить отдельное уведомление как прочитанное' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }
}
