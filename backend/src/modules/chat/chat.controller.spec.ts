import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('ChatController (TASK-025: HOA_CHAIRMAN access)', () => {
  let controller: ChatController;
  let chatServiceMock: any;
  let reflector: Reflector;

  const mockTenantId = 'tenant-1';
  const mockConversationId = 'conv-101';

  const hoaChairmanUser = {
    id: 'chairman-1',
    role: UserRole.HOA_CHAIRMAN,
    tenantId: mockTenantId,
    firstName: 'Бауржан',
    lastName: 'Председатель',
  };

  beforeEach(async () => {
    chatServiceMock = {
      getMyConversation: jest.fn(),
      sendResidentMessage: jest.fn(),
      getTenantConversations: jest.fn(),
      getConversationMessages: jest.fn(),
      sendStaffMessage: jest.fn(),
      resolveConversation: jest.fn(),
      exportConversationCsv: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatServiceMock },
        Reflector,
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Staff-facing @Roles annotations', () => {
    const expectedStaffRoles = [
      UserRole.DISPATCHER,
      UserRole.HOA_ADMIN,
      UserRole.SUPERADMIN,
      UserRole.HOA_CHAIRMAN,
    ];

    it('getTenantConversations should include HOA_CHAIRMAN in @Roles', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.getTenantConversations);
      expect(roles).toBeDefined();
      expect(roles).toEqual(expectedStaffRoles);
      expect(roles).toContain(UserRole.HOA_CHAIRMAN);
    });

    it('getConversationMessages should include HOA_CHAIRMAN in @Roles', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.getConversationMessages);
      expect(roles).toBeDefined();
      expect(roles).toEqual(expectedStaffRoles);
      expect(roles).toContain(UserRole.HOA_CHAIRMAN);
    });

    it('sendStaffMessage should include HOA_CHAIRMAN in @Roles', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.sendStaffMessage);
      expect(roles).toBeDefined();
      expect(roles).toEqual(expectedStaffRoles);
      expect(roles).toContain(UserRole.HOA_CHAIRMAN);
    });

    it('resolveConversation should include HOA_CHAIRMAN in @Roles', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.resolveConversation);
      expect(roles).toBeDefined();
      expect(roles).toEqual(expectedStaffRoles);
      expect(roles).toContain(UserRole.HOA_CHAIRMAN);
    });

    it('exportConversationCsv should include HOA_CHAIRMAN in @Roles', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.exportConversationCsv);
      expect(roles).toBeDefined();
      expect(roles).toEqual(expectedStaffRoles);
      expect(roles).toContain(UserRole.HOA_CHAIRMAN);
    });
  });

  describe('Staff methods execution with HOA_CHAIRMAN', () => {
    it('delegates getTenantConversations to ChatService with resolved boolean filter', async () => {
      chatServiceMock.getTenantConversations.mockResolvedValueOnce([{ id: mockConversationId }]);
      const req = { user: hoaChairmanUser };

      const res = await controller.getTenantConversations(mockTenantId, req, 'false');

      expect(res).toEqual([{ id: mockConversationId }]);
      expect(chatServiceMock.getTenantConversations).toHaveBeenCalledWith(
        mockTenantId,
        hoaChairmanUser,
        false,
      );
    });

    it('delegates getConversationMessages to ChatService', async () => {
      chatServiceMock.getConversationMessages.mockResolvedValueOnce({ id: mockConversationId, messages: [] });
      const req = { user: hoaChairmanUser };

      const res = await controller.getConversationMessages(mockConversationId, req);

      expect(res).toEqual({ id: mockConversationId, messages: [] });
      expect(chatServiceMock.getConversationMessages).toHaveBeenCalledWith(
        mockConversationId,
        hoaChairmanUser,
      );
    });

    it('delegates sendStaffMessage to ChatService', async () => {
      const msgDto = { text: 'Здравствуйте от председателя' };
      chatServiceMock.sendStaffMessage.mockResolvedValueOnce({ id: 'm-1', ...msgDto });
      const req = { user: hoaChairmanUser };

      const res = await controller.sendStaffMessage(mockConversationId, req, msgDto);

      expect(res).toEqual({ id: 'm-1', ...msgDto });
      expect(chatServiceMock.sendStaffMessage).toHaveBeenCalledWith(
        mockConversationId,
        hoaChairmanUser,
        msgDto,
      );
    });

    it('delegates resolveConversation to ChatService', async () => {
      chatServiceMock.resolveConversation.mockResolvedValueOnce({ id: mockConversationId, isResolved: true });
      const req = { user: hoaChairmanUser };

      const res = await controller.resolveConversation(mockConversationId, req);

      expect(res).toEqual({ id: mockConversationId, isResolved: true });
      expect(chatServiceMock.resolveConversation).toHaveBeenCalledWith(
        mockConversationId,
        hoaChairmanUser,
      );
    });

    it('delegates exportConversationCsv to ChatService and sets response headers', async () => {
      const csvBuffer = Buffer.from('test,csv');
      const filename = 'chat-export.csv';
      chatServiceMock.exportConversationCsv.mockResolvedValueOnce({ buffer: csvBuffer, filename });
      const req = { user: hoaChairmanUser };
      const res: any = {
        setHeader: jest.fn(),
        end: jest.fn(),
      };

      await controller.exportConversationCsv(mockConversationId, req, res);

      expect(chatServiceMock.exportConversationCsv).toHaveBeenCalledWith(
        mockConversationId,
        hoaChairmanUser,
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="${filename}"`);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', csvBuffer.length);
      expect(res.end).toHaveBeenCalledWith(csvBuffer);
    });
  });
});
