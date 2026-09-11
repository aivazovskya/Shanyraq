import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import * as bcrypt from 'bcryptjs';
import { AccessPointType, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AccessControlService (Аудит безопасности СКУД, IDOR и go2rtc)', () => {
  let service: AccessControlService;
  let prismaMock: any;
  let configServiceMock: any;
  let redisMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map();
    redisMock = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) || null)),
      set: jest.fn().mockImplementation((key: string, val: string) => {
        redisStore.set(key, val);
        return Promise.resolve('OK');
      }),
      del: jest.fn().mockImplementation((key: string) => {
        const existed = redisStore.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
      incr: jest.fn().mockImplementation((key: string) => {
        const cur = parseInt(redisStore.get(key) || '0', 10) + 1;
        redisStore.set(key, cur.toString());
        return Promise.resolve(cur);
      }),
      expire: jest.fn().mockResolvedValue(1),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      accessPoint: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      unit: {
        findUnique: jest.fn(),
      },
      accessLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      guestPass: {
        create: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultVal: string) => {
        if (key === 'GO2RTC_API_URL') return 'http://localhost:1984';
        return defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
  });

  describe('getAccessPoints (Защита RTSP-кредов от утечки жильцам)', () => {
    const samplePoints = [
      {
        id: 'cam-1',
        tenantId: 'tenant-1',
        name: 'Камера двора',
        type: AccessPointType.CAMERA,
        controllerType: 'RTSP_CAMERA',
        rtspStreamUrl: 'rtsp://admin:SECRET_PASSWORD@192.168.1.100:554/live',
        endpointUrl: null,
        streamName: 'courtyard_cam_1',
        isActive: true,
      },
    ];

    it('должен скрывать rtspStreamUrl от обычных жителей ЖК', async () => {
      prismaMock.accessPoint.findMany.mockResolvedValue(samplePoints);

      const points = await service.getAccessPoints('tenant-1', UserRole.RESIDENT_OWNER);
      expect(points).toHaveLength(1);
      expect(points[0].name).toBe('Камера двора');
      expect((points[0] as any).rtspStreamUrl).toBeUndefined();
      expect((points[0] as any).endpointUrl).toBeUndefined();
      expect(points[0].streamName).toBe('courtyard_cam_1');
    });

    it('должен показывать rtspStreamUrl администраторам ЖК для настройки оборудования', async () => {
      prismaMock.accessPoint.findMany.mockResolvedValue(samplePoints);

      const points = await service.getAccessPoints('tenant-1', UserRole.HOA_ADMIN);
      expect((points[0] as any).rtspStreamUrl).toBe('rtsp://admin:SECRET_PASSWORD@192.168.1.100:554/live');
    });
  });

  describe('getCameraStream (Безопасная интеграция с go2rtc и Tenant Isolation)', () => {
    const mockCamera = {
      id: 'cam-10',
      tenantId: 'tenant-1',
      name: 'Камера парковки',
      type: AccessPointType.CAMERA,
      streamName: 'parking_cam',
      isActive: true,
    };

    it('должен возвращать WebRTC и HLS endpoints go2rtc без сырых RTSP-кредов', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockCamera);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        isVerified: true,
      });

      const res = await service.getCameraStream(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        'cam-10',
      );

      expect(res.accessPointId).toBe('cam-10');
      expect(res.streamName).toBe('parking_cam');
      expect(res.endpoints.webrtcWs).toBe('ws://localhost:1984/api/ws?src=parking_cam');
      expect(res.endpoints.hls).toBe('http://localhost:1984/api/stream.m3u8?src=parking_cam');
      expect(res.endpoints.webPlayer).toBe('http://localhost:1984/stream.html?src=parking_cam');
      expect((res as any).rtspStreamUrl).toBeUndefined();
    });

    it('должен блокировать доступ к потоку камеры жителю другого ЖК', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockCamera);
      // Пользователь не имеет подтвержденной квартиры в этом ЖК
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.getCameraStream(
          { id: 'resident-alien', role: UserRole.RESIDENT_OWNER },
          'cam-10',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен блокировать просмотр камеры сотруднику (SECURITY) чужого ЖК', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockCamera);

      await expect(
        service.getCameraStream(
          { id: 'security-alien', role: UserRole.SECURITY, tenantId: 'tenant-alien' },
          'cam-10',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать просмотр камеры сотруднику (SECURITY) своего ЖК', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockCamera);

      const res = await service.getCameraStream(
        { id: 'security-own', role: UserRole.SECURITY, tenantId: 'tenant-1' },
        'cam-10',
      );

      expect(res.accessPointId).toBe('cam-10');
      expect(res.streamName).toBe('parking_cam');
    });

    it('должен разрешать просмотр камеры SUPERADMIN без ограничений по tenantId', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockCamera);

      const res = await service.getCameraStream(
        { id: 'superadmin', role: UserRole.SUPERADMIN, tenantId: null },
        'cam-10',
      );

      expect(res.accessPointId).toBe('cam-10');
    });

    it('должен отклонять запрос потока, если точка доступа не является камерой', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue({
        id: 'barrier-1',
        tenantId: 'tenant-1',
        type: AccessPointType.BARRIER,
        isActive: true,
      });

      await expect(
        service.getCameraStream(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          'barrier-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createGuestPass (IDOR защита)', () => {
    it('должен блокировать создание гостевого пропуска для чужой квартиры', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createGuestPass(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          {
            unitId: 'unit-alien-99',
            guestName: 'Курьер',
            validFrom: new Date().toISOString(),
            validTo: new Date(Date.now() + 3600000).toISOString(),
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.guestPass.create).not.toHaveBeenCalled();
    });

    it('должен разрешать создание пропуска для своей подтвержденной квартиры', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-own-101',
        isVerified: true,
      });

      prismaMock.guestPass.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'pass-1', ...args.data }),
      );

      const res = await service.createGuestPass(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        {
          unitId: 'unit-own-101',
          guestName: 'Гость Азамат',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 3600000).toISOString(),
        },
      );

      expect(res.id).toBe('pass-1');
      expect(res.accessCode).toBeDefined();
      expect(res.accessCode.length).toBe(6);
    });
  });

  describe('openBarrier (Достоверный аудит-трейл и Tenant Isolation для персонала)', () => {
    const mockBarrier = {
      id: 'barrier-1',
      tenantId: 'tenant-1',
      name: 'Шлагбаум Въезд',
      type: AccessPointType.BARRIER,
      controllerType: 'PAL_ES',
    };

    it('должен сохранять в аудит-лог истинную квартиру жителя из базы, а не поддельный unitId из запроса', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: pinHash,
      });
      
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-real-101',
        isVerified: true,
      });

      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-1', createdAt: new Date(), ...args.data }),
      );

      const res = await service.openBarrier(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        {
          accessPointId: 'barrier-1',
          unitId: 'unit-fake-999',
          pin: '8392',
        },
      );

      expect(res.success).toBe(true);
      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'unit-real-101',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('должен блокировать открытие шлагбаума и фиксировать DENIED в логе при отсутствии прав у жителя', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.openBarrier(
          { id: 'unverified-user', role: UserRole.RESIDENT_OWNER },
          {
            accessPointId: 'barrier-1',
            pin: '8392',
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DENIED',
          }),
        }),
      );
    });

    it('должен блокировать открытие шлагбаума сотрудником чужого ЖК и фиксировать DENIED в логе', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);

      await expect(
        service.openBarrier(
          { id: 'security-alien', role: UserRole.SECURITY, tenantId: 'tenant-alien' },
          {
            accessPointId: 'barrier-1',
            pin: '8392',
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessPointId: 'barrier-1',
            userId: 'security-alien',
            status: 'DENIED',
            note: 'Попытка открытия шлагбаума сотрудником чужого жилого комплекса',
          }),
        }),
      );
    });

    it('должен разрешать открытие шлагбаума сотруднику своего ЖК', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'security-own',
        accessPinHash: pinHash,
      });
      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-staff', createdAt: new Date(), ...args.data }),
      );

      const res = await service.openBarrier(
        { id: 'security-own', role: UserRole.SECURITY, tenantId: 'tenant-1' },
        {
          accessPointId: 'barrier-1',
          pin: '8392',
        },
      );

      expect(res.success).toBe(true);
      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            userId: 'security-own',
          }),
        }),
      );
    });

    it('должен разрешать открытие шлагбаума SUPERADMIN без ограничений по ЖК', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'superadmin',
        accessPinHash: pinHash,
      });
      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-super', createdAt: new Date(), ...args.data }),
      );

      const res = await service.openBarrier(
        { id: 'superadmin', role: UserRole.SUPERADMIN, tenantId: null },
        {
          accessPointId: 'barrier-1',
          pin: '8392',
        },
      );

      expect(res.success).toBe(true);
      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            userId: 'superadmin',
          }),
        }),
      );
    });
  });

  describe('openBarrier (2FA PIN-проверка и защита от перебора)', () => {
    const mockBarrier = {
      id: 'barrier-1',
      tenantId: 'tenant-1',
      name: 'Шлагбаум Въезд',
      type: AccessPointType.BARRIER,
      controllerType: 'PAL_ES',
    };

    beforeEach(() => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-real-101',
        isVerified: true,
      });
      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-id', createdAt: new Date(), ...args.data }),
      );
    });

    it('должен отклонять открытие и возвращать PIN_NOT_SET, если у жителя не установлен PIN-код', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: null,
      });

      await expect(
        service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '8392' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DENIED',
            note: 'Попытка открытия шлагбаума без настроенного PIN-кода доступа',
          }),
        }),
      );
    });

    it('должен отклонять открытие и возвращать PIN_NOT_SET, если у сотрудника не установлен PIN-код', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'staff-1',
        accessPinHash: null,
      });

      await expect(
        service.openBarrier(
          { id: 'staff-1', role: UserRole.SECURITY, tenantId: 'tenant-1' },
          { accessPointId: 'barrier-1', pin: '8392' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен отклонять запрос при неверном PIN и фиксировать оставшиеся попытки', async () => {
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: pinHash,
      });

      await expect(
        service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '0000' },
        ),
      ).rejects.toThrow('Неверный PIN-код. Осталось попыток: 2');

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DENIED',
            note: 'Неверный PIN при открытии (попытка 1 из 3)',
          }),
        }),
      );
    });

    it('должен блокировать открытие на 10 минут после 3 неверных попыток подряд', async () => {
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: pinHash,
      });

      // Attempt 1
      await expect(
        service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '1111' },
        ),
      ).rejects.toThrow('Неверный PIN-код. Осталось попыток: 2');

      // Attempt 2
      try {
        await service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '2222' },
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.message).toBe('Неверный PIN-код. Осталось попыток: 1');
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.PIN_INVALID');
        expect(err.getResponse().params).toEqual({ remaining: 1 });
      }

      // Attempt 3 -> lockout triggered
      await expect(
        service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '3333' },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(redisMock.set).toHaveBeenCalledWith(
        'barrier:lockout:resident-1',
        '1',
        600,
      );

      // Subsequent attempt while locked out
      try {
        await service.openBarrier(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          { accessPointId: 'barrier-1', pin: '8392' },
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.PIN_LOCKED');
      }
    });

    it('должен успешно открывать шлагбаум при верном PIN и очищать счетчик попыток', async () => {
      const pinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: pinHash,
      });

      // Suppose 1 failed attempt existed
      redisStore.set('barrier:attempts:resident-1', '1');

      const res = await service.openBarrier(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        { accessPointId: 'barrier-1', pin: '8392' },
      );

      expect(res.success).toBe(true);
      expect(redisStore.get('barrier:attempts:resident-1')).toBeUndefined();
      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            action: 'OPEN_BARRIER',
          }),
        }),
      );
    });
  });

  describe('createGuestPass (CSPRNG 6-значный код доступа и IDOR защита)', () => {
    it('должен генерировать криптографически стойкий 6-значный цифровой код доступа', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        userId: 'resident-1',
        unitId: 'unit-1',
        isVerified: true,
      });

      let capturedData: any = null;
      prismaMock.guestPass.create.mockImplementation((args: any) => {
        capturedData = args.data;
        return Promise.resolve({ id: 'pass-1', ...args.data });
      });

      const res = await service.createGuestPass(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        {
          unitId: 'unit-1',
          guestName: 'Курьер Доставка',
          validFrom: '2026-09-07T12:00:00Z',
          validTo: '2026-09-07T14:00:00Z',
        },
      );

      expect(res.id).toBe('pass-1');
      expect(capturedData).toBeDefined();
      expect(capturedData.accessCode).toMatch(/^\d{6}$/);
      expect(parseInt(capturedData.accessCode, 10)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(capturedData.accessCode, 10)).toBeLessThan(1000000);
      expect(capturedData.qrCodeUrl).toBe(`https://api.shanyraq.kz/qr/pass-${capturedData.accessCode}`);
    });

    it('должен блокировать создание гостевого пропуска для неподтвержденной квартиры (IDOR)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createGuestPass(
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
          {
            unitId: 'unit-alien',
            guestName: 'Гость',
            validFrom: '2026-09-07T12:00:00Z',
            validTo: '2026-09-07T14:00:00Z',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Task 0008: Домофон Hikvision DS-KV (ISAPI), DOOR_INTERCOM и управление точками доступа', () => {
    const mockHash = bcrypt.hashSync('8392', 10);

    it('должен успешно открывать DOOR_INTERCOM с фиксацией action: OPEN_INTERCOM в журнале', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue({
        id: 'intercom-1',
        tenantId: 'tenant-1',
        name: 'Домофон Подъезд 1',
        type: AccessPointType.DOOR_INTERCOM,
        controllerType: 'PAL_ES',
        endpointUrl: 'http://192.168.1.101',
        isActive: true,
      });

      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-1',
        isVerified: true,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'resident-1',
        accessPinHash: mockHash,
      });

      let capturedLog: any = null;
      prismaMock.accessLog.create.mockImplementation((args: any) => {
        capturedLog = args.data;
        return Promise.resolve({ id: 'log-intercom', ...args.data, createdAt: new Date() });
      });

      const res = await service.openBarrier(
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER },
        { accessPointId: 'intercom-1', pin: '8392' },
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('Домофон «Домофон Подъезд 1» открыт');
      expect(capturedLog.action).toBe('OPEN_INTERCOM');
      expect(capturedLog.status).toBe('SUCCESS');
    });

    it('resolveAdapter должен выбирать HikvisionIsapiAdapter только для HIKVISION_ISAPI и MockBarrierAdapter для остальных', () => {
      const adapterHik = (service as any).resolveAdapter('HIKVISION_ISAPI');
      const adapterPal = (service as any).resolveAdapter('PAL_ES');
      const adapterMqtt = (service as any).resolveAdapter('MQTT_RELAY');

      expect(adapterHik.constructor.name).toBe('HikvisionIsapiAdapter');
      expect(adapterPal.constructor.name).toBe('MockBarrierAdapter');
      expect(adapterMqtt.constructor.name).toBe('MockBarrierAdapter');
    });

    it('HikvisionIsapiAdapter.triggerOpen должен выбрасывать BadRequestException, если учетные данные не настроены', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'HIKVISION_DEFAULT_USERNAME') return undefined;
        if (key === 'HIKVISION_DEFAULT_PASSWORD') return undefined;
        return undefined;
      });

      const hikAdapter = (service as any).hikvisionAdapter;
      await expect(
        hikAdapter.triggerOpen('http://192.168.1.120', 'HIKVISION_ISAPI'),
      ).rejects.toThrow('HIKVISION_CREDENTIALS_MISSING');

      try {
        await hikAdapter.triggerOpen('http://192.168.1.120', 'HIKVISION_ISAPI');
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.HIKVISION_CREDENTIALS_MISSING');
      }
    });

    it('HikvisionIsapiAdapter.triggerOpen должен обрабатывать digest-аутентификацию и успешно парсить ответ <statusCode>1</statusCode>', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'HIKVISION_DEFAULT_USERNAME') return 'admin';
        if (key === 'HIKVISION_DEFAULT_PASSWORD') return 'SecretPass123';
        return undefined;
      });

      const originalFetch = global.fetch;
      let fetchCallCount = 0;
      let secondCallAuthHeader = '';

      global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          // 401 Digest challenge
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: {
              get: (headerName: string) => {
                if (headerName.toLowerCase() === 'www-authenticate') {
                  return 'Digest realm="DS-KV8113", nonce="d29b019a842f4c1e", qop="auth"';
                }
                return null;
              },
            },
            text: () => Promise.resolve(''),
          });
        }

        // Second call with Authorization header
        secondCallAuthHeader = opts.headers.Authorization || '';
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              '<ResponseStatus version="2.0"><statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode></ResponseStatus>',
            ),
        });
      }) as any;

      try {
        const hikAdapter = (service as any).hikvisionAdapter;
        const res = await hikAdapter.triggerOpen('http://192.168.1.120', 'HIKVISION_ISAPI');

        expect(res.success).toBe(true);
        expect(fetchCallCount).toBe(2);
        expect(secondCallAuthHeader).toContain('Digest username="admin"');
        expect(secondCallAuthHeader).toContain('realm="DS-KV8113"');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('HikvisionIsapiAdapter.triggerOpen должен выбрасывать ошибку, если устройство вернуло ошибку в теле XML', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'HIKVISION_DEFAULT_USERNAME') return 'admin';
        if (key === 'HIKVISION_DEFAULT_PASSWORD') return 'SecretPass123';
        return undefined;
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            '<ResponseStatus version="2.0"><statusCode>4</statusCode><statusString>Device Error</statusString><errorMsg>Door 1 locked by schedule</errorMsg></ResponseStatus>',
          ),
      }) as any;

      try {
        const hikAdapter = (service as any).hikvisionAdapter;
        await expect(
          hikAdapter.triggerOpen('http://192.168.1.120', 'HIKVISION_ISAPI'),
        ).rejects.toThrow('HIKVISION_DEVICE_ERROR');

        try {
          await hikAdapter.triggerOpen('http://192.168.1.120', 'HIKVISION_ISAPI');
          fail('Should throw');
        } catch (err: any) {
          expect(err.getResponse().code).toBe('ACCESS_CONTROL.HIKVISION_DEVICE_ERROR');
          expect(err.getResponse().params).toEqual({ error: 'Door 1 locked by schedule' });
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('createAccessPoint и updateAccessPoint должны корректно сохранять точку доступа с проверкой прав', async () => {
      prismaMock.accessPoint.create.mockImplementation((args: any) => {
        return Promise.resolve({ id: 'ap-new', ...args.data });
      });

      const created = await service.createAccessPoint(
        { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' },
        'tenant-1',
        {
          name: 'Домофон Подъезд 2',
          type: AccessPointType.DOOR_INTERCOM,
          controllerType: 'HIKVISION_ISAPI',
          endpointUrl: 'http://192.168.1.130',
        },
      );

      expect(created.id).toBe('ap-new');
      expect(created.name).toBe('Домофон Подъезд 2');
      expect(created.type).toBe(AccessPointType.DOOR_INTERCOM);
      expect(created.controllerType).toBe('HIKVISION_ISAPI');

      // Блокировка жильца
      await expect(
        service.createAccessPoint(
          { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
          'tenant-1',
          {
            name: 'Домофон',
            type: AccessPointType.DOOR_INTERCOM,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('healthCheck должен вызывать checkHealth и возвращать информацию об устройстве', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue({
        id: 'ap-hik-1',
        tenantId: 'tenant-1',
        name: 'Домофон Вход',
        type: AccessPointType.DOOR_INTERCOM,
        controllerType: 'HIKVISION_ISAPI',
        endpointUrl: 'http://192.168.1.125',
      });

      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'HIKVISION_DEFAULT_USERNAME') return 'admin';
        if (key === 'HIKVISION_DEFAULT_PASSWORD') return 'SecretPass123';
        return undefined;
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            '<DeviceInfo version="2.0"><model>DS-KV8113-WME1</model><serialNumber>DS-KV81132026</serialNumber></DeviceInfo>',
          ),
      }) as any;

      try {
        const result = await service.healthCheck(
          { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' },
          'ap-hik-1',
        );

        expect(result.reachable).toBe(true);
        expect(result.model).toBe('DS-KV8113-WME1');
        expect(result.serialNumber).toBe('DS-KV81132026');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('createGuestPass (Оформление гостевых пропусков)', () => {
    const validUnitTenant1 = {
      id: 'unit-1',
      building: {
        tenantId: 'tenant-1',
      },
    };

    const validUnitTenant2 = {
      id: 'unit-2',
      building: {
        tenantId: 'tenant-2',
      },
    };

    const passDto = {
      unitId: 'unit-1',
      guestName: 'Азамат Гость',
      guestPlateNumber: '777KZ01',
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 86400000).toISOString(),
    };

    it('должен выбрасывать UNIT_NOT_FOUND (404) если квартира не существует', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(null);

      await expect(
        service.createGuestPass(
          { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' },
          passDto,
        ),
      ).rejects.toThrow(NotFoundException);

      prismaMock.unit.findUnique.mockResolvedValue(null);
      try {
        await service.createGuestPass(
          { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' },
          passDto,
        );
      } catch (err: any) {
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.UNIT_NOT_FOUND');
      }
    });

    it('персонал своего ЖК (DISPATCHER, HOA_ADMIN, SECURITY, HOA_CHAIRMAN) может успешно оформлять пропуск для любой квартиры своего ЖК', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(validUnitTenant1);
      prismaMock.guestPass.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'pass-123', ...args.data }),
      );

      const staffRoles = [
        UserRole.DISPATCHER,
        UserRole.HOA_ADMIN,
        UserRole.SECURITY,
        UserRole.HOA_CHAIRMAN,
      ];

      for (const role of staffRoles) {
        const pass = await service.createGuestPass(
          { id: `staff-${role}`, role, tenantId: 'tenant-1' },
          passDto,
        );
        expect(pass.id).toBe('pass-123');
        expect(pass.unitId).toBe('unit-1');
        expect(pass.guestName).toBe('Азамат Гость');
        expect(pass.accessCode).toBeDefined();
        expect(pass.creatorId).toBe(`staff-${role}`);
      }
    });

    it('персонал (DISPATCHER) чужого ЖК получает отказ с GUEST_PASS_CROSS_TENANT_FORBIDDEN', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(validUnitTenant2);

      await expect(
        service.createGuestPass(
          { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' },
          { ...passDto, unitId: 'unit-2' },
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.createGuestPass(
          { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' },
          { ...passDto, unitId: 'unit-2' },
        );
      } catch (err: any) {
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.GUEST_PASS_CROSS_TENANT_FORBIDDEN');
      }
    });

    it('житель со своей подтвержденной квартирой может успешно оформить пропуск', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(validUnitTenant1);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'res-1',
        unitId: 'unit-1',
        isVerified: true,
      });
      prismaMock.guestPass.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'pass-res-1', ...args.data }),
      );

      const pass = await service.createGuestPass(
        { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
        passDto,
      );

      expect(pass.id).toBe('pass-res-1');
      expect(pass.creatorId).toBe('res-1');
      expect(prismaMock.unitOwnership.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'res-1',
          unitId: 'unit-1',
          isVerified: true,
        },
      });
    });

    it('житель без подтвержденного права собственности получает GUEST_PASS_OWN_UNIT_ONLY', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(validUnitTenant1);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createGuestPass(
          { id: 'res-2', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
          passDto,
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.createGuestPass(
          { id: 'res-2', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
          passDto,
        );
      } catch (err: any) {
        expect(err.getResponse().code).toBe('ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY');
      }
    });

    it('SUPERADMIN обходит проверки владения и ЖК и может оформить пропуск', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(validUnitTenant2);
      prismaMock.guestPass.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'pass-super', ...args.data }),
      );

      const pass = await service.createGuestPass(
        { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null },
        { ...passDto, unitId: 'unit-2' },
      );

      expect(pass.id).toBe('pass-super');
      expect(pass.creatorId).toBe('super-1');
    });
  });

  describe('exportAccessLogsCsv (CSV экспорт журнала СКУД)', () => {
    const mockUserSecurity = {
      id: 'sec-1',
      role: UserRole.SECURITY,
      tenantId: 'tenant-1',
    };

    const mockUserAlien = {
      id: 'sec-alien',
      role: UserRole.SECURITY,
      tenantId: 'tenant-alien',
    };

    const sampleLogs = [
      {
        id: 'log-1',
        createdAt: new Date('2026-09-05T12:00:00Z'),
        action: 'OPEN_BARRIER',
        status: 'SUCCESS',
        accessPoint: { name: 'Шлагбаум Въезд', type: AccessPointType.BARRIER },
        user: { firstName: 'Арман', lastName: 'Жумабаев', phone: '+77015550101' },
        unit: { unitNumber: '101', building: { blockName: 'Блок А' } },
        note: 'Открыто через мобильное приложение',
      },
    ];

    beforeEach(() => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК Шанырақ Премиум',
      });
      prismaMock.accessLog.findMany.mockResolvedValue(sampleLogs);
    });

    it('должен по умолчанию применять диапазон за последние 30 дней, если from и to не переданы', async () => {
      const { filename } = await service.exportAccessLogsCsv('tenant-1', mockUserSecurity, {});

      expect(prismaMock.accessLog.findMany).toHaveBeenCalledTimes(1);
      const queryArgs = prismaMock.accessLog.findMany.mock.calls[0][0];

      expect(queryArgs.where.accessPoint.tenantId).toBe('tenant-1');
      expect(queryArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(queryArgs.where.createdAt.lte).toBeInstanceOf(Date);

      const diffDays = Math.round(
        (queryArgs.where.createdAt.lte.getTime() - queryArgs.where.createdAt.gte.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(30);
      expect(queryArgs.take).toBeUndefined();
      expect(filename).toMatch(/^access-log-tenant-1-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('должен выгружать все строки без ограничения take: 100 при наличии >100 записей (например 150)', async () => {
      const mock150Logs = Array.from({ length: 150 }, (_, i) => ({
        id: `log-${i}`,
        createdAt: new Date('2026-09-02T10:00:00Z'),
        action: 'OPEN_BARRIER',
        status: 'SUCCESS',
        accessPoint: { name: `Точка-${i}`, type: AccessPointType.BARRIER },
        user: { firstName: `Имя-${i}`, lastName: 'Тестов', phone: `+770100000${i}` },
        unit: { unitNumber: `${i + 1}`, building: { blockName: 'Блок Б' } },
        note: `Тестовая запись ${i}`,
      }));

      prismaMock.accessLog.findMany.mockResolvedValue(mock150Logs);

      const { buffer } = await service.exportAccessLogsCsv('tenant-1', mockUserSecurity, {
        from: '2026-09-01',
        to: '2026-09-10',
      });

      const queryArgs = prismaMock.accessLog.findMany.mock.calls[0][0];
      expect(queryArgs.take).toBeUndefined();

      const csvString = buffer.toString('utf-8');
      for (let i = 0; i < 150; i++) {
        expect(csvString).toContain(`Точка-${i}`);
        expect(csvString).toContain(`Имя-${i}`);
      }
    });

    it('сотрудник с ролью SECURITY может успешно экспортировать журнал своего ЖК', async () => {
      const result = await service.exportAccessLogsCsv('tenant-1', mockUserSecurity, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-08T00:00:00Z',
      });

      expect(result.buffer).toBeDefined();
      expect(result.filename).toBe('access-log-tenant-1-2026-09-01_2026-09-08.csv');
      const csvString = result.buffer.toString('utf-8');
      expect(csvString).toContain('ЖК Шанырақ Премиум');
      expect(csvString).toContain('Арман');
      expect(csvString).toContain('+77015550101');
    });

    it('сформированный CSV буфер должен содержать байты UTF-8 BOM (0xEF, 0xBB, 0xBF)', async () => {
      const { buffer } = await service.exportAccessLogsCsv('tenant-1', mockUserSecurity);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('должен блокировать экспорт чужого ЖК с ForbiddenException (межарендаторный доступ)', async () => {
      await expect(
        service.exportAccessLogsCsv('tenant-1', mockUserAlien, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.accessLog.findMany).not.toHaveBeenCalled();
    });

    it('SUPERADMIN может экспортировать журнал любого ЖК без ограничений', async () => {
      const superadminUser = {
        id: 'super-1',
        role: UserRole.SUPERADMIN,
        tenantId: null,
      };

      const result = await service.exportAccessLogsCsv('tenant-1', superadminUser);
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('access-log-tenant-1');
    });
  });
});
