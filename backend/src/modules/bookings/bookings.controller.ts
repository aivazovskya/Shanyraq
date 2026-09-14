import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { BookingsService } from './bookings.service';
import {
  CreateBookableResourceDto,
  UpdateBookableResourceDto,
  CreateBookingDto,
  GetAvailabilityQueryDto,
  GetBookingsQueryDto,
  JoinWaitlistDto,
} from './dto/bookings.dto';

@ApiTags('Bookings (Бронирование общих пространств)')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // =============================================================
  // Каталог ресурсов
  // =============================================================

  @Get('tenants/:tenantId/resources')
  @ApiOperation({ summary: 'Каталог пространств ЖК (доступно жителям и персоналу)' })
  async getResources(@Param('tenantId') tenantId: string, @Request() req: any) {
    return this.bookingsService.getResources(tenantId, req.user);
  }

  @Get('resources/:id')
  @ApiOperation({ summary: 'Получить данные пространства по ID' })
  async getResourceById(@Param('id') id: string, @Request() req: any) {
    return this.bookingsService.getResourceById(id, req.user);
  }

  @Post('tenants/:tenantId/resources')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Создать пространство в каталоге ЖК (УК/ОСИ)' })
  async createResource(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateBookableResourceDto,
    @Request() req: any,
  ) {
    return this.bookingsService.createResource(tenantId, dto, req.user);
  }

  @Patch('resources/:id')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Обновить параметры или активность пространства' })
  async updateResource(
    @Param('id') id: string,
    @Body() dto: UpdateBookableResourceDto,
    @Request() req: any,
  ) {
    return this.bookingsService.updateResource(id, dto, req.user);
  }

  // =============================================================
  // Доступность и Бронирование
  // =============================================================

  @Get('resources/:resourceId/availability')
  @ApiOperation({ summary: 'Сетка доступности слотов (для жителей без ФИО, для персонала с ФИО)' })
  @ApiQuery({ name: 'from', description: 'Начало диапазона (ISO-8601)' })
  @ApiQuery({ name: 'to', description: 'Конец диапазона (ISO-8601)' })
  async getAvailability(
    @Param('resourceId') resourceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Request() req: any,
  ) {
    return this.bookingsService.getAvailability(resourceId, from, to, req.user);
  }

  @Post('resources/:resourceId/bookings')
  @ApiOperation({ summary: 'Забронировать слот времени (для верифицированных собственников и арендаторов)' })
  async createBooking(
    @Param('resourceId') resourceId: string,
    @Body() dto: CreateBookingDto,
    @Request() req: any,
  ) {
    return this.bookingsService.createBooking(resourceId, dto, req.user);
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Мои бронирования (для текущего авторизованного жителя)' })
  async getMyBookings(@Request() req: any) {
    return this.bookingsService.getMyBookings(req.user);
  }

  // =============================================================
  // Лист ожидания (BookingWaitlistEntry)
  // =============================================================

  @Post('resources/:resourceId/waitlist')
  @ApiOperation({ summary: 'Встать в лист ожидания на занятый слот' })
  async joinWaitlist(
    @Param('resourceId') resourceId: string,
    @Body() dto: JoinWaitlistDto,
    @Request() req: any,
  ) {
    return this.bookingsService.joinWaitlist(resourceId, dto, req.user);
  }

  @Get('my-waitlist')
  @ApiOperation({ summary: 'Мои записи в листах ожидания' })
  async getMyWaitlistEntries(@Request() req: any) {
    return this.bookingsService.getMyWaitlistEntries(req.user);
  }

  @Delete('waitlist/:id')
  @ApiOperation({ summary: 'Покинуть лист ожидания (только собственная запись)' })
  async leaveWaitlist(@Param('id') id: string, @Request() req: any) {
    return this.bookingsService.leaveWaitlist(id, req.user);
  }

  @Get('tenants/:tenantId/bookings')
  @Roles(UserRole.HOA_ADMIN, UserRole.DISPATCHER, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({ summary: 'Журнал бронирований ЖК для модерации персоналом' })
  async getTenantBookings(
    @Param('tenantId') tenantId: string,
    @Query() query: GetBookingsQueryDto,
    @Request() req: any,
  ) {
    return this.bookingsService.getTenantBookings(tenantId, query, req.user);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Отменить бронирование (житель или сотрудник УК)' })
  async cancelBooking(@Param('id') id: string, @Request() req: any) {
    return this.bookingsService.cancelBooking(id, req.user);
  }
}
