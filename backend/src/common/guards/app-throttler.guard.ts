import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse();
    const retryAfter = throttlerLimitDetail.timeToBlockExpire > 0
      ? throttlerLimitDetail.timeToBlockExpire
      : throttlerLimitDetail.timeToExpire;

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', retryAfter);
    } else if (res && typeof res.header === 'function') {
      res.header('Retry-After', retryAfter);
    }

    const className = context.getClass()?.name || '';
    const isVoting = className.includes('Votings');

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: isVoting ? 'VOTINGS.RATE_LIMITED' : 'AUTH.RATE_LIMITED',
        message: isVoting
          ? 'Слишком много попыток голосования. Пожалуйста, повторите позже.'
          : 'Слишком много запросов. Пожалуйста, повторите позже.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
