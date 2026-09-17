import { BadRequestException, ValidationError } from '@nestjs/common';

export const CONSTRAINT_TO_ERROR_CODE: Record<string, string> = {
  // Required
  isNotEmpty: 'VALIDATION.REQUIRED',

  // Types
  isString: 'VALIDATION.INVALID_TYPE',
  isNumber: 'VALIDATION.INVALID_TYPE',
  isBoolean: 'VALIDATION.INVALID_TYPE',
  isInt: 'VALIDATION.INVALID_TYPE',
  isArray: 'VALIDATION.INVALID_TYPE',

  // Formats
  matches: 'VALIDATION.INVALID_FORMAT',
  isEmail: 'VALIDATION.INVALID_FORMAT',
  isIso8601: 'VALIDATION.INVALID_FORMAT',
  isISO8601: 'VALIDATION.INVALID_FORMAT',
  isDateString: 'VALIDATION.INVALID_FORMAT',

  // Values / Enums
  isEnum: 'VALIDATION.INVALID_VALUE',
  isIn: 'VALIDATION.INVALID_VALUE',

  // Length constraints
  minLength: 'VALIDATION.TOO_SHORT',
  isLength: 'VALIDATION.TOO_SHORT',
  length: 'VALIDATION.TOO_SHORT',
  maxLength: 'VALIDATION.TOO_LONG',

  // Numeric bounds
  min: 'VALIDATION.MIN_VALUE',
  max: 'VALIDATION.MAX_VALUE',
};

export interface ExtractedValidationError {
  property: string;
  constraintKey: string;
  message: string;
}

/**
 * Рекурсивно извлекает первую ошибку валидации с непустым объектом constraints.
 */
export function findFirstValidationError(
  errors: ValidationError[],
): ExtractedValidationError | null {
  if (!errors || errors.length === 0) {
    return null;
  }

  for (const err of errors) {
    if (err.constraints && Object.keys(err.constraints).length > 0) {
      // Если среди нарушенных ограничений есть isNotEmpty (обязательное поле), отдаем ему приоритет
      const constraintKey = err.constraints.isNotEmpty
        ? 'isNotEmpty'
        : Object.keys(err.constraints)[0];
      const message = err.constraints[constraintKey];
      return {
        property: err.property,
        constraintKey,
        message,
      };
    }

    if (err.children && err.children.length > 0) {
      const childResult = findFirstValidationError(err.children);
      if (childResult) {
        return childResult;
      }
    }
  }

  return null;
}

/**
 * Преобразует ошибки валидации class-validator в структурированное исключение
 * BadRequestException({ code, message, params: { field } })
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const first = findFirstValidationError(errors);

  if (!first) {
    return new BadRequestException({
      code: 'VALIDATION.INVALID_FIELD',
      message: 'Validation error',
    });
  }

  const code = CONSTRAINT_TO_ERROR_CODE[first.constraintKey] || 'VALIDATION.INVALID_FIELD';
  const message = first.message || 'Validation error';

  return new BadRequestException({
    code,
    message,
    params: {
      field: first.property,
    },
  });
}
