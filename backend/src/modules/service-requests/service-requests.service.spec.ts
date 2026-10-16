import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRequestsService } from './service-requests.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
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
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction = jest.fn((callback) => callback(prismaMock));

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceRequestsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: UploadsService, useValue: { openStoredFile: jest.fn() } },
      ],
    }).compile();

    service = module.get<ServiceRequestsService>(ServiceRequestsService);
  });

  describe('getRequestById (IDOR / BOLA)', () => {
    it('does not read an attachment until the request access check succeeds', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({ ...mockRequest, attachments:[{id:'file-1',fileUrl:'http://localhost/file.png',fileType:'image/png'}] });
      await expect(service.getAttachmentFile('req-1','file-1',{id:'stranger',role:UserRole.RESIDENT_OWNER})).rejects.toThrow(ForbiddenException);
    });

    it('does not accept an attachment ID from a different request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await expect(service.getAttachmentFile('req-1','foreign-file',{id:'resident-1',role:UserRole.RESIDENT_OWNER})).rejects.toMatchObject({ response:{code:'UPLOADS.FILE_NOT_FOUND'} });
    });
    it('should throw NotFoundException if request does not exist', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      const promise = service.getRequestById('non-existent', { id: 'resident-1', role: UserRole.RESIDENT_OWNER });
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SERVICE_REQUESTS.REQUEST_NOT_FOUND' },
      });
    });

    it('should allow resident to view their own request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'resident-1',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-A',
      });

      expect(result).toMatchObject(mockRequest);
    });

    it('should throw ForbiddenException if resident tries to view another resident request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const promise = service.getRequestById('req-1', {
        id: 'resident-2',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-A',
      });
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SERVICE_REQUESTS.FOREIGN_REQUEST_VIEW_FORBIDDEN' },
      });
    });

    it('should allow staff (DISPATCHER) from the same tenant to view request', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'dispatcher-1',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-A',
      });

      expect(result).toEqual({ ...mockRequest, history: [] });
    });

    it('should throw ForbiddenException if staff from tenant B tries to view request of tenant A', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const promise = service.getRequestById('req-1', {
        id: 'dispatcher-2',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-B',
      });
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SERVICE_REQUESTS.CROSS_TENANT_VIEW_FORBIDDEN' },
      });
    });

    it('should allow SUPERADMIN to view request from any tenant', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.getRequestById('req-1', {
        id: 'admin-1',
        role: UserRole.SUPERADMIN,
      });

      expect(result).toEqual({ ...mockRequest, history: [] });
    });
  });

  describe('updateStatus (Staff tenant isolation)', () => {
    const dispatcher = { id: 'dispatcher-1', role: UserRole.DISPATCHER, tenantId: 'tenant-A' };
    const candidate = { id: 'staff-1', tenantId: 'tenant-A', role: UserRole.DISPATCHER, isActive: true, firstName: 'Демо', lastName: 'Сотрудник' };

    it('runs assignment → work → public reply → completion → closure with persistent history', async () => {
      let current = { ...mockRequest } as any;
      const history: any[] = [];
      prismaMock.serviceRequest.findUnique.mockImplementation(async () => ({ ...current }));
      prismaMock.serviceRequest.update.mockImplementation(async ({ data }: any) => {
        current = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1000) };
        return current;
      });
      prismaMock.user.findUnique.mockResolvedValue(candidate);
      prismaMock.auditLog.create.mockImplementation(async ({ data }: any) => { history.push(data); return data; });
      prismaMock.auditLog.findMany.mockImplementation(async () => history);
      prismaMock.requestComment.create.mockResolvedValue({ id: 'reply-1', text: 'Работа выполнена', isInternal: false });
      await service.updateStatus('req-1', { status: RequestStatus.ASSIGNED, assigneeId: candidate.id }, dispatcher);
      await service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS }, dispatcher);
      await service.addComment('req-1', dispatcher.id, { text: 'Работа выполнена', isInternal: false }, dispatcher);
      await service.updateStatus('req-1', { status: RequestStatus.RESOLVED }, dispatcher);
      await service.updateStatus('req-1', { status: RequestStatus.CLOSED }, dispatcher);
      const detail = await service.getRequestById('req-1', dispatcher);
      expect(detail.status).toBe('CLOSED');
      expect(detail.assigneeId).toBe(candidate.id);
      expect(detail.history.map((event: any) => event.metadata.toStatus)).toEqual(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
      expect(prismaMock.requestComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ text: 'Работа выполнена', isInternal: false }) }));
    });

    it('logs reassignment without fabricating a status change', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({ ...mockRequest, status: RequestStatus.IN_PROGRESS, assigneeId: 'old-employee' });
      prismaMock.user.findUnique.mockResolvedValue(candidate);
      await service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS, assigneeId: candidate.id }, dispatcher);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REQUEST_ASSIGNEE_CHANGED' }) });
    });

    it('keeps the chairman read-only', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await expect(service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS }, { ...dispatcher, role: UserRole.HOA_CHAIRMAN })).rejects.toThrow(ForbiddenException);
    });

    it.each([null, ''])('rejects empty assignee values before querying Prisma', async (assigneeId) => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await expect(service.updateStatus('req-1', { status: RequestStatus.ASSIGNED, assigneeId } as any, dispatcher))
        .rejects.toMatchObject({ response: { code: 'SERVICE_REQUESTS.INVALID_ASSIGNEE' } });
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      null,
      { ...candidate, tenantId: 'tenant-B' },
      { ...candidate, isActive: false },
      { ...candidate, role: UserRole.RESIDENT_OWNER },
      { ...candidate, role: UserRole.HOA_CHAIRMAN },
    ])('rejects missing, foreign, inactive and non-operational assignees', async (employee) => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.user.findUnique.mockResolvedValue(employee);
      await expect(service.updateStatus('req-1', { status: RequestStatus.ASSIGNED, assigneeId: 'staff-1' }, dispatcher))
        .rejects.toMatchObject({ response: { code: 'SERVICE_REQUESTS.INVALID_ASSIGNEE' } });
      expect(prismaMock.serviceRequest.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('requires an assignee before ASSIGNED', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await expect(service.updateStatus('req-1', { status: RequestStatus.ASSIGNED }, dispatcher))
        .rejects.toMatchObject({ response: { code: 'SERVICE_REQUESTS.ASSIGNEE_REQUIRED' } });
    });

    it('assigns a same-tenant employee and records both changes atomically', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.user.findUnique.mockResolvedValue(candidate);
      prismaMock.serviceRequest.update.mockResolvedValue({ ...mockRequest, status: RequestStatus.ASSIGNED, assigneeId: candidate.id });
      await service.updateStatus('req-1', { status: RequestStatus.ASSIGNED, assigneeId: candidate.id }, dispatcher);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        actorId: dispatcher.id, tenantId: 'tenant-A', targetId: 'req-1', action: 'REQUEST_STATUS_CHANGED',
        metadata: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'ASSIGNED', fromAssigneeId: null, toAssigneeId: candidate.id }),
      }) });
      expect(prismaMock.serviceRequest.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'req-1', updatedAt: mockRequest.updatedAt } }));
    });

    it('does not claim success or send a notification if history persistence fails', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
      await expect(service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS }, dispatcher)).rejects.toThrow('audit unavailable');
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
    });

    it('returns 409 on concurrent modification instead of recording stale history', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.serviceRequest.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS }, dispatcher))
        .rejects.toMatchObject({ response: { code: 'SERVICE_REQUESTS.UPDATE_CONFLICT' } });
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects an action from a stale open card before changing anything', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await expect(service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS, expectedUpdatedAt: new Date(mockRequest.updatedAt.getTime() - 1000).toISOString() }, dispatcher))
        .rejects.toMatchObject({ response: { code: 'SERVICE_REQUESTS.UPDATE_CONFLICT' } });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('does not turn a saved change into an error when notifications fail', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      prismaMock.serviceRequest.update.mockResolvedValue({ ...mockRequest, status: RequestStatus.IN_PROGRESS });
      notificationsServiceMock.sendToUser.mockRejectedValue(new Error('push unavailable'));
      await expect(service.updateStatus('req-1', { status: RequestStatus.IN_PROGRESS }, dispatcher)).resolves.toMatchObject({ status: 'IN_PROGRESS' });
    });

    it('treats an unchanged status and assignee as a no-op', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await service.updateStatus('req-1', { status: RequestStatus.PENDING }, dispatcher);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('lists only eligible employees for the request complex', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockRequest);
      await service.getAssignees('req-1', dispatcher);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
        tenantId: 'tenant-A', isActive: true, role: { in: [UserRole.HOA_ADMIN, UserRole.DISPATCHER] },
      } }));
      await expect(service.getAssignees('req-1', { ...dispatcher, tenantId: 'tenant-B' })).rejects.toThrow(ForbiddenException);
      await expect(service.getAssignees('req-1', { ...dispatcher, role: UserRole.HOA_CHAIRMAN })).rejects.toThrow(ForbiddenException);
    });
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

  describe('createRequest (Subtask C2: unit ownership check)', () => {
    const mockUnit = {
      id: 'unit-target',
      building: { id: 'b-1', tenantId: 'tenant-A' },
      ownerships: [
        { userId: 'legit-owner', isVerified: true },
        { userId: 'unverified-resident', isVerified: false },
      ],
    };

    const mockDto = {
      unitId: 'unit-target',
      title: 'Протечка трубы',
      description: 'Течет вода',
      category: 'PLUMBING' as any,
      priority: 'HIGH' as any,
    };

    it('должен блокировать создание заявки для чужой квартиры посторонним жителем', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'attacker-resident',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-A',
      });

      try {
        await service.createRequest('attacker-resident', mockDto);
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.getResponse().code).toBe('SERVICE_REQUESTS.UNIT_ACCESS_FORBIDDEN');
      }
    });

    it('должен блокировать создание заявки неподтвержденным жильцом', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'unverified-resident',
        role: UserRole.RESIDENT_TENANT,
        tenantId: 'tenant-A',
      });

      await expect(
        service.createRequest('unverified-resident', mockDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен успешно создавать заявку для подтвержденного собственника помещения', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      prismaMock.serviceRequest.create.mockResolvedValue({
        id: 'req-new',
        ...mockDto,
        tenantId: 'tenant-A',
        creatorId: 'legit-owner',
      });

      const res = await service.createRequest('legit-owner', mockDto);
      expect(res.id).toBe('req-new');
      expect(prismaMock.serviceRequest.create).toHaveBeenCalled();
    });

    it('должен разрешать создание заявки диспетчеру данного ЖК от имени жильца', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(mockUnit);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'dispatcher-1',
        role: UserRole.DISPATCHER,
        tenantId: 'tenant-A',
      });
      prismaMock.serviceRequest.create.mockResolvedValue({
        id: 'req-dispatcher',
        ...mockDto,
        tenantId: 'tenant-A',
      });

      const res = await service.createRequest('dispatcher-1', mockDto);
      expect(res.id).toBe('req-dispatcher');
    });
  });
});
