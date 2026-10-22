import { ValidationPipe, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import {
  GetBudgetQueryDto,
  BudgetVsActualQueryDto,
  BudgetLineItemDto,
  UpdateBudgetDto,
} from './budget.dto';

describe('Budget DTO Validation Tests (Real ValidationPipe)', () => {
  let targetPipe: ValidationPipe;

  beforeEach(() => {
    targetPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    });
  });

  describe('GetBudgetQueryDto', () => {
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: GetBudgetQueryDto,
    };

    it('transforms query string "year=2026" into numeric 2026', async () => {
      const res = await targetPipe.transform({ year: '2026' }, metadata);
      expect(res.year).toBe(2026);
      expect(typeof res.year).toBe('number');
    });

    it('uses current year default when year is undefined', async () => {
      const res = await targetPipe.transform({}, metadata);
      expect(typeof res.year).toBe('number');
      expect(res.year).toBeGreaterThanOrEqual(2020);
    });

    it('rejects non-numeric year "abc" with 400 BadRequestException', async () => {
      await expect(targetPipe.transform({ year: 'abc' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects out-of-range year "1500" with 400 BadRequestException', async () => {
      await expect(targetPipe.transform({ year: '1500' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects future year "2500" (>2100) with 400 BadRequestException', async () => {
      await expect(targetPipe.transform({ year: '2500' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('BudgetVsActualQueryDto', () => {
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: BudgetVsActualQueryDto,
    };

    it('transforms query string "year=2026" into numeric 2026', async () => {
      const res = await targetPipe.transform({ year: '2026' }, metadata);
      expect(res.year).toBe(2026);
      expect(typeof res.year).toBe('number');
    });

    it('rejects "year=invalid" with 400', async () => {
      await expect(targetPipe.transform({ year: 'invalid' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('BudgetLineItemDto & UpdateBudgetDto', () => {
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: UpdateBudgetDto,
    };

    it('passes valid budget lines batch', async () => {
      const payload = {
        lines: [
          {
            year: 2026,
            month: 1,
            category: 'Текущий ремонт',
            plannedAmount: 150000,
            note: 'План на январь',
          },
          {
            year: '2026',
            month: '2',
            category: 'Охрана',
            plannedAmount: '80000',
          },
        ],
      };

      const res = await targetPipe.transform(payload, metadata);
      expect(res.lines).toHaveLength(2);
      expect(res.lines[0].plannedAmount).toBe(150000);
      expect(res.lines[1].month).toBe(2);
      expect(res.lines[1].plannedAmount).toBe(80000);
    });

    it('rejects negative plannedAmount with 400', async () => {
      const payload = {
        lines: [
          {
            year: 2026,
            month: 1,
            category: 'Текущий ремонт',
            plannedAmount: -500,
          },
        ],
      };

      await expect(targetPipe.transform(payload, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid month (month=13) with 400', async () => {
      const payload = {
        lines: [
          {
            year: 2026,
            month: 13,
            category: 'Текущий ремонт',
            plannedAmount: 1000,
          },
        ],
      };

      await expect(targetPipe.transform(payload, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty category with 400', async () => {
      const payload = {
        lines: [
          {
            year: 2026,
            month: 1,
            category: '',
            plannedAmount: 1000,
          },
        ],
      };

      await expect(targetPipe.transform(payload, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
