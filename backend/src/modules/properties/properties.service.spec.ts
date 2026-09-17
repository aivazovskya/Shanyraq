import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, OwnershipType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('PropertiesService (Поиск ЖК, структура объектов и реестр жильцов)', () => {
  let service: PropertiesService;
  let prismaMock: any;
  let auditLogServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      building: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      unit: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
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
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      personalAccount: {
        create: jest.fn(),
      },
    };

    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
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

      try {
        await service.getTenantStructure('non-existing-id');
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('PROPERTIES.COMPLEX_NOT_FOUND');
      }
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
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          actorId: 'staff-1',
          action: 'RESIDENT_DEACTIVATED',
          targetType: 'User',
          targetId: 'res-1',
          metadata: {
            residentName: 'Азамат Ибраев',
            previousStatus: undefined,
          },
        });
      });

      it('должен отклонять изменение статуса для учетных записей сотрудников (не жильцов) и НЕ писать аудит', async () => {
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

        expect(auditLogServiceMock.log).not.toHaveBeenCalled();
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

      it('должен разрешать SUPERADMIN изменять статус жильца любого ЖК и логировать RESIDENT_ACTIVATED', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'res-any',
          firstName: 'Данияр',
          lastName: 'Алиев',
          isActive: false,
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
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-any',
          actorId: 'sa',
          action: 'RESIDENT_ACTIVATED',
          targetType: 'User',
          targetId: 'res-any',
          metadata: {
            residentName: 'Данияр Алиев',
            previousStatus: false,
          },
        });
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

        try {
          await service.unlinkOwnership('own-unverified', staffUser);
          fail('Should throw');
        } catch (err: any) {
          expect(err.getResponse().code).toBe('PROPERTIES.ONLY_CONFIRMED_UNLINK');
        }
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

  describe('addUnit (Subtask B3: tenant authorization)', () => {
    const mockBuilding = {
      id: 'b-1',
      blockName: 'Блок 1',
      tenantId: 'tenant-legit',
    };

    const mockDto = {
      unitNumber: '101',
      floor: 1,
      entrance: 1,
      type: 'APARTMENT' as any,
      area: 65.5,
    };

    it('должен блокировать добавление квартиры администратором чужого ЖК (BOLA/IDOR protection)', async () => {
      prismaMock.building.findUnique.mockResolvedValue(mockBuilding);

      const foreignAdmin = {
        id: 'admin-foreign',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-attacker',
      };

      await expect(
        service.addUnit('b-1', foreignAdmin, mockDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен успешно создавать квартиру, если администратор принадлежит тому же ЖК', async () => {
      prismaMock.building.findUnique.mockResolvedValue(mockBuilding);
      prismaMock.unit.create.mockResolvedValue({
        id: 'unit-new-1',
        buildingId: 'b-1',
        unitNumber: '101',
      });
      prismaMock.unit.findMany.mockResolvedValue([]);
      prismaMock.personalAccount.findFirst = jest.fn().mockResolvedValue({ id: 'pa-1' });

      const legitAdmin = {
        id: 'admin-legit',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-legit',
      };

      const res = await service.addUnit('b-1', legitAdmin, mockDto);
      expect(res.id).toBe('unit-new-1');
      expect(prismaMock.unit.create).toHaveBeenCalled();
    });
  });

  describe('getTenantById (Subtask C1: tenant authorization)', () => {
    it('должен блокировать доступ к ЖК для пользователя другого ЖК (BOLA/IDOR protection)', async () => {
      const foreignUser = {
        id: 'user-foreign',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-1',
      };

      await expect(
        service.getTenantById('tenant-2', foreignUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать доступ к ЖК для персонала своего ЖК', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК Наш',
        buildings: [],
        _count: {},
      });

      const legitUser = {
        id: 'user-legit',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-1',
      };

      const res = await service.getTenantById('tenant-1', legitUser);
      expect(res.id).toBe('tenant-1');
    });

    it('должен разрешать доступ к любому ЖК для SUPERADMIN', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-target',
        name: 'ЖК Любой',
        buildings: [],
        _count: {},
      });

      const superadmin = {
        id: 'superadmin',
        role: UserRole.SUPERADMIN,
        tenantId: null,
      };

      const res = await service.getTenantById('tenant-target', superadmin);
      expect(res.id).toBe('tenant-target');
    });
  });

  describe('createStaff (Task 0023)', () => {
    const validStaffDto = {
      firstName: 'Аслан',
      lastName: 'Омаров',
      phone: '+77015559988',
      email: 'aslan@shanyraq.kz',
      role: UserRole.HOA_ADMIN,
    };

    it('должен выбрасывать NotFoundException PROPERTIES.COMPLEX_NOT_FOUND при несуществующем ЖК', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue(null);

      try {
        await service.createStaff('non-existent-tenant', validStaffDto);
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(err.getResponse().code).toBe('PROPERTIES.COMPLEX_NOT_FOUND');
      }
    });

    it('должен отклонять недопустимые роли сотрудников (RESIDENT_OWNER, SUPERADMIN)', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'ЖК Шаңырақ' });

      // Попытка создать жильца через staff endpoint
      try {
        await service.createStaff('tenant-1', {
          ...validStaffDto,
          role: UserRole.RESIDENT_OWNER as any,
        });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('PROPERTIES.INVALID_STAFF_ROLE');
      }

      // Попытка создать SUPERADMIN через tenant staff endpoint
      try {
        await service.createStaff('tenant-1', {
          ...validStaffDto,
          role: UserRole.SUPERADMIN as any,
        });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('PROPERTIES.INVALID_STAFF_ROLE');
      }
    });

    it('должен отклонять создание, если пользователь с таким телефоном уже существует', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'ЖК Шаңырақ' });
      prismaMock.user.findFirst.mockResolvedValue({ id: 'existing-user-1', phone: validStaffDto.phone });

      try {
        await service.createStaff('tenant-1', validStaffDto);
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('PROPERTIES.USER_ALREADY_EXISTS');
      }
    });

    it('должен успешно создавать сотрудника, возвращать tempPassword (валидируемый bcrypt) и устанавливать mustChangePassword: true', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'ЖК Шаңырақ' });
      prismaMock.user.findFirst.mockResolvedValue(null);

      let savedData: any = null;
      prismaMock.user.create.mockImplementation(({ data }: any) => {
        savedData = data;
        return Promise.resolve({
          id: 'user-new-staff',
          ...data,
          createdAt: new Date(),
        });
      });

      const res = await service.createStaff('tenant-1', validStaffDto);

      expect(res.id).toBe('user-new-staff');
      expect(res.tenantId).toBe('tenant-1');
      expect(res.role).toBe(UserRole.HOA_ADMIN);
      expect(res.mustChangePassword).toBe(true);
      expect(res.tempPassword).toBeDefined();

      // Проверяем, что в БД пароль сохранен как корректный bcrypt-хэш, соответствующий открытому tempPassword
      expect(savedData.passwordHash).toBeDefined();
      expect(savedData.passwordHash).not.toBe(res.tempPassword);
      const isMatch = await bcrypt.compare(res.tempPassword, savedData.passwordHash);
      expect(isMatch).toBe(true);
      expect(savedData.mustChangePassword).toBe(true);
      expect(savedData.tenantId).toBe('tenant-1');
    });
  });

  describe('claimOwnership & verifyOwnership (Task 0040: ownership-share invariant)', () => {
    describe('claimOwnership', () => {
      const mockUnit = {
        id: 'unit-1',
        buildingId: 'b-1',
        unitNumber: '101',
        building: {
          id: 'b-1',
          tenantId: 'tenant-1',
        },
      };

      it('должен выбрасывать NotFoundException (PROPERTIES.UNIT_NOT_FOUND), если квартира не найдена', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(null);

        try {
          await service.claimOwnership('user-1', {
            unitId: 'non-existent-unit',
            ownershipType: OwnershipType.OWNER,
          });
          fail('Should have thrown NotFoundException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(NotFoundException);
          expect(err.getResponse().code).toBe('PROPERTIES.UNIT_NOT_FOUND');
        }
      });

      it('должен выбрасывать BadRequestException (PROPERTIES.OWNERSHIP_REQUEST_EXISTS), если заявка уже существует', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue({
          id: 'own-existing',
          userId: 'user-1',
          unitId: 'unit-1',
        });

        try {
          await service.claimOwnership('user-1', {
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
          });
          fail('Should have thrown BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse().code).toBe('PROPERTIES.OWNERSHIP_REQUEST_EXISTS');
        }
      });

      it('должен отклонять sharePercent <= 0 (PROPERTIES.INVALID_SHARE_RANGE)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);

        try {
          await service.claimOwnership('user-1', {
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 0,
          });
          fail('Should have thrown BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse().code).toBe('PROPERTIES.INVALID_SHARE_RANGE');
        }

        await expect(
          service.claimOwnership('user-1', {
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: -5,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('должен отклонять sharePercent > 100 (PROPERTIES.INVALID_SHARE_RANGE)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);

        try {
          await service.claimOwnership('user-1', {
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 100.01,
          });
          fail('Should have thrown BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse().code).toBe('PROPERTIES.INVALID_SHARE_RANGE');
        }
      });

      it('должен отклонять заявку, если сумма с уже подтвержденными долями превышает 100% (60% + 50% > 100%)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);
        prismaMock.unitOwnership.findMany.mockResolvedValue([
          { id: 'own-v1', sharePercent: 60.0, isVerified: true },
        ]);

        try {
          await service.claimOwnership('user-1', {
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 50.0,
          });
          fail('Should have thrown BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse().code).toBe('PROPERTIES.SHARE_EXCEEDS_TOTAL');
          expect(err.getResponse().params).toEqual({ currentSum: 60.0, requestedShare: 50.0 });
        }
      });

      it('должен успешно создавать заявку при граничном значении ровно 100% (60% + 40% = 100%)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);
        prismaMock.unitOwnership.findMany.mockResolvedValue([
          { id: 'own-v1', sharePercent: 60.0, isVerified: true },
        ]);
        prismaMock.user.update.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
        prismaMock.unitOwnership.create.mockResolvedValue({
          id: 'own-new',
          userId: 'user-1',
          unitId: 'unit-1',
          ownershipType: OwnershipType.OWNER,
          sharePercent: 40.0,
          isVerified: false,
        });

        const res = await service.claimOwnership('user-1', {
          unitId: 'unit-1',
          ownershipType: OwnershipType.OWNER,
          sharePercent: 40.0,
        });

        expect(res.id).toBe('own-new');
        expect(res.isVerified).toBe(false);
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { tenantId: 'tenant-1' },
        });
        expect(prismaMock.unitOwnership.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-1',
            unitId: 'unit-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 40.0,
            verificationDoc: undefined,
            isVerified: false,
          },
        });
      });

      it('должен по умолчанию устанавливать sharePercent = 100.0, если он опущен в DTO', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);
        prismaMock.unitOwnership.findMany.mockResolvedValue([]);
        prismaMock.user.update.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
        prismaMock.unitOwnership.create.mockResolvedValue({
          id: 'own-new-default',
          userId: 'user-1',
          unitId: 'unit-1',
          ownershipType: OwnershipType.OWNER,
          sharePercent: 100.0,
          isVerified: false,
        });

        const res = await service.claimOwnership('user-1', {
          unitId: 'unit-1',
          ownershipType: OwnershipType.OWNER,
        });

        expect(res.id).toBe('own-new-default');
        expect(prismaMock.unitOwnership.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              sharePercent: 100.0,
            }),
          }),
        );
      });
    });

    describe('verifyOwnership', () => {
      const mockRecord = {
        id: 'own-record-1',
        userId: 'user-resident-1',
        unitId: 'unit-1',
        sharePercent: 50.0,
        isVerified: false,
        unit: {
          id: 'unit-1',
          building: {
            id: 'b-1',
            tenantId: 'tenant-1',
          },
        },
      };

      it('должен выбрасывать NotFoundException (PROPERTIES.OWNERSHIP_NOT_FOUND), если запись не найдена', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(null);

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        try {
          await service.verifyOwnership('non-existent-own', verifier, { isVerified: true });
          fail('Should have thrown NotFoundException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(NotFoundException);
          expect(err.getResponse().code).toBe('PROPERTIES.OWNERSHIP_NOT_FOUND');
        }
      });

      it('должен блокировать верификацию сотрудником чужого ЖК (PROPERTIES.CROSS_TENANT_VERIFY_FORBIDDEN)', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);

        const foreignVerifier = { id: 'admin-foreign', role: UserRole.HOA_ADMIN, tenantId: 'tenant-2' };
        try {
          await service.verifyOwnership('own-record-1', foreignVerifier, { isVerified: true });
          fail('Should have thrown ForbiddenException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect(err.getResponse().code).toBe('PROPERTIES.CROSS_TENANT_VERIFY_FORBIDDEN');
        }

        const noTenantVerifier = { id: 'admin-no-tenant', role: UserRole.HOA_ADMIN, tenantId: null };
        await expect(
          service.verifyOwnership('own-record-1', noTenantVerifier, { isVerified: true }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('должен разрешать верификацию SUPERADMIN без привязки к tenantId', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);
        prismaMock.unitOwnership.findMany.mockResolvedValue([]);
        prismaMock.unitOwnership.update.mockResolvedValue({
          ...mockRecord,
          isVerified: true,
          verifiedAt: new Date(),
        });
        prismaMock.user.update.mockResolvedValue({ id: 'user-resident-1', isVerified: true });

        const superAdmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
        const res = await service.verifyOwnership('own-record-1', superAdmin, { isVerified: true });

        expect(res.isVerified).toBe(true);
        expect(prismaMock.unitOwnership.update).toHaveBeenCalled();
      });

      it('должен отклонять подтверждение, если сумма с другими подтвержденными превысит 100% (70% + 40% > 100%) и исключать саму запись из подсчета (id: { not: record.id })', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);
        prismaMock.unitOwnership.findMany.mockResolvedValue([
          { id: 'own-other', sharePercent: 70.0, isVerified: true },
        ]);

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        try {
          await service.verifyOwnership('own-record-1', verifier, {
            isVerified: true,
            approvedSharePercent: 40.0,
          });
          fail('Should have thrown BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse().code).toBe('PROPERTIES.CONFIRMED_SHARE_EXCEEDS_TOTAL');
          expect(err.getResponse().params).toEqual({ otherSum: 70.0, finalSharePercent: 40.0 });
        }

        expect(prismaMock.unitOwnership.findMany).toHaveBeenCalledWith({
          where: {
            unitId: 'unit-1',
            isVerified: true,
            id: { not: 'own-record-1' },
          },
        });
      });

      it('должен успешно подтверждать при граничном значении ровно 100% (70% + 30% = 100%)', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);
        prismaMock.unitOwnership.findMany.mockResolvedValue([
          { id: 'own-other', sharePercent: 70.0, isVerified: true },
        ]);
        prismaMock.unitOwnership.update.mockResolvedValue({
          ...mockRecord,
          sharePercent: 30.0,
          isVerified: true,
        });
        prismaMock.user.update.mockResolvedValue({ id: 'user-resident-1', isVerified: true });

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const res = await service.verifyOwnership('own-record-1', verifier, {
          isVerified: true,
          approvedSharePercent: 30.0,
        });

        expect(res.isVerified).toBe(true);
        expect((res as any).sharePercent).toBe(30.0);
        expect(prismaMock.unitOwnership.update).toHaveBeenCalledWith({
          where: { id: 'own-record-1' },
          data: {
            isVerified: true,
            sharePercent: 30.0,
            verifiedAt: expect.any(Date),
          },
        });
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-resident-1' },
          data: { isVerified: true },
        });
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          actorId: 'admin-1',
          action: 'OWNERSHIP_VERIFIED',
          targetType: 'UnitOwnership',
          targetId: 'own-record-1',
          metadata: {
            residentId: 'user-resident-1',
            unitId: 'unit-1',
            sharePercent: 30.0,
          },
        });
      });

      it('НЕ должен логировать OWNERSHIP_VERIFIED, если подтверждение отклонено (например превышение доли)', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);
        prismaMock.unitOwnership.findMany.mockResolvedValue([
          { id: 'own-other', sharePercent: 70.0, isVerified: true },
        ]);

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        await expect(
          service.verifyOwnership('own-record-1', verifier, {
            isVerified: true,
            approvedSharePercent: 50.0,
          }),
        ).rejects.toThrow(BadRequestException);

        expect(auditLogServiceMock.log).not.toHaveBeenCalled();
      });

      it('должен удалять запись при отклонении (dto.isVerified: false) и логировать OWNERSHIP_REJECTED', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord);
        prismaMock.unitOwnership.delete.mockResolvedValue({ id: 'own-record-1' });

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const res = await service.verifyOwnership('own-record-1', verifier, {
          isVerified: false,
        });

        expect(res).toEqual({
          id: 'own-record-1',
          isVerified: false,
          status: 'REJECTED',
        });
        expect(prismaMock.unitOwnership.delete).toHaveBeenCalledWith({
          where: { id: 'own-record-1' },
        });
        expect(prismaMock.unitOwnership.update).not.toHaveBeenCalled();
        expect(prismaMock.user.update).not.toHaveBeenCalled();
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          actorId: 'admin-1',
          action: 'OWNERSHIP_REJECTED',
          targetType: 'UnitOwnership',
          targetId: 'own-record-1',
          metadata: {
            residentId: 'user-resident-1',
            unitId: 'unit-1',
            requestedShare: 50.0,
          },
        });
      });

      it('должен использовать исходный sharePercent записи, если approvedSharePercent опущен', async () => {
        prismaMock.unitOwnership.findUnique.mockResolvedValue(mockRecord); // sharePercent: 50.0
        prismaMock.unitOwnership.findMany.mockResolvedValue([]);
        prismaMock.unitOwnership.update.mockResolvedValue({
          ...mockRecord,
          isVerified: true,
        });
        prismaMock.user.update.mockResolvedValue({ id: 'user-resident-1', isVerified: true });

        const verifier = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        await service.verifyOwnership('own-record-1', verifier, {
          isVerified: true,
        });

        expect(prismaMock.unitOwnership.update).toHaveBeenCalledWith({
          where: { id: 'own-record-1' },
          data: {
            isVerified: true,
            sharePercent: 50.0,
            verifiedAt: expect.any(Date),
          },
        });
      });
    });
  });

  describe('exportConfirmedResidentsCsv (Экспорт реестра жильцов в CSV)', () => {
    it('должен формировать отдельные строки CSV для каждого подтвержденного владения (один жилец с 2 квартирами -> 2 строки)', async () => {
      const mockResident = {
        id: 'user-1',
        lastName: 'Иванов',
        firstName: 'Иван',
        phone: '+77011112233',
        email: 'ivan@example.com',
        iin: '900101300123',
        isActive: true,
        ownerships: [
          {
            id: 'own-1',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 100.0,
            isVerified: true,
            verifiedAt: new Date('2026-05-10T10:00:00.000Z'),
            unit: {
              unitNumber: '101',
              area: 65.5,
              building: { blockName: 'Блок А' },
            },
          },
          {
            id: 'own-2',
            ownershipType: OwnershipType.OWNER,
            sharePercent: 50.0,
            isVerified: true,
            verifiedAt: new Date('2026-06-15T12:00:00.000Z'),
            unit: {
              unitNumber: '102',
              area: 45.0,
              building: { blockName: 'Блок Б' },
            },
          },
        ],
      };

      prismaMock.user.findMany.mockResolvedValue([mockResident]);

      const { buffer, filename } = await service.exportConfirmedResidentsCsv('tenant-1');

      expect(filename).toMatch(/^residents-registry-tenant-1-\d{4}-\d{2}-\d{2}\.csv$/);

      const content = buffer.toString('utf-8');
      const lines = content.replace(/^\uFEFF/, '').split('\r\n');

      // Заголовок + 2 строки владения
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(
        'ФИО,Телефон,Email,ИИН,Тип владения,Блок,Квартира/Помещение,Площадь (кв.м),Доля (%),Дата верификации,Статус аккаунта',
      );
      expect(lines[1]).toBe(
        'Иванов Иван,+77011112233,ivan@example.com,900101300123,Собственник,Блок А,101,65.5,100,2026-05-10,Активен',
      );
      expect(lines[2]).toBe(
        'Иванов Иван,+77011112233,ivan@example.com,900101300123,Собственник,Блок Б,102,45,50,2026-06-15,Активен',
      );
    });

    it('должен передавать поисковый фильтр search в getConfirmedResidents идентично', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      await service.exportConfirmedResidentsCsv('tenant-1', 'Алихан');

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerships: {
              some: {
                isVerified: true,
                unit: { building: { tenantId: 'tenant-1' } },
              },
            },
            AND: [
              {
                OR: [
                  { firstName: { contains: 'Алихан', mode: 'insensitive' } },
                  { lastName: { contains: 'Алихан', mode: 'insensitive' } },
                  { phone: { contains: 'Алихан', mode: 'insensitive' } },
                  {
                    ownerships: {
                      some: {
                        isVerified: true,
                        unit: {
                          unitNumber: { contains: 'Алихан', mode: 'insensitive' },
                          building: { tenantId: 'tenant-1' },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        }),
      );
    });

    it('должен начинаться с UTF-8 BOM и корректно экранировать запятые в ФИО', async () => {
      const mockResidentWithComma = {
        id: 'user-2',
        lastName: 'Иванов, мл.',
        firstName: 'Пётр',
        phone: '+77019998877',
        email: 'petr@example.com',
        iin: '950202400567',
        isActive: false,
        ownerships: [
          {
            id: 'own-3',
            ownershipType: OwnershipType.TENANT,
            sharePercent: 100.0,
            isVerified: true,
            verifiedAt: new Date('2026-07-01T08:00:00.000Z'),
            unit: {
              unitNumber: '25',
              area: 50.0,
              building: { blockName: 'Корпус 1' },
            },
          },
        ],
      };

      prismaMock.user.findMany.mockResolvedValue([mockResidentWithComma]);

      const { buffer } = await service.exportConfirmedResidentsCsv('tenant-1');

      // Проверка первых 3 байт на UTF-8 BOM (0xEF, 0xBB, 0xBF)
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);

      const content = buffer.toString('utf-8');
      expect(content.startsWith('\uFEFF')).toBe(true);

      // Проверяем экранирование ФИО с запятой
      expect(content).toContain('"Иванов, мл. Пётр"');
      expect(content).toContain('Арендатор');
      expect(content).toContain('Деактивирован');
    });

    it('не включает неподтвержденные владения (scope только verified)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);

      const { buffer } = await service.exportConfirmedResidentsCsv('tenant-1');
      const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = content.split('\r\n');

      expect(lines).toHaveLength(1);
    });
  });

  describe('unlinkOwnership (Audit trail: OWNERSHIP_UNLINKED)', () => {
    const staffUser = {
      id: 'staff-admin-1',
      role: UserRole.HOA_ADMIN,
      tenantId: 'tenant-1',
    };

    const mockOwnership = {
      id: 'ownership-123',
      userId: 'user-resident-1',
      unitId: 'unit-456',
      isVerified: true,
      unit: {
        unitNumber: '101',
        building: {
          tenantId: 'tenant-1',
        },
      },
    };

    it('должен отвязывать подтвержденное владение и логировать событие OWNERSHIP_UNLINKED', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue(mockOwnership);
      prismaMock.unitOwnership.delete.mockResolvedValue(mockOwnership);
      prismaMock.unitOwnership.count.mockResolvedValue(1); // 1 remaining

      const res = await service.unlinkOwnership('ownership-123', staffUser);

      expect(res.success).toBe(true);
      expect(prismaMock.unitOwnership.delete).toHaveBeenCalledWith({ where: { id: 'ownership-123' } });
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: staffUser.id,
        action: 'OWNERSHIP_UNLINKED',
        targetType: 'UnitOwnership',
        targetId: 'ownership-123',
        metadata: {
          residentId: 'user-resident-1',
          unitId: 'unit-456',
          unitNumber: '101',
        },
      });
    });

    it('не должен логировать аудит, если владение не найдено', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue(null);

      await expect(service.unlinkOwnership('non-existent', staffUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('не должен логировать аудит, если владение неподтверждено (isVerified=false)', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue({
        ...mockOwnership,
        isVerified: false,
      });

      await expect(service.unlinkOwnership('ownership-123', staffUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('не должен логировать аудит при попытке отвязки в чужом ЖК', async () => {
      prismaMock.unitOwnership.findUnique.mockResolvedValue({
        ...mockOwnership,
        unit: {
          unitNumber: '101',
          building: {
            tenantId: 'tenant-OTHER',
          },
        },
      });

      await expect(service.unlinkOwnership('ownership-123', staffUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });
  });
});
