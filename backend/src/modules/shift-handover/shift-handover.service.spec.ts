import { Test, TestingModule } from '@nestjs/testing';
import { ShiftHandoverService } from './shift-handover.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('ShiftHandoverService (Task 0072)', () => {
  let service: ShiftHandoverService;
  let prismaMock: any;

  const mockTenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  const securityUser = { id: 'sec-1', role: UserRole.SECURITY, tenantId: mockTenantId };
  const dispatcherUser = { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: mockTenantId };
  const hoaAdminUser = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: mockTenantId };
  const superAdminUser = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
  const hoaChairmanUser = { id: 'chairman-1', role: UserRole.HOA_CHAIRMAN, tenantId: mockTenantId };
  const residentUser = { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId: mockTenantId };
  const otherTenantSecurity = { id: 'sec-2', role: UserRole.SECURITY, tenantId: otherTenantId };

  beforeEach(async () => {
    prismaMock = {
      shiftHandoverNote: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftHandoverService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ShiftHandoverService>(ShiftHandoverService);
  });

  describe('createNote', () => {
    it.each([UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN])(
      'разрешает роли %s опубликовать заметку',
      async (role) => {
        prismaMock.shiftHandoverNote.create.mockResolvedValue({ id: 'note-1', content: 'Гость ждёт у подъезда 2' });
        const user = { id: 'u-1', role, tenantId: role === UserRole.SUPERADMIN ? null : mockTenantId };

        const result = await service.createNote(mockTenantId, user, {
          content: 'Гость ждёт у подъезда 2',
        });

        expect(result.id).toBe('note-1');
      },
    );

    it('отклоняет HOA_CHAIRMAN от публикации (ForbiddenException) — только чтение', async () => {
      await expect(
        service.createNote(mockTenantId, hoaChairmanUser, { content: 'Текст заметки' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.shiftHandoverNote.create).not.toHaveBeenCalled();
    });

    it('отклоняет жителя от публикации (ForbiddenException)', async () => {
      await expect(
        service.createNote(mockTenantId, residentUser, { content: 'Текст заметки' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('отклоняет сотрудника чужого ЖК (ForbiddenException)', async () => {
      await expect(
        service.createNote(mockTenantId, otherTenantSecurity, { content: 'Текст заметки' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.shiftHandoverNote.create).not.toHaveBeenCalled();
    });

    it('отклоняет пустую/пробельную заметку (BadRequestException)', async () => {
      await expect(
        service.createNote(mockTenantId, securityUser, { content: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.shiftHandoverNote.create).not.toHaveBeenCalled();
    });

    it('обрезает пробелы перед сохранением', async () => {
      prismaMock.shiftHandoverNote.create.mockResolvedValue({ id: 'note-1' });

      await service.createNote(mockTenantId, securityUser, { content: '  Лифт не работает  ' });

      expect(prismaMock.shiftHandoverNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'Лифт не работает' }),
        }),
      );
    });
  });

  describe('getNotes', () => {
    it('разрешает HOA_CHAIRMAN читать заметки, хотя он не может их публиковать', async () => {
      prismaMock.shiftHandoverNote.findMany.mockResolvedValue([]);

      await expect(service.getNotes(mockTenantId, hoaChairmanUser)).resolves.toBeDefined();
    });

    it.each([UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN])(
      'разрешает роли %s читать заметки',
      async (role) => {
        prismaMock.shiftHandoverNote.findMany.mockResolvedValue([]);
        const user = { role, tenantId: role === UserRole.SUPERADMIN ? null : mockTenantId };

        await expect(service.getNotes(mockTenantId, user)).resolves.toBeDefined();
      },
    );

    it('отклоняет жителя и сотрудника чужого ЖК от чтения', async () => {
      await expect(service.getNotes(mockTenantId, residentUser)).rejects.toThrow(ForbiddenException);
      await expect(
        service.getNotes(mockTenantId, otherTenantSecurity),
      ).rejects.toThrow(ForbiddenException);
    });

    it('запрашивает не более 50 последних записей, отсортированных от новых к старым', async () => {
      prismaMock.shiftHandoverNote.findMany.mockResolvedValue([]);

      await service.getNotes(mockTenantId, dispatcherUser);

      expect(prismaMock.shiftHandoverNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: mockTenantId },
          take: 50,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
