import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('SearchService (Глобальный быстрый поиск)', () => {
  let service: SearchService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
      },
      serviceRequest: {
        findMany: jest.fn(),
      },
      personalAccount: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('Короткий запрос (< 2 символов) — Decision #4', () => {
    it('при длине запроса меньше 2 символов немедленно возвращает пустой результат без единого вызова Prisma', async () => {
      const user = { tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };

      const resEmpty = await service.search('tenant-1', user, '');
      const resOneChar = await service.search('tenant-1', user, 'a');
      const resSpaces = await service.search('tenant-1', user, '   ');
      const resOneCharWithSpaces = await service.search('tenant-1', user, ' b ');

      expect(resEmpty).toEqual({ residents: [], requests: [], accounts: [] });
      expect(resOneChar).toEqual({ residents: [], requests: [], accounts: [] });
      expect(resSpaces).toEqual({ residents: [], requests: [], accounts: [] });
      expect(resOneCharWithSpaces).toEqual({ residents: [], requests: [], accounts: [] });

      // ГАРАНТИЯ: ни один из трех методов findMany не был вызван ни разу
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.serviceRequest.findMany).not.toHaveBeenCalled();
      expect(prismaMock.personalAccount.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Ролевой доступ к лицевым счетам — Decision #3', () => {
    it('для DISPATCHER и SECURITY возвращает жильцов и заявки, но пустой массив accounts без запроса в БД', async () => {
      const dispatcher = { tenantId: 'tenant-1', role: UserRole.DISPATCHER };

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          firstName: 'Иван',
          lastName: 'Иванов',
          phone: '+77011112233',
          ownerships: [{ unit: { unitNumber: '101' } }],
        },
      ]);
      prismaMock.serviceRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          title: 'Протечка трубы',
          status: 'PENDING',
          createdAt: new Date('2026-09-01'),
        },
      ]);

      const res = await service.search('tenant-1', dispatcher, 'Иван');

      expect(res.residents).toEqual([
        {
          id: 'user-1',
          firstName: 'Иван',
          lastName: 'Иванов',
          phone: '+77011112233',
          unitNumber: '101',
        },
      ]);
      expect(res.requests).toHaveLength(1);
      expect(res.requests[0].title).toBe('Протечка трубы');
      expect(res.accounts).toEqual([]);

      // Проверяем, что personalAccount.findMany НЕ вызывался
      expect(prismaMock.personalAccount.findMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.serviceRequest.findMany).toHaveBeenCalledTimes(1);
    });

    it('для HOA_ADMIN и SUPERADMIN возвращает все 3 категории, включая accounts', async () => {
      const hoaAdmin = { tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };

      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.serviceRequest.findMany.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          accountNumber: 'ACC-101',
          balance: 15000,
          unit: { unitNumber: '101' },
        },
      ]);

      const res = await service.search('tenant-1', hoaAdmin, '101');

      expect(res.accounts).toEqual([
        {
          id: 'acc-1',
          accountNumber: 'ACC-101',
          unitNumber: '101',
          balance: 15000,
        },
      ]);
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('Изоляция арендаторов (Tenant Isolation)', () => {
    it('запрещает сотруднику доступ к поиску чужого ЖК (403 Forbidden)', async () => {
      const staffUser = { tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };

      await expect(
        service.search('tenant-2', staffUser, 'Поиск'),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.serviceRequest.findMany).not.toHaveBeenCalled();
      expect(prismaMock.personalAccount.findMany).not.toHaveBeenCalled();
    });

    it('разрешает SUPERADMIN выполнять поиск по любому ЖК без ограничений', async () => {
      const superAdmin = { tenantId: null, role: UserRole.SUPERADMIN };

      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.serviceRequest.findMany.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      const res = await service.search('any-tenant', superAdmin, 'Тест');

      expect(res).toEqual({ residents: [], requests: [], accounts: [] });
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.serviceRequest.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ограничение выборки (Capping take: 5)', () => {
    it('ограничивает результаты максимум 5 элементами на категорию', async () => {
      const hoaAdmin = { tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };

      // Генерируем 8 записей в моке
      const mockResidents = Array.from({ length: 8 }, (_, i) => ({
        id: `u-${i}`,
        firstName: `Жилец ${i}`,
        lastName: `Фамилия ${i}`,
        phone: `+7701000000${i}`,
        ownerships: [{ unit: { unitNumber: `${100 + i}` } }],
      }));
      const mockRequests = Array.from({ length: 8 }, (_, i) => ({
        id: `req-${i}`,
        title: `Заявка ${i}`,
        status: 'IN_PROGRESS',
        createdAt: new Date(),
      }));
      const mockAccounts = Array.from({ length: 8 }, (_, i) => ({
        id: `acc-${i}`,
        accountNumber: `ACC-${i}`,
        balance: 1000 * i,
        unit: { unitNumber: `${100 + i}` },
      }));

      // Проверяем, что Prisma вызывается с take: 5
      prismaMock.user.findMany.mockImplementation((args: any) => {
        expect(args.take).toBe(5);
        return Promise.resolve(mockResidents.slice(0, args.take));
      });
      prismaMock.serviceRequest.findMany.mockImplementation((args: any) => {
        expect(args.take).toBe(5);
        return Promise.resolve(mockRequests.slice(0, args.take));
      });
      prismaMock.personalAccount.findMany.mockImplementation((args: any) => {
        expect(args.take).toBe(5);
        return Promise.resolve(mockAccounts.slice(0, args.take));
      });

      const res = await service.search('tenant-1', hoaAdmin, 'Поиск');

      expect(res.residents).toHaveLength(5);
      expect(res.requests).toHaveLength(5);
      expect(res.accounts).toHaveLength(5);
    });
  });
});
