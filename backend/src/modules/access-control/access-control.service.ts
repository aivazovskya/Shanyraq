import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import {
  OpenBarrierDto,
  CreateGuestPassDto,
  CreateAccessPointDto,
  UpdateAccessPointDto,
} from './dto/access-control.dto';
import { AccessPointType, UserRole } from '@prisma/client';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';

export interface IBarrierAdapter {
  triggerOpen(endpointUrl: string, controllerType: string): Promise<{ success: boolean; latencyMs: number }>;
}

@Injectable()
export class MockBarrierAdapter implements IBarrierAdapter {
  async triggerOpen(endpointUrl: string, controllerType: string): Promise<{ success: boolean; latencyMs: number }> {
    console.log(`[HARDWARE-RELAY] 🚧 Подача сигнала на реле шлагбаума: ${endpointUrl} (Протокол: ${controllerType})`);
    return { success: true, latencyMs: 180 };
  }
}

/**
 * Digest Authentication Helper Functions
 */
function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const cleaned = header.replace(/^Digest\s+/i, '');
  const matches = cleaned.matchAll(/(\w+)=(?:"([^"]+)"|([^\s,]+))/g);
  for (const match of matches) {
    params[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return params;
}

function buildDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>,
): string {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop || '';
  const opaque = challenge.opaque;
  const algorithm = challenge.algorithm || 'MD5';

  const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  let response = '';
  if (qop && qop.split(',').map((s) => s.trim()).includes('auth')) {
    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop && qop.split(',').map((s) => s.trim()).includes('auth')) {
    header += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }
  if (opaque) {
    header += `, opaque="${opaque}"`;
  }
  if (challenge.algorithm) {
    header += `, algorithm=${algorithm}`;
  }
  return header;
}

@Injectable()
export class HikvisionIsapiAdapter implements IBarrierAdapter {
  private readonly logger = new Logger(HikvisionIsapiAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async triggerOpen(endpointUrl: string, controllerType: string): Promise<{ success: boolean; latencyMs: number }> {
    const username = this.configService.get<string>('HIKVISION_DEFAULT_USERNAME');
    const password = this.configService.get<string>('HIKVISION_DEFAULT_PASSWORD');

    if (!username || !password) {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_CREDENTIALS_MISSING',
        message:
          'HIKVISION_CREDENTIALS_MISSING: Учетные данные домофона Hikvision не настроены (HIKVISION_DEFAULT_USERNAME/HIKVISION_DEFAULT_PASSWORD)',
      });
    }

    const startTime = Date.now();
    const cleanUrl = endpointUrl.replace(/\/+$/, '');
    const targetUrl = `${cleanUrl}/ISAPI/AccessControl/RemoteControl/door/1`;
    const xmlBody = '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>';

