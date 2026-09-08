import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, OwnershipType } from '@prisma/client';

describe('PropertiesService (Поиск ЖК, структура объектов и реестр жильцов)', () => {
  let service: PropertiesService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      building: {
        update: jest.fn(),
      },
      unit: {
        findMany: jest.fn(),
      },
      unitOwnership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      personalAccount: {
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

  describe('Residents Registry & Management (ТЗ §4.2 Task 0003)', () => {
    const sampleResident = {
      id: 'res-1',
      phone: '+77011234567',
      email: 'res@shanyraq.kz',
      firstName: 'Азамат',
      lastName: 'Ибраев',
      iin: '900101300123',
      role: UserRole.RESIDENT_OWNER,
      isActive: true,
      isVerified: true,
      createdAt: new Date('2026-01-01'),
      ownerships: [
        {
          id: 'own-1',
          ownershipType: OwnershipType.OWNER,
          sharePercent: 100.0,
          isVerified: true,
          unit: {
            id: 'u-101',
            unitNumber: '101',
            floor: 1,
            entrance: 1,
            type: 'APARTMENT',
            area: 65.5,
            cadastralNumber: null,
            building: { id: 'b-1', blockName: 'Блок А' },
          },
        },
      ],
    };

    describe('getConfirmedResidents', () => {
      it('должен возвращать список подтвержденных жильцов ЖК с их квартирами', async () => {
        prismaMock.user.findMany.mockResolvedValue([sampleResident]);

        const res = await service.getConfirmedResidents('tenant-1');
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe('res-1');
        expect(res[0].firstName).toBe('Азамат');
        expect(res[0].ownerships).toHaveLength(1);
        expect(res[0].ownerships[0].unit.unitNumber).toBe('101');
      });

      it('должен передавать поисковый фильтр по ФИО, телефону или номеру квартиры', async () => {
        prismaMock.user.findMany.mockResolvedValue([sampleResident]);

        await service.getConfirmedResidents('tenant-1', '101');
        expect(prismaMock.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              ownerships: {
                some: {
                  isVerified: true,
                  unit: {
                    building: { tenantId: 'tenant-1' },
                  },
                },
              },
              AND: [
                {
                  OR: expect.arrayContaining([
                    { firstName: { contains: '101', mode: 'insensitive' } },
                    { lastName: { contains: '101', mode: 'insensitive' } },
                    { phone: { contains: '101', mode: 'insensitive' } },
                    {
                      ownerships: {
                        some: {
                          isVerified: true,
                          unit: {
                            unitNumber: { contains: '101', mode: 'insensitive' },
                            building: { tenantId: 'tenant-1' },
                          },
                        },
                      },
                    },
                  ]),
                },
              ],
            }),
          }),
        );
      });
    });

    describe('getResidentDetail', () => {
      it('должен возвращать детальную информацию жильца со всеми квартирами в ЖК', async () => {
        prismaMock.user.findUnique.mockResolvedValue(sampleResident);

        const res = await service.getResidentDetail('tenant-1', 'res-1');
        expect(res.id).toBe('res-1');
        expect(res.ownerships).toHaveLength(1);
      });

      it('должен выбрасывать NotFoundException, если жилец не найден', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        await expect(service.getResidentDetail('tenant-1', 'non-existent')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('должен выбрасывать NotFoundException, если у жителя нет подтвержденных квартир в данном ЖК (изоляция данных)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...sampleResident,
          ownerships: [
            {
              ...sampleResident.ownerships[0],
              isVerified: false, // only pending, no verified
            },
          ],
        });

        await expect(service.getResidentDetail('tenant-1', 'res-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('updateResidentStatus', () => {
      it('должен успешно деактивировать аккаунт жильца сотрудником своего ЖК', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'res-1',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
          ownerships: [
            { unit: { building: { tenantId: 'tenant-1' } } },
          ],
        });
        prismaMock.user.update.mockResolvedValue({
          id: 'res-1',
          phone: '+77011234567',
          firstName: 'Азамат',
          lastName: 'Ибраев',
          isActive: false,
        });

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const res = await service.updateResidentStatus('res-1', staffUser, { isActive: false });

        expect(res.isActive).toBe(false);
        expect(res.message).toBe('Учетная запись жильца успешно деактивирована');
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'res-1' },
          data: { isActive: false },
          select: expect.any(Object),
        });
      });

      it('должен отклонять изменение статуса для учетных записей сотрудников (не жильцов)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'staff-target',
          role: UserRole.HOA_ADMIN,
          tenantId: 'tenant-1',
          ownerships: [],
        });

        const staffUser = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        await expect(
          service.updateResidentStatus('staff-target', staffUser, { isActive: false }),
        ).rejects.toThrow(BadRequestException);
      });

      it('должен блокировать изменение статуса сотрудником чужого ЖК (ForbiddenException)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'res-alien',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-alien',
          ownerships: [
            { unit: { building: { tenantId: 'tenant-alien' } } },
          ],
        });

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-own' };
        await expect(
          service.updateResidentStatus('res-alien', staffUser, { isActive: false }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('должен разрешать SUPERADMIN изменять статус жильца любого ЖК', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'res-any',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-any',
          ownerships: [],
        });
        prismaMock.user.update.mockResolvedValue({
          id: 'res-any',
          isActive: true,
        });

        const superAdmin = { id: 'sa', role: UserRole.SUPERADMIN, tenantId: null };
        const res = await service.updateResidentStatus('res-any', superAdmin, { isActive: true });
        expect(res.isActive).toBe(true);
      });
    });

    describe('unlinkOwnership', () => {
      it('должен отклонять отвязку не подтвержденного права владения (BadRequestException)', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue({
          id: 'own-unverified',
          userId: 'res-1',
          isVerified: false,
          unit: { building: { tenantId: 'tenant-1' } },
        });

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        await expect(
          service.unlinkOwnership('own-unverified', staffUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('должен блокировать отвязку сотрудником чужого ЖК (ForbiddenException)', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue({
          id: 'own-1',
          userId: 'res-1',
          isVerified: true,
          unit: { building: { tenantId: 'tenant-alien' } },
        });

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-own' };
        await expect(
          service.unlinkOwnership('own-1', staffUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('должен успешно удалять привязку и сбрасывать isVerified у пользователя, если подтвержденных квартир больше нет', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue({
          id: 'own-last',
          userId: 'res-1',
          isVerified: true,
          unit: { building: { tenantId: 'tenant-1' } },
        });
        prismaMock.unitOwnership.delete.mockResolvedValue({ id: 'own-last' });
        prismaMock.unitOwnership.count.mockResolvedValue(0); // 0 remaining verified
        prismaMock.user.update.mockResolvedValue({ id: 'res-1', isVerified: false });

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const res = await service.unlinkOwnership('own-last', staffUser);

        expect(res.success).toBe(true);
        expect(prismaMock.unitOwnership.delete).toHaveBeenCalledWith({
          where: { id: 'own-last' },
        });
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'res-1' },
          data: { isVerified: false },
        });
      });

      it('не должен сбрасывать isVerified у пользователя, если у него остаются другие подтвержденные квартиры', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue({
          id: 'own-one-of-two',
          userId: 'res-1',
          isVerified: true,
          unit: { building: { tenantId: 'tenant-1' } },
        });
        prismaMock.unitOwnership.delete.mockResolvedValue({ id: 'own-one-of-two' });
        prismaMock.unitOwnership.count.mockResolvedValue(1); // 1 remaining verified

        const staffUser = { id: 'staff-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const res = await service.unlinkOwnership('own-one-of-two', staffUser);

        expect(res.success).toBe(true);
        expect(prismaMock.user.update).not.toHaveBeenCalled();
      });
    });
  });
});
