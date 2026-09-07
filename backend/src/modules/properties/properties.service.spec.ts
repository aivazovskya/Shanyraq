import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PropertiesService (Поиск ЖК и структура объектов)', () => {
  let service: PropertiesService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
  });

  describe('searchTenants', () => {
    it('должен возвращать список ЖК с безопасными публичными полями', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([
        {
          id: 'tenant-1',
          name: 'ЖК Шаңырақ Премиум',
          address: 'пр. Мангилик Ел, 55',
          city: 'Астана',
          _count: { buildings: 3 },
        },
      ]);

      const res = await service.searchTenants('Шаңырақ');
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({
        id: 'tenant-1',
        name: 'ЖК Шаңырақ Премиум',
        address: 'пр. Мангилик Ел, 55',
        city: 'Астана',
        buildingsCount: 3,
      });
      expect(prismaMock.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'Шаңырақ', mode: 'insensitive' } },
              { address: { contains: 'Шаңырақ', mode: 'insensitive' } },
              { city: { contains: 'Шаңырақ', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('getTenantStructure', () => {
    it('должен возвращать структуру блоков и квартир для экрана привязки', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК Шаңырақ Премиум',
        address: 'пр. Мангилик Ел, 55',
        city: 'Астана',
        buildings: [
          {
            id: 'b-1',
            blockName: 'Блок А',
            floorsCount: 9,
            entrancesCount: 2,
            units: [
              {
                id: 'u-101',
                unitNumber: '101',
                floor: 1,
                entrance: 1,
                type: 'APARTMENT',
                area: 65.5,
              },
            ],
          },
        ],
      });

      const res = await service.getTenantStructure('tenant-1');
      expect(res.tenantId).toBe('tenant-1');
      expect(res.buildings).toHaveLength(1);
      expect(res.buildings[0].units).toHaveLength(1);
      expect(res.buildings[0].units[0].unitNumber).toBe('101');
    });

    it('должен выбрасывать NotFoundException при несуществующем ЖК', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getTenantStructure('non-existing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
