import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('ChatService', () => {
  let service: ChatService;
  let prismaMock: any;
  let notificationsMock: any;

  const mockTenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';
  const mockConversationId = 'conv-123';

  const verifiedResident = {
    id: 'user-resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Айбек',
    lastName: 'Нурланов',
    phone: '+77015550101',
    isVerified: true,
  };

  const unverifiedResident = {
    id: 'user-resident-unverified',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Берик',
    lastName: 'Неверифицированный',
    phone: '+77011112233',
    isVerified: false,
  };

  const otherTenantResident = {
    id: 'user-resident-other',
    role: UserRole.RESIDENT_OWNER,
    tenantId: otherTenantId,
    firstName: 'Серик',
    lastName: 'Чужой',
    phone: '+77014445566',
    isVerified: true,
  };

  const dispatcherUser = {
    id: 'dispatcher-1',
    role: UserRole.DISPATCHER,
    tenantId: mockTenantId,
    firstName: 'Гульнара',
    lastName: 'Диспетчерова',
  };

  const otherTenantDispatcher = {
    id: 'dispatcher-2',
    role: UserRole.DISPATCHER,
    tenantId: otherTenantId,
    firstName: 'Кайрат',
    lastName: 'ЧужойДиспетчер',
  };

  const hoaAdminUser = {
    id: 'hoa-admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
    firstName: 'Ерлан',
    lastName: 'Управляющий',
  };

  const hoaChairmanUser = {
    id: 'chairman-1',
    role: UserRole.HOA_CHAIRMAN,
    tenantId: mockTenantId,
    firstName: 'Бауржан',
    lastName: 'Председатель',
  };

  const superAdminUser = {
    id: 'super-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
    firstName: 'Админ',
    lastName: 'Главный',
  };

  beforeEach(async () => {
    prismaMock = {
      unitOwnership: {
        findFirst: jest.fn(),
      },
      conversation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
    };

    notificationsMock = {
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('getMyConversation', () => {
    it('allows verified resident to get-or-create their conversation', async () => {
      // Mock resident ownership lookup
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } }) // resolveResidentTenant
        .mockResolvedValueOnce({ id: 'own-1', isVerified: true }); // assertAccessToTenant

      // Mock conversation findUnique returning null initially, then created
      prismaMock.conversation.findUnique.mockResolvedValueOnce(null);
      const createdConv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
        lastReadByResidentAt: new Date(),
        messages: [],
      };
      prismaMock.conversation.create.mockResolvedValueOnce(createdConv);

      const result = await service.getMyConversation(verifiedResident);

      expect(result).toEqual(createdConv);
      expect(prismaMock.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            residentId: verifiedResident.id,
          }),
        }),
      );
    });

    it('returns existing conversation on second call without duplicate creation (exercises @@unique path)', async () => {
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } })
        .mockResolvedValueOnce({ id: 'own-1', isVerified: true });

      const existingConv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
        lastReadByResidentAt: new Date(Date.now() - 10000),
        messages: [
          { id: 'msg-1', text: 'Здравствуйте', senderId: verifiedResident.id },
        ],
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(existingConv);
      prismaMock.conversation.update.mockResolvedValueOnce({
        ...existingConv,
        lastReadByResidentAt: new Date(),
      });

      const result = await service.getMyConversation(verifiedResident);

      expect(result.id).toBe(mockConversationId);
      expect(prismaMock.conversation.create).not.toHaveBeenCalled();
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({ lastReadByResidentAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects unverified resident with ForbiddenException', async () => {
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } })
        .mockResolvedValueOnce(null); // No verified ownership found

      await expect(service.getMyConversation(unverifiedResident)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('rejects resident if tenant cannot be resolved', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValueOnce(null);

      const userWithoutTenant = { ...verifiedResident, tenantId: null };
      await expect(service.getMyConversation(userWithoutTenant)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('sendResidentMessage', () => {
    it('allows verified resident to send message and notifies staff (DISPATCHER, HOA_ADMIN)', async () => {
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } })
        .mockResolvedValueOnce({ id: 'own-1', isVerified: true });

      const existingConv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(existingConv);

      const createdMsg = {
        id: 'msg-101',
        conversationId: mockConversationId,
        senderId: verifiedResident.id,
        text: 'У нас протечка в подъезде',
        photoUrl: 'https://storage.shanyraq.kz/photo.jpg',
        createdAt: new Date(),
      };
      prismaMock.chatMessage.create.mockResolvedValueOnce(createdMsg);
      prismaMock.conversation.update.mockResolvedValueOnce({ ...existingConv, updatedAt: new Date() });

      const result = await service.sendResidentMessage(verifiedResident, {
        text: 'У нас протечка в подъезде',
        photoUrl: 'https://storage.shanyraq.kz/photo.jpg',
      });

      expect(result).toEqual(createdMsg);
      expect(prismaMock.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: mockConversationId,
            senderId: verifiedResident.id,
            text: 'У нас протечка в подъезде',
            photoUrl: 'https://storage.shanyraq.kz/photo.jpg',
          }),
        }),
      );
      expect(notificationsMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        [UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        expect.objectContaining({
          title: expect.stringContaining('Новое сообщение'),
        }),
      );
    });

    it('allows sending a photo with no text, storing text as null without placeholder strings', async () => {
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } })
        .mockResolvedValueOnce({ id: 'own-1', isVerified: true });

      const existingConv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(existingConv);

      const createdMsg = {
        id: 'msg-photo-only',
        conversationId: mockConversationId,
        senderId: verifiedResident.id,
        text: null,
        photoUrl: 'https://storage.shanyraq.kz/uploads/photo1.jpg',
        createdAt: new Date(),
      };
      prismaMock.chatMessage.create.mockResolvedValueOnce(createdMsg);
      prismaMock.conversation.update.mockResolvedValueOnce({ ...existingConv, updatedAt: new Date() });

      const result = await service.sendResidentMessage(verifiedResident, {
        photoUrl: 'https://storage.shanyraq.kz/uploads/photo1.jpg',
      });

      expect(result).toEqual(createdMsg);
      expect(prismaMock.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: mockConversationId,
            senderId: verifiedResident.id,
            text: null,
            photoUrl: 'https://storage.shanyraq.kz/uploads/photo1.jpg',
          }),
        }),
      );
    });

    it('rejects sending when neither text nor photo is provided', async () => {
      await expect(
        service.sendResidentMessage(verifiedResident, { text: '   ', photoUrl: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unverified resident from sending message', async () => {
      prismaMock.unitOwnership.findFirst
        .mockResolvedValueOnce({ unitId: 'unit-1', unit: { building: { tenantId: mockTenantId } } })
        .mockResolvedValueOnce(null);

      await expect(
        service.sendResidentMessage(unverifiedResident, { text: 'Привет' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Staff-facing: getTenantConversations', () => {
    it('allows DISPATCHER of the tenant to list conversations with unread counts', async () => {
      const pastDate = new Date(Date.now() - 3600000);
      const conversationsFromDb = [
        {
          id: mockConversationId,
          tenantId: mockTenantId,
          residentId: verifiedResident.id,
          lastReadByStaffAt: pastDate,
          createdAt: pastDate,
          updatedAt: new Date(),
          resident: { id: verifiedResident.id, firstName: 'Айбек', lastName: 'Нурланов' },
          messages: [{ id: 'm-1', text: 'Нужна помощь', createdAt: new Date() }],
        },
      ];

      prismaMock.conversation.findMany.mockResolvedValueOnce(conversationsFromDb);
      // Unread messages count since lastReadByStaffAt
      prismaMock.chatMessage.count.mockResolvedValueOnce(3);

      const result = await service.getTenantConversations(mockTenantId, dispatcherUser);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockConversationId);
      expect(result[0].unreadCount).toBe(3);
      expect(result[0].lastMessage.text).toBe('Нужна помощь');
    });

    it('allows SUPERADMIN to view any tenant conversations', async () => {
      prismaMock.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getTenantConversations(mockTenantId, superAdminUser);
      expect(result).toEqual([]);
    });

    it('rejects staff from another tenant with ForbiddenException', async () => {
      await expect(
        service.getTenantConversations(mockTenantId, otherTenantDispatcher),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects HOA_CHAIRMAN from viewing dispatcher chat (Decision #6)', async () => {
      await expect(
        service.getTenantConversations(mockTenantId, hoaChairmanUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects resident from listing all tenant conversations', async () => {
      await expect(
        service.getTenantConversations(mockTenantId, verifiedResident),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Staff-facing: getConversationMessages', () => {
    it('allows DISPATCHER to view full thread and resets unread by updating lastReadByStaffAt', async () => {
      const conv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
        lastReadByStaffAt: null,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(conv);
      prismaMock.conversation.update.mockResolvedValueOnce({
        ...conv,
        lastReadByStaffAt: new Date(),
      });

      const messages = [
        { id: 'm-1', text: 'Здравствуйте', senderId: verifiedResident.id },
        { id: 'm-2', text: 'Диспетчер на связи', senderId: dispatcherUser.id },
      ];
      prismaMock.chatMessage.findMany.mockResolvedValueOnce(messages);

      const result = await service.getConversationMessages(mockConversationId, dispatcherUser);

      expect(result.id).toBe(mockConversationId);
      expect(result.messages).toHaveLength(2);
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({ lastReadByStaffAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects DISPATCHER from another tenant from viewing conversation', async () => {
      const conv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(conv);

      await expect(
        service.getConversationMessages(mockConversationId, otherTenantDispatcher),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if conversation does not exist', async () => {
      prismaMock.conversation.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getConversationMessages('non-existent', dispatcherUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Staff-facing: sendStaffMessage', () => {
    it('allows DISPATCHER to reply and notifies resident via sendToUser', async () => {
      const conv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(conv);

      const createdMsg = {
        id: 'msg-staff-1',
        conversationId: mockConversationId,
        senderId: dispatcherUser.id,
        text: 'Сантехник будет у вас через 15 минут',
        photoUrl: null,
      };
      prismaMock.chatMessage.create.mockResolvedValueOnce(createdMsg);
      prismaMock.conversation.update.mockResolvedValueOnce({ ...conv, updatedAt: new Date() });

      const result = await service.sendStaffMessage(mockConversationId, dispatcherUser, {
        text: 'Сантехник будет у вас через 15 минут',
      });

      expect(result).toEqual(createdMsg);
      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        verifiedResident.id,
        expect.objectContaining({
          title: expect.stringContaining('Ответ от диспетчера'),
          body: 'Сантехник будет у вас через 15 минут',
        }),
      );
      expect(prismaMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConversationId },
          data: expect.objectContaining({ lastReadByStaffAt: expect.any(Date) }),
        }),
      );
    });

    it('allows staff to reply with photo only, storing text as null', async () => {
      const conv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(conv);

      const createdMsg = {
        id: 'msg-staff-photo',
        conversationId: mockConversationId,
        senderId: dispatcherUser.id,
        text: null,
        photoUrl: 'https://storage.shanyraq.kz/uploads/diagram.jpg',
      };
      prismaMock.chatMessage.create.mockResolvedValueOnce(createdMsg);
      prismaMock.conversation.update.mockResolvedValueOnce({ ...conv, updatedAt: new Date() });

      const result = await service.sendStaffMessage(mockConversationId, dispatcherUser, {
        photoUrl: 'https://storage.shanyraq.kz/uploads/diagram.jpg',
      });

      expect(result).toEqual(createdMsg);
      expect(prismaMock.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: mockConversationId,
            senderId: dispatcherUser.id,
            text: null,
            photoUrl: 'https://storage.shanyraq.kz/uploads/diagram.jpg',
          }),
        }),
      );
    });

    it('rejects staff reply when neither text nor photo is provided', async () => {
      await expect(
        service.sendStaffMessage(mockConversationId, dispatcherUser, { text: '', photoUrl: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects staff from another tenant from replying', async () => {
      const conv = {
        id: mockConversationId,
        tenantId: mockTenantId,
        residentId: verifiedResident.id,
      };
      prismaMock.conversation.findUnique.mockResolvedValueOnce(conv);

      await expect(
        service.sendStaffMessage(mockConversationId, otherTenantDispatcher, {
          text: 'Тест',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
