import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestStatus, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ServiceRequestsService (IDOR / BOLA and Tenant Isolation)', () => {
  let service: ServiceRequestsService;
  let prismaMock: any;
  let notificationsServiceMock: any;

  const mockRequest = {
    id: 'req-1',
    tenantId: 'tenant-A',
    unitId: 'unit-1',
    creatorId: 'resident-1',
    title: 'Кран протекает',
    description: 'В ванной капает вода',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    status: RequestStatus.PENDING,
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    unit: { id: 'unit-1', building: { id: 'b-1', tenantId: 'tenant-A' } },
    creator: { firstName: 'Иван', lastName: 'Иванов', phone: '+77011111111' },
    assignee: null,
    comments: [],
    attachments: [],
  };

  beforeEach(async () => {
    prismaMock = {
      serviceRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      requestComment: {
        create: jest.fn(),
      },
      unit: {
        findUnique: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceRequestsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<ServiceRequestsService>(ServiceRequestsService);
  });

  describe('getRequestById (IDOR / BOLA)', () => {
    it('should throw NotFoundException if request does not exist', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.getRequestById('non-existent', { id: 'resident-1', role: UserRole.RESIDENT_OWNER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow resident to view their own request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'resident-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-A',
      });

      expect(result).toEqual(mockRequest);
    });

    it('should throw ForbiddenException if resident tries to view another resident request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.getRequestById('req-1', {
          id: 'resident-2',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-A',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow staff (DISPATCHER) from the same tenant to view request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'dispatcher-1',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-A',
      });

      expect(result).toEqual(mockRequest);
    });

    it('should throw ForbiddenException if staff from tenant B tries to view request of tenant A', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.getRequestById('req-1', {
          id: 'dispatcher-2',
          role: UserRole.DISPATCHER,
          tenantId: 'tenant-B',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERADMIN to view request from any tenant', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'admin-1',
        role: UserRole.SUPERADMIN,
      });

      expect(result).toEqual(mockRequest);
    });
  });

  describe('updateStatus (Staff tenant isolation)', () => {
    it('should allow staff of the same tenant to update status', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.serviceRequest.update.mockResolvedValue({
        ...mockRequest,
        status: RequestStatus.IN_PROGRESS,
      });

      const result = await service.updateStatus(
        'req-1',
        { status: RequestStatus.IN_PROGRESS },
        { id: 'dispatcher-1', role: UserRole.DISPATCHER, tenantId: 'tenant-A' },
      );

      expect(result.status).toEqual(RequestStatus.IN_PROGRESS);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('resident-1', expect.anything());
    });

    it('should throw ForbiddenException if staff from tenant B updates request in tenant A', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.updateStatus(
          'req-1',
          { status: RequestStatus.IN_PROGRESS },
          { id: 'dispatcher-2', role: UserRole.DISPATCHER, tenantId: 'tenant-B' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if resident tries to update status', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.updateStatus(
          'req-1',
          { status: RequestStatus.IN_PROGRESS },
          { id: 'resident-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-A' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERADMIN to update status regardless of tenant', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.serviceRequest.update.mockResolvedValue({
        ...mockRequest,
        status: RequestStatus.RESOLVED,
      });

      const result = await service.updateStatus(
        'req-1',
        { status: RequestStatus.RESOLVED },
        { id: 'admin-1', role: UserRole.SUPERADMIN },
      );

      expect(result.status).toEqual(RequestStatus.RESOLVED);
    });
  });

  describe('addComment (Access control)', () => {
    it('should allow creator resident to add public comment to own request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.requestComment.create.mockResolvedValue({
        id: 'c-1',
        requestId: 'req-1',
        authorId: 'resident-1',
        text: 'Уточнение по времени',
        isInternal: false,
      });

      const result = await service.addComment(
        'req-1',
        'resident-1',
        { text: 'Уточнение по времени' },
        { id: 'resident-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-A' },
      );

      expect(result.id).toBe('c-1');
      expect(prismaMock.requestComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isInternal: false,
          }),
        }),
      );
    });

    it('should throw ForbiddenException if resident tries to comment on another resident request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.addComment(
          'req-1',
          'resident-2',
          { text: 'Чужой комментарий' },
          { id: 'resident-2', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-A' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow staff in same tenant to add internal note', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.requestComment.create.mockResolvedValue({
        id: 'c-2',
        requestId: 'req-1',
        authorId: 'dispatcher-1',
        text: 'Внутренняя заметка для сантехника',
        isInternal: true,
      });

      const result = await service.addComment(
        'req-1',
        'dispatcher-1',
        { text: 'Внутренняя заметка для сантехника', isInternal: true },
        { id: 'dispatcher-1', role: UserRole.DISPATCHER, tenantId: 'tenant-A' },
      );

      expect(result.id).toBe('c-2');
      expect(prismaMock.requestComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isInternal: true,
          }),
        }),
      );
    });

    it('should throw ForbiddenException if staff from another tenant tries to comment', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      await expect(
        service.addComment(
          'req-1',
          'dispatcher-2',
          { text: 'Комментарий из другого ЖК' },
          { id: 'dispatcher-2', role: UserRole.DISPATCHER, tenantId: 'tenant-B' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