    let res: Response;
    try {
      res = await this.executeDigestRequest(targetUrl, 'PUT', xmlBody, username, password);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Hikvision connection error (${cleanUrl}): ${err.message || err}`, err.stack);
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_CONNECTION_ERROR',
        message: 'HIKVISION_CONNECTION_ERROR: Ошибка связи с домофоном',
      });
    }

    const responseText = await res.text();
    const latencyMs = Date.now() - startTime;

    // Parse XML response
    const statusCodeMatch = responseText.match(/<statusCode>(\d+)<\/statusCode>/i);
    const statusStringMatch = responseText.match(/<statusString>([^<]+)<\/statusString>/i);
    const subStatusMatch = responseText.match(/<subStatusCode>([^<]+)<\/subStatusCode>/i);
    const errorMsgMatch = responseText.match(/<errorMsg>([^<]+)<\/errorMsg>/i);

    const statusCode = statusCodeMatch ? statusCodeMatch[1] : null;
    const statusString = statusStringMatch ? statusStringMatch[1] : null;
    const subStatus = subStatusMatch ? subStatusMatch[1] : null;
    const errorMsg = errorMsgMatch ? errorMsgMatch[1] : null;

    const isSuccess = statusCode === '1' && (statusString?.toUpperCase() === 'OK' || subStatus?.toLowerCase() === 'ok');

    if (!isSuccess && (statusCode !== null || !res.ok)) {
      const errMsg = errorMsg || statusString || subStatus || `HTTP ${res.status}`;
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_DEVICE_ERROR',
        message: `HIKVISION_DEVICE_ERROR: Домофон отклонил команду открытия: ${errMsg}`,
        params: { error: errMsg },
      });
    }

    return { success: true, latencyMs };
  }

  async checkHealth(endpointUrl: string): Promise<{ reachable: boolean; model?: string; serialNumber?: string; latencyMs: number }> {
    const username = this.configService.get<string>('HIKVISION_DEFAULT_USERNAME');
    const password = this.configService.get<string>('HIKVISION_DEFAULT_PASSWORD');

    if (!username || !password) {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_CREDENTIALS_MISSING',
        message:
          'HIKVISION_CREDENTIALS_MISSING: Учетные данные домофона Hikvision не настроены (HIKVISION_DEFAULT_USERNAME/HIKVISION_DEFAULT_PASSWORD)',
      });
    }

    const startTime = Date.now();
    const cleanUrl = endpointUrl.replace(/\/+$/, '');
    const targetUrl = `${cleanUrl}/ISAPI/System/deviceInfo`;

    let res: Response;
    try {
      res = await this.executeDigestRequest(targetUrl, 'GET', undefined, username, password);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Hikvision connection error (${cleanUrl}): ${err.message || err}`, err.stack);
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_CONNECTION_ERROR',
        message: 'HIKVISION_CONNECTION_ERROR: Устройство недоступно',
      });
    }

    const responseText = await res.text();
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HIKVISION_DEVICE_ERROR',
        message: `HIKVISION_DEVICE_ERROR: Ошибка проверки связи: HTTP ${res.status}`,
        params: { status: res.status },
      });
    }

    const modelMatch = responseText.match(/<model>([^<]+)<\/model>/i);
    const serialMatch = responseText.match(/<serialNumber>([^<]+)<\/serialNumber>/i);

    return {
      reachable: true,
      model: modelMatch ? modelMatch[1] : undefined,
      serialNumber: serialMatch ? serialMatch[1] : undefined,
      latencyMs,
    };
  }

  private async executeDigestRequest(
    targetUrl: string,
    method: string,
    body?: string,
    username?: string,
    password?: string,
  ): Promise<Response> {
    const parsed = new URL(targetUrl);
    const uri = parsed.pathname + parsed.search;

    const initialHeaders: Record<string, string> = {};
    if (body) {
      initialHeaders['Content-Type'] = 'application/xml';
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method,
        headers: initialHeaders,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new BadRequestException({
          code: 'ACCESS_CONTROL.HIKVISION_TIMEOUT',
          message: 'HIKVISION_TIMEOUT: Превышено время ожидания ответа (5 сек)',
        });
      }
      throw err;
    }

    if (response.status === 401 && username && password) {
      const authHeader = response.headers.get('www-authenticate');
      if (authHeader && authHeader.toLowerCase().startsWith('digest')) {
        const challenge = parseDigestChallenge(authHeader);
        const digestAuth = buildDigestHeader(method, uri, username, password, challenge);

        const retryHeaders: Record<string, string> = {
          ...initialHeaders,
          Authorization: digestAuth,
        };

        try {
          response = await fetch(targetUrl, {
            method,
            headers: retryHeaders,
            body,
            signal: AbortSignal.timeout(5000),
          });
        } catch (err: any) {
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            throw new BadRequestException({
              code: 'ACCESS_CONTROL.HIKVISION_TIMEOUT',
              message: 'HIKVISION_TIMEOUT: Превышено время ожидания ответа (5 сек)',
            });
          }
          throw err;
        }
      }
    }

    return response;
  }
}

