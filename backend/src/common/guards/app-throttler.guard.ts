import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { FAIL_CLOSED_THROTTLE_KEY } from '../decorators/fail-closed-throttle.decorator';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const baseKey = super.generateKey(context, suffix, name);
    const isFailClosed = this.reflector.getAllAndOverride<boolean>(FAIL_CLOSED_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isFailClosed ? `${baseKey}:failclosed` : baseKey;
  }

  protected async handleRequest(requestProps: any): Promise<boolean> {
    const { context } = requestProps;
    const isFailClosed = this.reflector.getAllAndOverride<boolean>(FAIL_CLOSED_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const origGenerateKey = requestProps.generateKey;
    requestProps.generateKey = (...args: any[]) => {
      const key = origGenerateKey ? origGenerateKey(...args) : this.generateKey(context, args[1], args[2]);
      return isFailClosed && !key.endsWith(':failclosed') ? `${key}:failclosed` : key;
    };

    if (isFailClosed) {
      requestProps.throttler = { ...requestProps.throttler, name: 'failclosed' };
    }

    return super.handleRequest(requestProps);
  }

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

    const customCode = this.reflector.getAllAndOverride<string>('THROTTLE_ERROR_CODE', [
      context.getHandler(),
      context.getClass(),
    ]);

    let errorCode = customCode;
    if (!errorCode) {
      const className = context.getClass()?.name || '';
      if (className.includes('Auth')) {
        errorCode = 'AUTH.RATE_LIMITED';
      } else if (className.includes('Voting')) {
        errorCode = 'VOTINGS.RATE_LIMITED';
      } else {
        errorCode = 'COMMON.RATE_LIMITED';
      }
    }

    const isVoting = errorCode === 'VOTINGS.RATE_LIMITED';

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: errorCode,
        message: isVoting
          ? 'Слишком много попыток голосования. Пожалуйста, повторите позже.'
          : 'Слишком много запросов. Пожалуйста, повторите позже.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
