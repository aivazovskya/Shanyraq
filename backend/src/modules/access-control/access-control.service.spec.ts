import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AccessPointType, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AccessControlService (Аудит безопасности СКУД, IDOR и go2rtc)', () => {
  let service: AccessControlService;
  let prismaMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      accessPoint: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      accessLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      guestPass: {
        create: jest.fn(),
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

  describe('getCameraStream (Безопасная интеграция с go2rtc)', () => {
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

      const res = await service.getCameraStream('resident-1', UserRole.RESIDENT_OWNER, 'cam-10');

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
        service.getCameraStream('resident-alien', UserRole.RESIDENT_OWNER, 'cam-10'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять запрос потока, если точка доступа не является камерой', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue({
        id: 'barrier-1',
        tenantId: 'tenant-1',
        type: AccessPointType.BARRIER,
        isActive: true,
      });

      await expect(
        service.getCameraStream('resident-1', UserRole.RESIDENT_OWNER, 'barrier-1'),
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

  describe('openBarrier (Достоверный аудит-трейл)', () => {
    const mockBarrier = {
      id: 'barrier-1',
      tenantId: 'tenant-1',
      name: 'Шлагбаум Въезд',
      type: AccessPointType.BARRIER,
      controllerType: 'PAL_ES',
    };

    it('должен сохранять в аудит-лог истинную квартиру жителя из базы, а не поддельный unitId из запроса', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'resident-1',
        unitId: 'unit-real-101',
        isVerified: true,
      });

      prismaMock.accessLog.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'log-1', createdAt: new Date(), ...args.data }),
      );

      const res = await service.openBarrier('resident-1', UserRole.RESIDENT_OWNER, {
        accessPointId: 'barrier-1',
        unitId: 'unit-fake-999',
      });

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

    it('должен блокировать открытие шлагбаума и фиксировать DENIED в логе при отсутствии прав', async () => {
      prismaMock.accessPoint.findUnique.mockResolvedValue(mockBarrier);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.openBarrier('unverified-user', UserRole.RESIDENT_OWNER, {
          accessPointId: 'barrier-1',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.accessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DENIED',
          }),
        }),
      );
    });
  });
});
