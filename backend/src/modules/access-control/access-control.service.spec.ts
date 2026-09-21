import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import * as bcrypt from 'bcryptjs';
import { AccessPointType, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('AccessControlService (Аудит безопасности СКУД, IDOR и go2rtc)', () => {
  let service: AccessControlService;
  let prismaMock: any;
  let configServiceMock: any;
  let redisMock: any;
  let auditLogServiceMock: any;
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
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
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

    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RedisService, useValue: redisMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
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
        include: {
          unit: {
            include: {
              building: true,
            },
          },
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

  describe('Гостевые пропуска: статус, история и отзыв (Task 0044)', () => {
    describe('computeGuestPassStatus (Приоритет статусов)', () => {
      it('должен возвращать REVOKED даже если пропуск истёк (приоритет REVOKED над EXPIRED)', () => {
        const pastDate = new Date(Date.now() - 3600000);
        const status = service.computeGuestPassStatus({
          isRevoked: true,
          isUsed: false,
          validTo: pastDate,
        });
        expect(status).toBe('REVOKED');
      });

      it('должен возвращать REVOKED если пропуск был использован и затем отозван (приоритет REVOKED над USED)', () => {
        const futureDate = new Date(Date.now() + 3600000);
        const status = service.computeGuestPassStatus({
          isRevoked: true,
          isUsed: true,
          validTo: futureDate,
        });
        expect(status).toBe('REVOKED');
      });

      it('должен возвращать USED если пропуск использован, даже если срок действия истёк', () => {
        const pastDate = new Date(Date.now() - 3600000);
        const status = service.computeGuestPassStatus({
          isRevoked: false,
          isUsed: true,
          validTo: pastDate,
        });
        expect(status).toBe('USED');
      });

      it('должен возвращать EXPIRED для неиспользованного и неотозванного пропуска с истекшим сроком', () => {
        const pastDate = new Date(Date.now() - 3600000);
        const status = service.computeGuestPassStatus({
          isRevoked: false,
          isUsed: false,
          validTo: pastDate,
        });
        expect(status).toBe('EXPIRED');
      });

      it('должен возвращать ACTIVE для действующего неиспользованного и неотозванного пропуска', () => {
        const futureDate = new Date(Date.now() + 3600000);
        const status = service.computeGuestPassStatus({
          isRevoked: false,
          isUsed: false,
          validTo: futureDate,
        });
        expect(status).toBe('ACTIVE');
      });
    });

    describe('getGuestPassesForUnit (История для жителей)', () => {
      const residentUser = {
        id: 'res-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
      };

      it('должен возвращать пропуска квартиры с вычисленным статусом для верифицированного жильца', async () => {
        prismaMock.unitOwnership.findFirst.mockResolvedValue({
          id: 'own-1',
          userId: 'res-1',
          unitId: 'unit-1',
          isVerified: true,
        });

        prismaMock.guestPass.findMany.mockResolvedValue([
          {
            id: 'pass-1',
            unitId: 'unit-1',
            creatorId: 'res-1',
            guestName: 'Гость 1',
            accessCode: '123456',
            validFrom: new Date(),
            validTo: new Date(Date.now() + 3600000),
            isUsed: false,
            isRevoked: false,
            creator: { id: 'res-1', firstName: 'Азамат', lastName: 'Касымов', role: UserRole.RESIDENT_OWNER },
            revokedBy: null,
            unit: { id: 'unit-1', unitNumber: '101', building: { id: 'b-1', blockName: 'Блок А' } },
          },
        ]);

        const passes = await service.getGuestPassesForUnit('unit-1', residentUser);
        expect(passes).toHaveLength(1);
        expect(passes[0].status).toBe('ACTIVE');
        expect(passes[0].creator?.firstName).toBe('Азамат');
      });

      it('должен блокировать просмотр пропусков чужой/неверифицированной квартиры (IDOR защита)', async () => {
        prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

        await expect(
          service.getGuestPassesForUnit('unit-alien', residentUser),
        ).rejects.toThrow(ForbiddenException);

        expect(prismaMock.guestPass.findMany).not.toHaveBeenCalled();
      });

      it('SUPERADMIN может просматривать пропуска любой квартиры без привязки ownership', async () => {
        const superAdmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
        prismaMock.guestPass.findMany.mockResolvedValue([]);

        const passes = await service.getGuestPassesForUnit('unit-any', superAdmin);
        expect(passes).toEqual([]);
        expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
      });
    });

    describe('getGuestPassesForTenant (История для персонала)', () => {
      const staffUser = {
        id: 'staff-1',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-1',
      };
      const alienStaff = {
        id: 'staff-alien',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-alien',
      };

      it('сотрудник своего ЖК успешно получает пропуска с creator, unit и статусом', async () => {
        prismaMock.guestPass.findMany.mockResolvedValue([
          {
            id: 'pass-10',
            unitId: 'unit-1',
            creatorId: 'res-1',
            guestName: 'Курьер',
            validFrom: new Date(),
            validTo: new Date(Date.now() - 1000), // expired
            isUsed: false,
            isRevoked: false,
            creator: { id: 'res-1', firstName: 'Иван', lastName: 'Иванов', role: UserRole.RESIDENT_OWNER },
            revokedBy: null,
            unit: { id: 'unit-1', unitNumber: '101', building: { id: 'b-1', blockName: 'Блок А' } },
          },
        ]);

        const passes = await service.getGuestPassesForTenant('tenant-1', staffUser);
        expect(passes).toHaveLength(1);
        expect(passes[0].status).toBe('EXPIRED');
        expect(passes[0].unit.unitNumber).toBe('101');
      });

      it('сотрудник чужого ЖК блокируется с ForbiddenException', async () => {
        await expect(
          service.getGuestPassesForTenant('tenant-1', alienStaff),
        ).rejects.toThrow(ForbiddenException);

        expect(prismaMock.guestPass.findMany).not.toHaveBeenCalled();
      });

      it('при null revoker (удаленный/деактивированный аккаунт) запрос не падает', async () => {
        prismaMock.guestPass.findMany.mockResolvedValue([
          {
            id: 'pass-deleted-actor',
            unitId: 'unit-1',
            creatorId: 'res-1',
            guestName: 'Гость',
            validFrom: new Date(),
            validTo: new Date(Date.now() + 3600000),
            isUsed: false,
            isRevoked: true,
            revokedAt: new Date(),
            revokedById: 'deleted-user-id',
            creator: { id: 'res-1', firstName: 'Иван', lastName: 'Иванов', role: UserRole.RESIDENT_OWNER },
            revokedBy: null, // User was removed / null relation
            unit: { id: 'unit-1', unitNumber: '101', building: { id: 'b-1', blockName: 'Блок А' } },
          },
        ]);

        const passes = await service.getGuestPassesForTenant('tenant-1', staffUser);
        expect(passes).toHaveLength(1);
        expect(passes[0].status).toBe('REVOKED');
        expect(passes[0].revokedBy).toBeNull();
      });
    });

    describe('revokeGuestPass (Отзыв пропусков)', () => {
      const mockPass = {
        id: 'pass-rev-1',
        unitId: 'unit-1',
        creatorId: 'creator-res-1',
        guestName: 'Гость',
        accessCode: '654321',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 3600000),
        isUsed: false,
        isRevoked: false,
        unit: {
          id: 'unit-1',
          building: {
            id: 'b-1',
            tenantId: 'tenant-1',
          },
        },
      };

      it('создатель пропуска (житель) может успешно отозвать свой собственный пропуск', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);
        prismaMock.guestPass.update.mockResolvedValue({
          ...mockPass,
          isRevoked: true,
          revokedAt: new Date(),
          revokedById: 'creator-res-1',
        });

        const res = await service.revokeGuestPass('pass-rev-1', {
          id: 'creator-res-1',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        });

        expect(res.status).toBe('REVOKED');
        expect(prismaMock.guestPass.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'pass-rev-1' },
            data: expect.objectContaining({
              isRevoked: true,
              revokedById: 'creator-res-1',
            }),
          }),
        );
      });

      it('другой житель той же квартиры не может отозвать чужой пропуск', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);

        await expect(
          service.revokeGuestPass('pass-rev-1', {
            id: 'co-owner-res-2',
            role: UserRole.RESIDENT_OWNER,
            tenantId: 'tenant-1',
          }),
        ).rejects.toThrow(ForbiddenException);

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('сотрудник ЖК (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY) может отозвать любой пропуск своего ЖК', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);
        prismaMock.guestPass.update.mockResolvedValue({
          ...mockPass,
          isRevoked: true,
          revokedAt: new Date(),
          revokedById: 'security-1',
        });

        const res = await service.revokeGuestPass('pass-rev-1', {
          id: 'security-1',
          role: UserRole.SECURITY,
          tenantId: 'tenant-1',
        });

        expect(res.status).toBe('REVOKED');
        expect(prismaMock.guestPass.update).toHaveBeenCalled();
      });

      it('сотрудник другого ЖК блокируется при попытке отзыва пропуска', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);

        await expect(
          service.revokeGuestPass('pass-rev-1', {
            id: 'security-alien',
            role: UserRole.SECURITY,
            tenantId: 'tenant-alien',
          }),
        ).rejects.toThrow(ForbiddenException);

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('SUPERADMIN может отозвать любой пропуск в системе', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);
        prismaMock.guestPass.update.mockResolvedValue({
          ...mockPass,
          isRevoked: true,
          revokedAt: new Date(),
          revokedById: 'super-admin-1',
        });

        const res = await service.revokeGuestPass('pass-rev-1', {
          id: 'super-admin-1',
          role: UserRole.SUPERADMIN,
          tenantId: null,
        });

        expect(res.status).toBe('REVOKED');
      });

      it('повторный отзыв уже отозванного пропуска отклоняется с BadRequestException (идемпотентность)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue({
          ...mockPass,
          isRevoked: true,
          revokedAt: new Date(),
          revokedById: 'creator-res-1',
        });

        await expect(
          service.revokeGuestPass('pass-rev-1', {
            id: 'creator-res-1',
            role: UserRole.RESIDENT_OWNER,
            tenantId: 'tenant-1',
          }),
        ).rejects.toThrow(BadRequestException);

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('отзыв несуществующего пропуска отклоняется с NotFoundException', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(null);

        await expect(
          service.revokeGuestPass('non-existent', {
            id: 'creator-res-1',
            role: UserRole.RESIDENT_OWNER,
            tenantId: 'tenant-1',
          }),
        ).rejects.toThrow(NotFoundException);

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });
    });

    describe('redeemGuestPass (Task 0088: One-time redemption)', () => {
      const now = Date.now();
      const mockActivePass = {
        id: 'pass-redeem-1',
        unitId: 'unit-1',
        creatorId: 'creator-res-1',
        guestName: 'Нурлан Гостев',
        guestPlateNumber: '777KZ01',
        accessCode: '123456',
        isRevoked: false,
        isUsed: false,
        usedAt: null,
        validFrom: new Date(now - 3600000), // 1 hour ago
        validTo: new Date(now + 3600000),   // 1 hour later
        unit: {
          building: {
            tenantId: 'tenant-1',
          },
        },
      };

      const staffUser = {
        id: 'security-1',
        role: UserRole.SECURITY,
        tenantId: 'tenant-1',
      };

      it('успешно подтверждает вход (isUsed: true, usedAt), логирует GUEST_PASS_REDEEMED и возвращает статус USED', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockActivePass);
        prismaMock.guestPass.update.mockResolvedValue({
          ...mockActivePass,
          isUsed: true,
          usedAt: new Date(),
        });

        const res = await service.redeemGuestPass('pass-redeem-1', staffUser);

        expect(res.status).toBe('USED');
        expect(res.isUsed).toBe(true);
        expect(prismaMock.guestPass.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'pass-redeem-1' },
            data: {
              isUsed: true,
              usedAt: expect.any(Date),
            },
          }),
        );
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          actorId: 'security-1',
          action: 'GUEST_PASS_REDEEMED',
          targetType: 'GuestPass',
          targetId: 'pass-redeem-1',
          metadata: {
            guestName: 'Нурлан Гостев',
            guestPlateNumber: '777KZ01',
            unitId: 'unit-1',
          },
        });
      });

      it('отклоняет подтверждение несуществующего пропуска (404 ACCESS_CONTROL.GUEST_PASS_NOT_FOUND)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(null);

        await expect(
          service.redeemGuestPass('non-existent', staffUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_NOT_FOUND',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('блокирует сотрудника чужого ЖК (403 ACCESS_CONTROL.GUEST_PASS_REDEEM_FORBIDDEN)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockActivePass);

        const foreignStaff = {
          id: 'alien-sec-1',
          role: UserRole.SECURITY,
          tenantId: 'tenant-OTHER',
        };

        await expect(
          service.redeemGuestPass('pass-redeem-1', foreignStaff),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_REDEEM_FORBIDDEN',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('блокирует не-сотрудника (например жильца) (403 ACCESS_CONTROL.GUEST_PASS_REDEEM_FORBIDDEN)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockActivePass);

        const residentUser = {
          id: 'creator-res-1',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };

        await expect(
          service.redeemGuestPass('pass-redeem-1', residentUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_REDEEM_FORBIDDEN',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('отклоняет повторное использование уже использованного пропуска (400 ACCESS_CONTROL.GUEST_PASS_ALREADY_USED)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue({
          ...mockActivePass,
          isUsed: true,
          usedAt: new Date(now - 10000),
        });

        await expect(
          service.redeemGuestPass('pass-redeem-1', staffUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_ALREADY_USED',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('отклоняет подтверждение отозванного пропуска (400 ACCESS_CONTROL.GUEST_PASS_REVOKED)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue({
          ...mockActivePass,
          isRevoked: true,
          revokedAt: new Date(now - 5000),
        });

        await expect(
          service.redeemGuestPass('pass-redeem-1', staffUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_REVOKED',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('отклоняет подтверждение еще не наступившего пропуска (400 ACCESS_CONTROL.GUEST_PASS_NOT_YET_VALID)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue({
          ...mockActivePass,
          validFrom: new Date(now + 3600000), // in the future
          validTo: new Date(now + 7200000),
        });

        await expect(
          service.redeemGuestPass('pass-redeem-1', staffUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_NOT_YET_VALID',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('отклоняет подтверждение истекшего пропуска (400 ACCESS_CONTROL.GUEST_PASS_EXPIRED)', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue({
          ...mockActivePass,
          validFrom: new Date(now - 7200000),
          validTo: new Date(now - 3600000), // in the past
        });

        await expect(
          service.redeemGuestPass('pass-redeem-1', staffUser),
        ).rejects.toMatchObject({
          response: {
            code: 'ACCESS_CONTROL.GUEST_PASS_EXPIRED',
          },
        });

        expect(prismaMock.guestPass.update).not.toHaveBeenCalled();
      });

      it('разрешает SUPERADMIN подтверждать вход пропуска любого ЖК', async () => {
        prismaMock.guestPass.findUnique.mockResolvedValue(mockActivePass);
        prismaMock.guestPass.update.mockResolvedValue({
          ...mockActivePass,
          isUsed: true,
          usedAt: new Date(),
        });

        const superAdmin = {
          id: 'super-1',
          role: UserRole.SUPERADMIN,
          tenantId: null,
        };

        const res = await service.redeemGuestPass('pass-redeem-1', superAdmin);

        expect(res.status).toBe('USED');
        expect(res.isUsed).toBe(true);
        expect(prismaMock.guestPass.update).toHaveBeenCalled();
      });
    });
  });

  // -----------------------------------------------------------------------
  // exportGuestPassesCsv (Task 0062: Guest pass history CSV export)
  // -----------------------------------------------------------------------
  describe('exportGuestPassesCsv (Task 0062: CSV export гостевых пропусков)', () => {
    const mockHoaAdmin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
    const mockSecurity = { id: 'sec-1', role: UserRole.SECURITY, tenantId: 'tenant-1' };
    const mockSuperadmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
    const mockAlienStaff = { id: 'admin-alien', role: UserRole.HOA_ADMIN, tenantId: 'tenant-alien' };

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const makePass = (overrides: Partial<any> = {}) => ({
      id: 'pass-1',
      createdAt: new Date('2026-09-10T12:00:00Z'),
      guestName: 'Иван Гостев',
      guestPlateNumber: '123ABC01',
      validFrom: new Date('2026-09-10T14:00:00Z'),
      validTo: futureDate,
      isRevoked: false,
      isUsed: false,
      revokedAt: null,
      creator: { id: 'res-1', firstName: 'Арман', lastName: 'Жаксыбек', role: UserRole.RESIDENT_OWNER },
      revokedBy: null,
      unit: { id: 'unit-1', unitNumber: '101', building: { id: 'bld-1', blockName: 'Блок А' } },
      ...overrides,
    });

    beforeEach(() => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'ЖК Шанырақ Премиум' });
      prismaMock.guestPass.findMany.mockResolvedValue([makePass()]);
    });

    it('пропуск за пределами диапазона дат исключается, пропуск внутри — включается', async () => {
      // Query: only passes created from 2026-09-05 to 2026-09-12
      const from = '2026-09-05T00:00:00Z';
      const to = '2026-09-12T00:00:00Z';

      await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin, { from, to });

      expect(prismaMock.guestPass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            unit: { building: { tenantId: 'tenant-1' } },
            createdAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        }),
      );

      // A pass created on 2026-09-10 IS within range — it should be returned
      const { buffer } = await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin, { from, to });
      const csv = buffer.toString('utf-8');
      expect(csv).toContain('Иван Гостев');
    });

    it('каждый из четырёх вычисленных статусов отображается русской меткой в CSV', async () => {
      const revokedPass = makePass({ isRevoked: true, revokedAt: new Date(), revokedBy: { id: 's1', firstName: 'Данияр', lastName: 'Сейт', role: UserRole.HOA_ADMIN } });
      const usedPass = makePass({ id: 'pass-used', isUsed: true });
      const expiredPass = makePass({ id: 'pass-exp', validTo: pastDate });
      const activePass = makePass({ id: 'pass-active' }); // validTo is futureDate

      prismaMock.guestPass.findMany.mockResolvedValue([revokedPass, usedPass, expiredPass, activePass]);

      const { buffer } = await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin, {});
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('Отозван');
      expect(csv).toContain('Использован');
      expect(csv).toContain('Истёк');
      expect(csv).toContain('Активен');
    });

    it('сотрудник того же ЖК (HOA_ADMIN) проходит проверку tenant и получает CSV', async () => {
      const { buffer, filename } = await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin, {});

      expect(buffer).toBeDefined();
      expect(filename).toContain('guest-passes-tenant-1');
      const csv = buffer.toString('utf-8');
      expect(csv).toContain('ЖК Шанырақ Премиум');
    });

    it('сотрудник чужого ЖК получает ForbiddenException (межарендаторная защита)', async () => {
      await expect(
        service.exportGuestPassesCsv('tenant-1', mockAlienStaff, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.guestPass.findMany).not.toHaveBeenCalled();
    });

    it('сформированный CSV буфер начинается с байтов UTF-8 BOM (0xEF, 0xBB, 0xBF)', async () => {
      const { buffer } = await service.exportGuestPassesCsv('tenant-1', mockSecurity, {});

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('при отсутствии from/to диапазон по умолчанию равен последним 30 дням', async () => {
      await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin);

      expect(prismaMock.guestPass.findMany).toHaveBeenCalledTimes(1);
      const queryArgs = prismaMock.guestPass.findMany.mock.calls[0][0];

      expect(queryArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(queryArgs.where.createdAt.lte).toBeInstanceOf(Date);

      const diffDays = Math.round(
        (queryArgs.where.createdAt.lte.getTime() - queryArgs.where.createdAt.gte.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(30);
    });

    it('SUPERADMIN может экспортировать пропуска любого ЖК', async () => {
      const { buffer, filename } = await service.exportGuestPassesCsv('tenant-1', mockSuperadmin, {});

      expect(buffer).toBeDefined();
      expect(filename).toContain('guest-passes-tenant-1');
    });

    it('имя файла соответствует шаблону guest-passes-{tenantId}-{from}_{to}.csv', async () => {
      const { filename } = await service.exportGuestPassesCsv('tenant-1', mockHoaAdmin, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-14T00:00:00Z',
      });

      expect(filename).toBe('guest-passes-tenant-1-2026-09-01_2026-09-14.csv');
    });
  });

  // -----------------------------------------------------------------------
  // Audit logging (Task 0081: Audit trail expansion)
  // -----------------------------------------------------------------------
  describe('Audit logging (Task 0081: ACCESS_POINT and GUEST_PASS actions)', () => {
    const adminUser = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
    const residentUser = { id: 'resident-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

    it('createAccessPoint: логирует ACCESS_POINT_CREATED на успехе и не логирует при ошибке прав', async () => {
      prismaMock.accessPoint.create.mockResolvedValue({
        id: 'ap-new-1',
        tenantId: 'tenant-1',
        name: 'Шлагбаум Западный',
        type: AccessPointType.BARRIER,
      });

      const res = await service.createAccessPoint(adminUser, 'tenant-1', {
        name: 'Шлагбаум Западный',
        type: AccessPointType.BARRIER,
      });

      expect(res.id).toBe('ap-new-1');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'ACCESS_POINT_CREATED',
        targetType: 'AccessPoint',
        targetId: 'ap-new-1',
        metadata: {
          name: 'Шлагбаум Западный',
          type: AccessPointType.BARRIER,
        },
      });

      auditLogServiceMock.log.mockClear();

      // Ошибка прав: житель пытается создать точку доступа
      await expect(
        service.createAccessPoint(residentUser, 'tenant-1', {
          name: 'Шлагбаум',
          type: AccessPointType.BARRIER,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('updateAccessPoint: логирует ACCESS_POINT_UPDATED с before/after на успехе и не логирует если не найдено', async () => {
      const existingAp = {
        id: 'ap-1',
        tenantId: 'tenant-1',
        name: 'Старое имя',
        type: AccessPointType.BARRIER,
        isActive: true,
      };

      prismaMock.accessPoint.findUnique.mockResolvedValue(existingAp);
      prismaMock.accessPoint.update.mockResolvedValue({
        ...existingAp,
        name: 'Новое имя',
        isActive: false,
      });

      const res = await service.updateAccessPoint(adminUser, 'ap-1', {
        name: 'Новое имя',
        isActive: false,
      });

      expect(res.name).toBe('Новое имя');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'ACCESS_POINT_UPDATED',
        targetType: 'AccessPoint',
        targetId: 'ap-1',
        metadata: {
          before: {
            name: 'Старое имя',
            type: AccessPointType.BARRIER,
            isActive: true,
          },
          after: {
            name: 'Новое имя',
            isActive: false,
          },
        },
      });

      auditLogServiceMock.log.mockClear();

      // Не найдено
      prismaMock.accessPoint.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAccessPoint(adminUser, 'non-existent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('createGuestPass: логирует GUEST_PASS_ISSUED на успехе и не логирует при ошибке прав', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-10',
        building: { tenantId: 'tenant-1' },
      });
      prismaMock.guestPass.create.mockResolvedValue({
        id: 'pass-issued-1',
        unitId: 'unit-10',
        creatorId: 'admin-1',
        guestName: 'Алихан',
      });

      const res = await service.createGuestPass(adminUser, {
        unitId: 'unit-10',
        guestName: 'Алихан',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(res.id).toBe('pass-issued-1');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'GUEST_PASS_ISSUED',
        targetType: 'GuestPass',
        targetId: 'pass-issued-1',
        metadata: {
          guestName: 'Алихан',
          unitId: 'unit-10',
        },
      });

      auditLogServiceMock.log.mockClear();

      // Ошибка: юнит в другом ЖК для персонала
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-10',
        building: { tenantId: 'tenant-OTHER' },
      });
      await expect(
        service.createGuestPass(adminUser, {
          unitId: 'unit-10',
          guestName: 'Алихан',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 3600000).toISOString(),
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('createGuestPass: резидент успешно логирует GUEST_PASS_ISSUED с tenantId из ownership.unit.building.tenantId', async () => {
      const residentUser = {
        id: 'res-audit-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: null, // У резидента нет direct tenantId в таблице User
      };

      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-audit-1',
        userId: 'res-audit-1',
        unitId: 'unit-audit-10',
        isVerified: true,
        unit: {
          id: 'unit-audit-10',
          building: {
            id: 'b-audit-1',
            tenantId: 'tenant-from-building-100',
          },
        },
      });

      prismaMock.guestPass.create.mockResolvedValue({
        id: 'pass-resident-audit-1',
        unitId: 'unit-audit-10',
        creatorId: 'res-audit-1',
        guestName: 'Дамир',
      });

      const res = await service.createGuestPass(residentUser, {
        unitId: 'unit-audit-10',
        guestName: 'Дамир',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 3600000).toISOString(),
      });

      expect(res.id).toBe('pass-resident-audit-1');
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-from-building-100',
        actorId: 'res-audit-1',
        action: 'GUEST_PASS_ISSUED',
        targetType: 'GuestPass',
        targetId: 'pass-resident-audit-1',
        metadata: {
          guestName: 'Дамир',
          unitId: 'unit-audit-10',
        },
      });
    });

    it('revokeGuestPass: логирует GUEST_PASS_REVOKED на успехе и не логирует при повторном отзыве', async () => {
      const mockPass = {
        id: 'pass-rev-audit-1',
        unitId: 'unit-1',
        creatorId: 'admin-1',
        guestName: 'Айдар',
        isRevoked: false,
        isUsed: false,
        validTo: new Date(Date.now() + 3600000),
        unit: {
          building: { tenantId: 'tenant-1' },
        },
      };

      prismaMock.guestPass.findUnique.mockResolvedValue(mockPass);
      prismaMock.guestPass.update.mockResolvedValue({
        ...mockPass,
        isRevoked: true,
      });

      await service.revokeGuestPass('pass-rev-audit-1', adminUser);

      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'GUEST_PASS_REVOKED',
        targetType: 'GuestPass',
        targetId: 'pass-rev-audit-1',
        metadata: {
          guestName: 'Айдар',
          unitId: 'unit-1',
        },
      });

      auditLogServiceMock.log.mockClear();

      // Повторный отзыв
      prismaMock.guestPass.findUnique.mockResolvedValue({
        ...mockPass,
        isRevoked: true,
      });
      await expect(service.revokeGuestPass('pass-rev-audit-1', adminUser)).rejects.toThrow(
        BadRequestException,
      );

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });
  });
});