@Injectable()
export class AccessControlService {
  private mockAdapter: IBarrierAdapter = new MockBarrierAdapter();
  private hikvisionAdapter: HikvisionIsapiAdapter;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.hikvisionAdapter = new HikvisionIsapiAdapter(this.configService);
  }

  private resolveAdapter(controllerType: string): IBarrierAdapter {
    if (controllerType === 'HIKVISION_ISAPI') {
      return this.hikvisionAdapter;
    }
    return this.mockAdapter;
  }

  async getAccessPoints(tenantId: string, userRole: UserRole) {
    const points = await this.prisma.accessPoint.findMany({
      where: { tenantId, isActive: true },
      orderBy: { type: 'asc' },
    });

    const isPrivilegedStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN] as UserRole[]).includes(userRole);

    // Аудит безопасности: скрываем сырые RTSP-креды и адреса внутренних контроллеров от обычных жителей
    if (!isPrivilegedStaff) {
      return points.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        name: p.name,
        type: p.type,
        controllerType: p.controllerType,
        streamName: p.streamName,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    }

    return points;
  }

  async createAccessPoint(
    user: { id: string; role: UserRole; tenantId?: string | null },
    tenantId: string,
    dto: CreateAccessPointDto,
  ) {
    const isPrivilegedStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN] as UserRole[]).includes(user.role);
    if (!isPrivilegedStaff) {
      throw new ForbiddenException({
        code: 'ACCESS_CONTROL.ADMIN_ONLY_CREATE',
        message: 'Только администраторы могут создавать точки доступа',
      });
    }
    assertUserBelongsToTenant(user, tenantId, 'точек доступа');

    return this.prisma.accessPoint.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
        controllerType: dto.controllerType || 'PAL_ES',
        endpointUrl: dto.endpointUrl?.trim() || null,
        rtspStreamUrl: dto.rtspStreamUrl?.trim() || null,
        streamName: dto.streamName?.trim() || null,
      },
    });
  }

  async updateAccessPoint(
    user: { id: string; role: UserRole; tenantId?: string | null },
    accessPointId: string,
    dto: UpdateAccessPointDto,
  ) {
    const isPrivilegedStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN] as UserRole[]).includes(user.role);
    if (!isPrivilegedStaff) {
      throw new ForbiddenException({
        code: 'ACCESS_CONTROL.ADMIN_ONLY_UPDATE',
        message: 'Только администраторы могут изменять точки доступа',
      });
    }

    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: accessPointId },
    });
    if (!accessPoint) {
      throw new NotFoundException({
        code: 'ACCESS_CONTROL.ACCESS_POINT_NOT_FOUND',
        message: 'Точка доступа не найдена',
      });
    }

    assertUserBelongsToTenant(user, accessPoint.tenantId, 'точек доступа');

    return this.prisma.accessPoint.update({
      where: { id: accessPointId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.controllerType !== undefined && { controllerType: dto.controllerType.trim() }),
        ...(dto.endpointUrl !== undefined && { endpointUrl: dto.endpointUrl?.trim() || null }),
        ...(dto.rtspStreamUrl !== undefined && { rtspStreamUrl: dto.rtspStreamUrl?.trim() || null }),
        ...(dto.streamName !== undefined && { streamName: dto.streamName?.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async healthCheck(
    user: { id: string; role: UserRole; tenantId?: string | null },
    accessPointId: string,
  ) {
    const isPrivilegedStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN] as UserRole[]).includes(user.role);
    if (!isPrivilegedStaff) {
      throw new ForbiddenException({
        code: 'ACCESS_CONTROL.ADMIN_ONLY_HEALTH_CHECK',
        message: 'Только администраторы могут выполнять проверку связи с оборудованием',
      });
    }

    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: accessPointId },
    });
    if (!accessPoint) {
      throw new NotFoundException({
        code: 'ACCESS_CONTROL.ACCESS_POINT_NOT_FOUND',
        message: 'Точка доступа не найдена',
      });
    }

    assertUserBelongsToTenant(user, accessPoint.tenantId, 'точек доступа');

    if (accessPoint.controllerType !== 'HIKVISION_ISAPI') {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.HEALTH_CHECK_ISAPI_ONLY',
        message: 'Проверка связи по протоколу ISAPI доступна только для контроллеров HIKVISION_ISAPI',
      });
    }

    if (!accessPoint.endpointUrl) {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.ENDPOINT_URL_MISSING',
        message: 'У точки доступа не указан endpointUrl (IP-адрес прибора)',
      });
    }

    return this.hikvisionAdapter.checkHealth(accessPoint.endpointUrl);
  }

  async getCameraStream(
    user: { id: string; role: UserRole; tenantId?: string | null },
    accessPointId: string,
  ) {
    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: accessPointId },
    });

    if (!accessPoint || !accessPoint.isActive) {
      throw new NotFoundException({
        code: 'ACCESS_CONTROL.CAMERA_NOT_FOUND',
        message: 'Камера не найдена или отключена',
      });
    }

    if (accessPoint.type !== AccessPointType.CAMERA) {
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.NOT_A_CAMERA',
        message: 'Указанная точка доступа не является видеокамерой',
      });
    }

    const isStaff = ([
      UserRole.SUPERADMIN,
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.SECURITY,
      UserRole.DISPATCHER,
    ] as UserRole[]).includes(user.role);

    if (isStaff) {
      // Аудит безопасности: персонал (кроме SUPERADMIN) может просматривать камеры только своего ЖК
      if (user.role !== UserRole.SUPERADMIN && accessPoint.tenantId !== user.tenantId) {
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.STAFF_CAMERA_CROSS_TENANT_FORBIDDEN',
          message: 'Персонал имеет доступ к видеокамерам только своего жилого комплекса',
        });
      }
    } else {
      // Validate resident has verified apartment in this tenant
      const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId: user.id,
          isVerified: true,
          unit: {
            building: {
              tenantId: accessPoint.tenantId,
            },
          },
        },
      });

      if (!verifiedOwnership) {
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.RESIDENT_CAMERA_ACCESS_FORBIDDEN',
          message: 'У вас нет подтвержденного доступа к видеокамерам данного жилого комплекса',
        });
      }
    }

    const streamName = accessPoint.streamName || accessPoint.id;
    const go2rtcBaseUrl = this.configService.get<string>('GO2RTC_API_URL', 'http://localhost:1984');
    const wsBaseUrl = go2rtcBaseUrl.replace(/^http/, 'ws');

    return {
      accessPointId: accessPoint.id,
      name: accessPoint.name,
      streamName,
      // Безопасные endpoints go2rtc: сырой RTSP с логином и паролем камеры на клиента не отдается
      endpoints: {
        webrtcWs: `${wsBaseUrl}/api/ws?src=${streamName}`,
        hls: `${go2rtcBaseUrl}/api/stream.m3u8?src=${streamName}`,
        mp4: `${go2rtcBaseUrl}/api/frame.mp4?src=${streamName}`,
        webPlayer: `${go2rtcBaseUrl}/stream.html?src=${streamName}`,
      },
    };
  }

  async openBarrier(
    user: { id: string; role: UserRole; tenantId?: string | null },
    dto: OpenBarrierDto,
  ) {
    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: dto.accessPointId },
    });

    if (!accessPoint) {
      throw new NotFoundException({
        code: 'ACCESS_CONTROL.ACCESS_POINT_NOT_FOUND',
        message: 'Точка доступа не найдена',
      });
    }

    if (
      accessPoint.type !== AccessPointType.BARRIER &&
      accessPoint.type !== AccessPointType.GATE &&
      accessPoint.type !== AccessPointType.DOOR_INTERCOM
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_CONTROL.NOT_A_BARRIER',
        message: 'Указанная точка доступа не является шлагбаумом, воротами или домофоном',
      });
    }

    const logAction = accessPoint.type === AccessPointType.DOOR_INTERCOM ? 'OPEN_INTERCOM' : 'OPEN_BARRIER';
    const typeLabel = accessPoint.type === AccessPointType.DOOR_INTERCOM ? 'домофона' : 'шлагбаума';
    const titleLabel = accessPoint.type === AccessPointType.DOOR_INTERCOM ? 'Домофон' : 'Шлагбаум';

    const isStaff = ([
      UserRole.SUPERADMIN,
      UserRole.HOA_ADMIN,
      UserRole.SECURITY,
      UserRole.DISPATCHER,
    ] as UserRole[]).includes(user.role);

    let verifiedUnitId: string | null = null;

    if (isStaff) {
      // Аудит безопасности: персонал (кроме SUPERADMIN) может открывать шлагбаумы/домофоны только своего ЖК
      if (user.role !== UserRole.SUPERADMIN && accessPoint.tenantId !== user.tenantId) {
        await this.prisma.accessLog.create({
          data: {
            accessPointId: accessPoint.id,
            userId: user.id,
            action: logAction,
            status: 'DENIED',
            note: `Попытка открытия ${typeLabel} сотрудником чужого жилого комплекса`,
          },
        });
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.STAFF_MANAGE_CROSS_TENANT_FORBIDDEN',
          message: 'Сотрудник имеет доступ к управлению точками доступа только своего жилого комплекса',
        });
      }

      verifiedUnitId = dto.unitId || null;
    } else {
      const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId: user.id,
          isVerified: true,
          unit: {
            building: {
              tenantId: accessPoint.tenantId,
            },
          },
        },
      });

      if (!verifiedOwnership) {
        await this.prisma.accessLog.create({
          data: {
            accessPointId: accessPoint.id,
            userId: user.id,
            action: logAction,
            status: 'DENIED',
            note: 'Попытка открытия без подтвержденного права доступа к ЖК',
          },
        });
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.RESIDENT_NO_ACTIVE_ACCESS',
          message: 'У вас нет активного права доступа к точке доступа данного жилого комплекса',
        });
      }

      verifiedUnitId = verifiedOwnership.unitId;
    }

    // 2FA PIN-проверка перед физическим открытием
    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { accessPinHash: true },
    });

    if (!userRecord || !userRecord.accessPinHash) {
      await this.prisma.accessLog.create({
        data: {
          accessPointId: accessPoint.id,
          userId: user.id,
          unitId: verifiedUnitId,
          action: logAction,
          status: 'DENIED',
          note: `Попытка открытия ${typeLabel} без настроенного PIN-кода доступа`,
        },
      });
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.PIN_NOT_SET',
        message: 'PIN_NOT_SET: Сначала установите PIN-код доступа в профиле для управления точками доступа',
      });
    }

    const lockoutKey = `barrier:lockout:${user.id}`;
    const isLocked = await this.redisService.get(lockoutKey);
    if (isLocked) {
      await this.prisma.accessLog.create({
        data: {
          accessPointId: accessPoint.id,
          userId: user.id,
          unitId: verifiedUnitId,
          action: logAction,
          status: 'DENIED',
          note: `Попытка открытия ${typeLabel} во время блокировки за неверный ввод PIN`,
        },
      });
      throw new ForbiddenException({
        code: 'ACCESS_CONTROL.PIN_LOCKED',
        message: 'Доступ временно заблокирован на 10 минут из-за превышения попыток ввода PIN-кода',
      });
    }

    const isPinValid = await bcrypt.compare(dto.pin, userRecord.accessPinHash);
    if (!isPinValid) {
      const attemptsKey = `barrier:attempts:${user.id}`;
      const attempts = await this.redisService.incr(attemptsKey);
      await this.redisService.expire(attemptsKey, 600);

      if (attempts >= 3) {
        await this.redisService.set(lockoutKey, '1', 600);
        await this.redisService.del(attemptsKey);
        await this.prisma.accessLog.create({
          data: {
            accessPointId: accessPoint.id,
            userId: user.id,
            unitId: verifiedUnitId,
            action: logAction,
            status: 'DENIED',
            note: `Неверный PIN при открытии (превышено число попыток, доступ заблокирован на 10 мин)`,
          },
        });
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.PIN_MAX_ATTEMPTS',
          message: 'Неверный PIN-код. Превышено максимальное число попыток. Доступ заблокирован на 10 минут.',
        });
      }

      const remaining = 3 - attempts;
      await this.prisma.accessLog.create({
        data: {
          accessPointId: accessPoint.id,
          userId: user.id,
          unitId: verifiedUnitId,
          action: logAction,
          status: 'DENIED',
          note: `Неверный PIN при открытии (попытка ${attempts} из 3)`,
        },
      });
      throw new BadRequestException({
        code: 'ACCESS_CONTROL.PIN_INVALID',
        message: `Неверный PIN-код. Осталось попыток: ${remaining}`,
        params: { remaining },
      });
    }

    await this.redisService.del(`barrier:attempts:${user.id}`);

    const adapter = this.resolveAdapter(accessPoint.controllerType);
    await adapter.triggerOpen(
      accessPoint.endpointUrl || 'local://relay',
      accessPoint.controllerType,
    );

    const log = await this.prisma.accessLog.create({
      data: {
        accessPointId: accessPoint.id,
        userId: user.id,
        unitId: verifiedUnitId,
        action: logAction,
        status: 'SUCCESS',
        note: `Открыто через мобильное приложение пользователем ${user.id}`,
      },
    });

    return {
      success: true,
      message: `${titleLabel} «${accessPoint.name}» открыт`,
      openedAt: log.createdAt,
    };
  }

  async createGuestPass(user: { id: string; role: UserRole; tenantId?: string | null }, dto: CreateGuestPassDto) {
    const isStaff = ([
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ] as UserRole[]).includes(user.role);

    if (user.role === UserRole.SUPERADMIN) {
      // SUPERADMIN bypasses all ownership and tenant checks
    } else if (isStaff) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: dto.unitId },
        include: { building: true },
      });

      if (!unit) {
        throw new NotFoundException({
          code: 'ACCESS_CONTROL.UNIT_NOT_FOUND',
          message: 'Квартира/помещение не найдено',
        });
      }

      if (unit.building?.tenantId !== user.tenantId) {
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.GUEST_PASS_CROSS_TENANT_FORBIDDEN',
          message: 'Персонал имеет право оформлять гостевые пропуска только для квартир своего жилого комплекса',
        });
      }
    } else {
      const ownership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId: user.id,
          unitId: dto.unitId,
          isVerified: true,
        },
      });

      if (!ownership) {
        throw new ForbiddenException({
          code: 'ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY',
          message: 'IDOR защита: вы можете оформлять гостевой пропуск только для своей подтвержденной квартиры',
        });
      }
    }

    const accessCode = crypto.randomInt(100000, 1000000).toString();

    return this.prisma.guestPass.create({
      data: {
        unitId: dto.unitId,
        creatorId: user.id,
        guestName: dto.guestName,
        guestPlateNumber: dto.guestPlateNumber,
        accessCode,
        qrCodeUrl: `https://api.shanyraq.kz/qr/pass-${accessCode}`,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
      },
    });
  }

  async getAccessLogs(tenantId: string) {
    return this.prisma.accessLog.findMany({
      where: {
        accessPoint: { tenantId },
      },
      include: {
        accessPoint: true,
        user: {
          select: { firstName: true, lastName: true, phone: true },
        },
        unit: {
          include: { building: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
