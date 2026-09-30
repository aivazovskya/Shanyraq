import { ExecutionContext, HttpStatus, HttpException } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';
import { ThrottlerStorage } from '@nestjs/throttler';
import { FAIL_CLOSED_THROTTLE_KEY } from '../decorators/fail-closed-throttle.decorator';

describe('AppThrottlerGuard', () => {
  let guard: AppThrottlerGuard;
  let mockStorage: jest.Mocked<ThrottlerStorage>;
  let mockReflector: {
    getAllAndOverride: jest.Mock;
  };

  class MockAuthController {}
  class MockVotingsController {}
  class MockGeneralController {}

  const createMockContext = (controllerClass: any, handlerFn: any = () => {}) => {
    const headers: Record<string, any> = {};
    const req = {
      ip: '192.168.1.1',
      headers: {},
      url: '/test',
    };
    const res = {
      setHeader: jest.fn((key: string, val: any) => {
        headers[key] = val;
      }),
      header: jest.fn((key: string, val: any) => {
        headers[key] = val;
      }),
      headers,
    };

    const context = {
      getClass: () => controllerClass,
      getHandler: () => handlerFn,
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, req, res };
  };

  beforeEach(() => {
    mockStorage = {
      increment: jest.fn(),
    } as any;

    mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    guard = new AppThrottlerGuard(
      {
        throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
      } as any,
      mockStorage,
      mockReflector as any,
    );
  });

  describe('generateKey', () => {
    it('should append :failclosed if FailClosedThrottle metadata is present', () => {
      mockReflector.getAllAndOverride.mockImplementation((key) => {
        if (key === FAIL_CLOSED_THROTTLE_KEY) return true;
        return undefined;
      });

      const { context } = createMockContext(MockAuthController);
      const generated = (guard as any).generateKey(context, '192.168.1.1', 'default');

      expect(generated).toMatch(/:failclosed$/);
    });

    it('should NOT append :failclosed if FailClosedThrottle metadata is absent', () => {
      mockReflector.getAllAndOverride.mockImplementation(() => undefined);

      const { context } = createMockContext(MockGeneralController);
      const generated = (guard as any).generateKey(context, '192.168.1.1', 'default');

      expect(generated).not.toMatch(/:failclosed$/);
    });
  });

  describe('throwThrottlingException', () => {
    const testCases = [
      {
        name: 'POST auth/request-otp',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/verify-otp',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/login-password',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/set-initial-password',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/staff/forgot-password',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/staff/reset-password',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/pin/reset-request',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/pin/reset-confirm',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/pin/set',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST auth/refresh',
        controller: MockAuthController,
        expectedCode: 'AUTH.RATE_LIMITED',
      },
      {
        name: 'POST votings/vote',
        controller: MockVotingsController,
        expectedCode: 'VOTINGS.RATE_LIMITED',
      },
    ];

    testCases.forEach(({ name, controller, expectedCode }) => {
      it(`should throw 429 with code ${expectedCode} and set Retry-After for ${name}`, async () => {
        const { context, res } = createMockContext(controller);
        const limitDetail = {
          limit: 5,
          ttl: 60000,
          key: 'test',
          tracker: '192.168.1.1',
          totalHits: 6,
          timeToExpire: 45,
          isBlocked: true,
          timeToBlockExpire: 45,
        };

        try {
          await (guard as any).throwThrottlingException(context, limitDetail);
          fail('Should have thrown an exception');
        } catch (err: any) {
          expect(err).toBeInstanceOf(HttpException);
          expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

          const response = err.getResponse();
          expect(response).toMatchObject({
            statusCode: 429,
            code: expectedCode,
          });

          expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 45);
        }
      });
    });

    it('should return COMMON.RATE_LIMITED for non-auth, non-voting controllers', async () => {
      const { context } = createMockContext(MockGeneralController);
      const limitDetail = {
        limit: 60,
        ttl: 60000,
        key: 'test',
        tracker: '192.168.1.1',
        totalHits: 61,
        timeToExpire: 30,
        isBlocked: true,
        timeToBlockExpire: 30,
      };

      try {
        await (guard as any).throwThrottlingException(context, limitDetail);
        fail('Should have thrown an exception');
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          statusCode: 429,
          code: 'COMMON.RATE_LIMITED',
        });
      }
    });

    it('should use timeToExpire if timeToBlockExpire is 0', async () => {
      const { context, res } = createMockContext(MockAuthController);
      const limitDetail = {
        limit: 5,
        ttl: 60000,
        key: 'test',
        tracker: '192.168.1.1',
        totalHits: 6,
        timeToExpire: 30,
        isBlocked: false,
        timeToBlockExpire: 0,
      };

      try {
        await (guard as any).throwThrottlingException(context, limitDetail);
        fail('Should have thrown an exception');
      } catch (err: any) {
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 30);
      }
    });
  });
});
