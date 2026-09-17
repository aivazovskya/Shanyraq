import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import {
  validationExceptionFactory,
  findFirstValidationError,
  CONSTRAINT_TO_ERROR_CODE,
} from './validation-exception.factory';
import { ResetStaffPasswordDto } from '../../modules/auth/dto/auth.dto';
import { CreateStaffDto } from '../../modules/properties/dto/properties.dto';
import { UserRole } from '@prisma/client';

describe('validationExceptionFactory', () => {
  describe('Маппинг категорий ограничений class-validator на 9 кодов VALIDATION.*', () => {
    it('isNotEmpty -> VALIDATION.REQUIRED', () => {
      const error: ValidationError = {
        property: 'title',
        constraints: {
          isNotEmpty: 'Заголовок обязателен',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(exception).toBeInstanceOf(BadRequestException);
      expect(res.code).toBe('VALIDATION.REQUIRED');
      expect(res.message).toBe('Заголовок обязателен');
      expect(res.params).toEqual({ field: 'title' });
    });

    it.each(['isString', 'isNumber', 'isBoolean', 'isInt', 'isArray'])(
      '%s -> VALIDATION.INVALID_TYPE',
      (constraintKey) => {
        const error: ValidationError = {
          property: 'payloadField',
          constraints: {
            [constraintKey]: `${constraintKey} error text`,
          },
        };
        const exception = validationExceptionFactory([error]);
        const res: any = exception.getResponse();

        expect(res.code).toBe('VALIDATION.INVALID_TYPE');
        expect(res.message).toBe(`${constraintKey} error text`);
        expect(res.params).toEqual({ field: 'payloadField' });
      },
    );

    it.each(['matches', 'isEmail', 'isIso8601', 'isISO8601', 'isDateString'])(
      '%s -> VALIDATION.INVALID_FORMAT',
      (constraintKey) => {
        const error: ValidationError = {
          property: 'formatField',
          constraints: {
            [constraintKey]: `${constraintKey} format invalid`,
          },
        };
        const exception = validationExceptionFactory([error]);
        const res: any = exception.getResponse();

        expect(res.code).toBe('VALIDATION.INVALID_FORMAT');
        expect(res.message).toBe(`${constraintKey} format invalid`);
        expect(res.params).toEqual({ field: 'formatField' });
      },
    );

    it.each(['isEnum', 'isIn'])('%s -> VALIDATION.INVALID_VALUE', (constraintKey) => {
      const error: ValidationError = {
        property: 'role',
        constraints: {
          [constraintKey]: 'Недопустимое значение роли',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.INVALID_VALUE');
      expect(res.message).toBe('Недопустимое значение роли');
      expect(res.params).toEqual({ field: 'role' });
    });

    it.each(['minLength', 'isLength', 'length'])(
      '%s -> VALIDATION.TOO_SHORT',
      (constraintKey) => {
        const error: ValidationError = {
          property: 'password',
          constraints: {
            [constraintKey]: 'Пароль слишком короткий',
          },
        };
        const exception = validationExceptionFactory([error]);
        const res: any = exception.getResponse();

        expect(res.code).toBe('VALIDATION.TOO_SHORT');
        expect(res.message).toBe('Пароль слишком короткий');
        expect(res.params).toEqual({ field: 'password' });
      },
    );

    it('maxLength -> VALIDATION.TOO_LONG', () => {
      const error: ValidationError = {
        property: 'description',
        constraints: {
          maxLength: 'Описание превышает лимит',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.TOO_LONG');
      expect(res.message).toBe('Описание превышает лимит');
      expect(res.params).toEqual({ field: 'description' });
    });

    it('min -> VALIDATION.MIN_VALUE', () => {
      const error: ValidationError = {
        property: 'amount',
        constraints: {
          min: 'Сумма не может быть меньше 0',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.MIN_VALUE');
      expect(res.message).toBe('Сумма не может быть меньше 0');
      expect(res.params).toEqual({ field: 'amount' });
    });

    it('max -> VALIDATION.MAX_VALUE', () => {
      const error: ValidationError = {
        property: 'discount',
        constraints: {
          max: 'Скидка не может превышать 100',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.MAX_VALUE');
      expect(res.message).toBe('Скидка не может превышать 100');
      expect(res.params).toEqual({ field: 'discount' });
    });

    it('неизвестный/немаппированный constraint -> VALIDATION.INVALID_FIELD (fallback)', () => {
      const error: ValidationError = {
        property: 'customProp',
        constraints: {
          someUnknownConstraint: 'Неизвестная ошибка валидации',
        },
      };
      const exception = validationExceptionFactory([error]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.INVALID_FIELD');
      expect(res.message).toBe('Неизвестная ошибка валидации');
      expect(res.params).toEqual({ field: 'customProp' });
    });
  });

  describe('Пограничные случаи и вложенные ошибки', () => {
    it('пустой массив ошибок возвращает VALIDATION.INVALID_FIELD без сбоя', () => {
      const exception = validationExceptionFactory([]);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.INVALID_FIELD');
      expect(res.message).toBe('Validation error');
      expect(res.params).toBeUndefined();
    });

    it('ошибки без constraints ищут вложенные ошибки в children', () => {
      const errors: ValidationError[] = [
        {
          property: 'parent',
          children: [
            {
              property: 'childField',
              constraints: {
                isNotEmpty: 'Вложенное поле обязательно',
              },
            },
          ],
        },
      ];
      const exception = validationExceptionFactory(errors);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.REQUIRED');
      expect(res.message).toBe('Вложенное поле обязательно');
      expect(res.params).toEqual({ field: 'childField' });
    });

    it('берется именно первая ошибка валидации при множественных ошибках', () => {
      const errors: ValidationError[] = [
        {
          property: 'firstField',
          constraints: {
            isNotEmpty: 'Первое поле обязательно',
            isString: 'Первое поле должно быть строкой',
          },
        },
        {
          property: 'secondField',
          constraints: {
            isEmail: 'Второе поле неверный email',
          },
        },
      ];
      const exception = validationExceptionFactory(errors);
      const res: any = exception.getResponse();

      expect(res.code).toBe('VALIDATION.REQUIRED');
      expect(res.message).toBe('Первое поле обязательно');
      expect(res.params).toEqual({ field: 'firstField' });
    });
  });

  describe('Интеграция с реальным NestJS ValidationPipe и DTO проекта', () => {
    let pipe: ValidationPipe;

    beforeEach(() => {
      pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        exceptionFactory: validationExceptionFactory,
      });
    });

    it('ResetStaffPasswordDto: короткий пароль (< 8 символов) возвращает VALIDATION.TOO_SHORT', async () => {
      try {
        await pipe.transform(
          {
            phone: '+77011112233',
            code: '123456',
            newPassword: 'short', // < 8 символов (@MinLength(8))
          },
          { type: 'body', metatype: ResetStaffPasswordDto },
        );
        fail('Ожидался BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = err.getResponse();
        expect(res.code).toBe('VALIDATION.TOO_SHORT');
        expect(res.message).toBe('Пароль должен содержать не менее 8 символов');
        expect(res.params).toEqual({ field: 'newPassword' });
      }
    });

    it('ResetStaffPasswordDto: код не из 6 цифр (@Length(6, 6)) возвращает VALIDATION.TOO_SHORT', async () => {
      try {
        await pipe.transform(
          {
            phone: '+77011112233',
            code: '12', // @Length(6, 6)
            newPassword: 'ValidPassword123!',
          },
          { type: 'body', metatype: ResetStaffPasswordDto },
        );
        fail('Ожидался BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = err.getResponse();
        expect(res.code).toBe('VALIDATION.TOO_SHORT');
        expect(res.message).toBe('SMS-код должен состоять ровно из 6 цифр');
        expect(res.params).toEqual({ field: 'code' });
      }
    });

    it('CreateStaffDto: некорректный формат телефона (@Matches) возвращает VALIDATION.INVALID_FORMAT', async () => {
      try {
        await pipe.transform(
          {
            firstName: 'Иван',
            lastName: 'Иванов',
            phone: '87015550101', // не соответствует ^\+7\d{10}$
            role: UserRole.DISPATCHER,
          },
          { type: 'body', metatype: CreateStaffDto },
        );
        fail('Ожидался BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = err.getResponse();
        expect(res.code).toBe('VALIDATION.INVALID_FORMAT');
        expect(res.message).toBe('Номер телефона должен быть в формате +7XXXXXXXXXX');
        expect(res.params).toEqual({ field: 'phone' });
      }
    });

    it('CreateStaffDto: недопустимая роль (@IsIn) возвращает VALIDATION.INVALID_VALUE', async () => {
      try {
        await pipe.transform(
          {
            firstName: 'Иван',
            lastName: 'Иванов',
            phone: '+77015550101',
            role: 'RESIDENT_OWNER', // Недопустимая роль для персонала
          },
          { type: 'body', metatype: CreateStaffDto },
        );
        fail('Ожидался BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = err.getResponse();
        expect(res.code).toBe('VALIDATION.INVALID_VALUE');
        expect(res.message).toContain('Недопустимая роль сотрудника');
        expect(res.params).toEqual({ field: 'role' });
      }
    });

    it('CreateStaffDto: отсутствующее обязательное поле (@IsNotEmpty) возвращает VALIDATION.REQUIRED', async () => {
      try {
        await pipe.transform(
          {
            lastName: 'Иванов',
            phone: '+77015550101',
            role: UserRole.DISPATCHER,
          },
          { type: 'body', metatype: CreateStaffDto },
        );
        fail('Ожидался BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = err.getResponse();
        expect(res.code).toBe('VALIDATION.REQUIRED');
        expect(res.message).toBe('Имя обязательно');
        expect(res.params).toEqual({ field: 'firstName' });
      }
    });

    it('успешная валидация DTO проходит без исключений', async () => {
      const validPayload = {
        firstName: 'Аслан',
        lastName: 'Омаров',
        phone: '+77015550101',
        email: 'aslan@shanyraq.kz',
        role: UserRole.HOA_ADMIN,
      };

      const result = await pipe.transform(validPayload, {
        type: 'body',
        metatype: CreateStaffDto,
      });

      expect(result.firstName).toBe('Аслан');
      expect(result.phone).toBe('+77015550101');
    });
  });
});
