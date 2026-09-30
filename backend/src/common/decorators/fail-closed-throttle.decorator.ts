import { SetMetadata } from '@nestjs/common';

export const FAIL_CLOSED_THROTTLE_KEY = 'FAIL_CLOSED_THROTTLE';

/**
 * Декоратор для чувствительных эндпоинтов (auth, voting),
 * при сбое Redis требующих строгого fail-closed поведения (HTTP 503 AUTH.SERVICE_UNAVAILABLE).
 */
export const FailClosedThrottle = () => SetMetadata(FAIL_CLOSED_THROTTLE_KEY, true);
