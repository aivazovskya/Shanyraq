import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CommunityBoardService } from './community-board.service';
import {
  CreateListingDto,
  UpdateListingDto,
  ModerateListingDto,
  GetListingsQueryDto,
} from './dto/community-board.dto';

@ApiTags('Community Board (Доска объявлений жильцов)')
@Controller('community-board')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CommunityBoardController {
  constructor(private readonly communityBoardService: CommunityBoardService) {}

  @Get('tenants/:tenantId/listings')
  @ApiOperation({ summary: 'Получение объявлений ЖК (с фильтрацией)' })
  async getListings(
    @Param('tenantId') tenantId: string,
    @Query() query: GetListingsQueryDto,
    @Request() req: any,
  ) {
    return this.communityBoardService.getListings(tenantId, req.user, query);
  }

  @Post('tenants/:tenantId/listings')
  @ApiOperation({ summary: 'Публикация объявления жильцом' })
  async createListing(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateListingDto,
    @Request() req: any,
  ) {
    return this.communityBoardService.createListing(tenantId, req.user, dto);
  }

  @Get('my-listings')
  @ApiOperation({ summary: 'Мои объявления' })
  async getMyListings(@Request() req: any) {
    return this.communityBoardService.getMyListings(req.user);
  }

  @Patch('listings/:id')
  @ApiOperation({ summary: 'Редактирование/закрытие своего объявления автором' })
  async updateListing(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @Request() req: any,
  ) {
    return this.communityBoardService.updateListing(id, req.user, dto);
  }

  @Patch('listings/:id/moderate')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Модерация объявления (снятие с публикации)' })
  async moderateListing(
    @Param('id') id: string,
    @Body() dto: ModerateListingDto,
    @Request() req: any,
  ) {
    return this.communityBoardService.moderateListing(id, req.user, dto);
  }
}
