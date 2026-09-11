import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Global Search (Быстрый поиск)')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('tenants/:tenantId')
  @ApiOperation({ summary: 'Глобальный быстрый поиск по жильцам, заявкам и лицевым счетам' })
  @ApiQuery({ name: 'q', required: false, description: 'Поисковый запрос (минимум 2 символа)' })
  async search(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query('q') q?: string,
  ) {
    return this.searchService.search(tenantId, user, q || '');
  }
}
