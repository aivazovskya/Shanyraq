import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto, LoginPasswordDto, RefreshTokenDto, SetPinDto, ResetPinConfirmDto, SetInitialPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth (Аутентификация)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Запросить 6-значный SMS-код для входа жильца (лимит: 1 раз в 60 сек)' })
  @ApiResponse({ status: 200, description: 'SMS-код отправлен' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Подтвердить SMS-код и получить пару токенов (access + refresh)' })
  @ApiResponse({ status: 200, description: 'Успешная авторизация' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('login-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход по паролю (для УК, председателя ОСИ, диспетчера, охраны)' })
  @ApiResponse({ status: 200, description: 'Успешный вход' })
  async loginWithPassword(@Body() dto: LoginPasswordDto) {
    return this.authService.loginWithPassword(dto);
  }

  @Post('set-initial-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Установить постоянный пароль по одноразовому токену смены пароля' })
  @ApiResponse({ status: 200, description: 'Пароль успешно установлен, возвращены токены сессии' })
  async setInitialPassword(@Body() dto: SetInitialPasswordDto) {
    return this.authService.setInitialPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновить access-токен с помощью refresh-токена' })
  @ApiResponse({ status: 200, description: 'Пара токенов успешно обновлена' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить профиль текущего пользователя и его объекты' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выйти из системы и отозвать все выданные токены сессии' })
  @ApiResponse({ status: 200, description: 'Успешный выход из системы' })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('pin/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Проверить статус установки PIN-кода доступа (СКУД)' })
  @ApiResponse({ status: 200, description: 'Статус PIN-кода ({ isPinSet: boolean })' })
  async getPinStatus(@CurrentUser('id') userId: string) {
    return this.authService.getPinStatus(userId);
  }

  @Post('pin/set')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Установить или изменить PIN-код доступа к шлагбаумам' })
  @ApiResponse({ status: 200, description: 'PIN-код успешно установлен/изменен' })
  async setPin(@CurrentUser('id') userId: string, @Body() dto: SetPinDto) {
    return this.authService.setPin(userId, dto);
  }

  @Post('pin/reset-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Запросить SMS-код для сброса забытого PIN-кода' })
  @ApiResponse({ status: 200, description: 'SMS-код отправлен' })
  async requestPinReset(@CurrentUser('id') userId: string) {
    return this.authService.requestPinReset(userId);
  }

  @Post('pin/reset-confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Подтвердить сброс PIN-кода по SMS-коду и установить новый' })
  @ApiResponse({ status: 200, description: 'PIN-код успешно сброшен' })
  async confirmPinReset(@CurrentUser('id') userId: string, @Body() dto: ResetPinConfirmDto) {
    return this.authService.confirmPinReset(userId, dto);
  }
}
