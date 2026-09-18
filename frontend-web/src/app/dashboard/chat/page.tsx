'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import {
  MessageSquare,
  Search,
  Send,
  Image as ImageIcon,
  Paperclip,
  X,
  RefreshCw,
  Building2,
  Phone,
  User as UserIcon,
  Home,
  CheckCheck,
  Download,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, AuthUser } from '@/lib/api';
import { createRealtimeSocket } from '@/lib/socket';
import { Socket } from 'socket.io-client';

export interface ChatSender {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  photoUrl: string | null;
  createdAt: string;
  sender?: ChatSender;
}

export interface ConversationItem {
  id: string;
  tenantId: string;
  residentId: string;
  lastReadByResidentAt: string | null;
  lastReadByStaffAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  resident?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    ownerships?: Array<{
      unit?: {
        unitNumber: string;
        building?: { blockName: string };
      };
    }>;
  };
  lastMessage?: ChatMessageItem | null;
  isResolved?: boolean;
  resolvedAt?: string | null;
  resolvedById?: string | null;
}

export interface TenantItem {
  id: string;
  name: string;
  city?: string;
  address?: string;
}

export default function DispatcherChatPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Conversations state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterResolved, setFilterResolved] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('ALL');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected conversation state
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Photo modal preview
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // CSV Export & Resolve state
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canExportCsv = ['DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN'].includes(currentUser?.role || '');
  const canResolveChat = ['DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN'].includes(currentUser?.role || '');

  const handleResolveConversation = async () => {
    if (!selectedConversationId || resolving) return;
    setResolving(true);
    try {
      const updated = await apiRequest<ConversationItem>(
        `/chat/conversations/${selectedConversationId}/resolve`,
        { method: 'PATCH' },
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversationId
            ? {
                ...c,
                isResolved: true,
                resolvedAt: updated?.resolvedAt || new Date().toISOString(),
                resolvedById: updated?.resolvedById || currentUser?.id || null,
              }
            : c,
        ),
      );
    } catch (err: any) {
      console.error('Failed to resolve conversation:', err);
      alert(err.message || t('chat.resolveError'));
    } finally {
      setResolving(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedConversationId) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      await apiDownload(
        `/chat/conversations/${selectedConversationId}/export`,
        `chat-transcript-${selectedConversationId}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || t('chat.exportError'));
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevConvIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Initial auth and tenant setup
  useEffect(() => {
    const session = getStoredSession();
    if (session && session.user) {
      setCurrentUser(session.user);
      if (session.user.tenantId) {
        setTenantId(session.user.tenantId);
      } else if (session.user.role === 'SUPERADMIN') {
        loadTenants();
      }
    }
  }, []);

  const loadTenants = async () => {
    setLoadingTenants(true);
    try {
      const data = await apiRequest<TenantItem[]>('/tenants');
      setTenants(data || []);
      if (data && data.length > 0) {
        setTenantId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoadingTenants(false);
    }
  };

  // 2. Fetch conversations list
  const loadConversations = useCallback(
    async (tId: string, isSilent = false, resolvedOverride?: 'ALL' | 'UNRESOLVED' | 'RESOLVED') => {
      if (!tId) return;
      if (!isSilent) setLoadingConversations(true);
      else setRefreshingList(true);
      setErrorMsg(null);

      const activeFilter = resolvedOverride ?? filterResolved;
      let url = `/chat/tenants/${tId}/conversations`;
      if (activeFilter === 'UNRESOLVED') {
        url += '?resolved=false';
      } else if (activeFilter === 'RESOLVED') {
        url += '?resolved=true';
      }

      try {
        const data = await apiRequest<ConversationItem[]>(url);
        setConversations(data || []);
      } catch (err: any) {
        console.error('Failed to load conversations:', err);
        setErrorMsg(err.message || t('chat.loadError'));
      } finally {
        setLoadingConversations(false);
        setRefreshingList(false);
      }
    },
    [t, filterResolved],
  );

  useEffect(() => {
    if (tenantId) {
      loadConversations(tenantId, false, filterResolved);
    }
  }, [tenantId, filterResolved, loadConversations]);

  // 3. Fetch messages for selected conversation
  const loadMessages = useCallback(
    async (convId: string, isSilent = false) => {
      if (!convId) return;
      if (!isSilent) setLoadingMessages(true);

      try {
        const data = await apiRequest<{ messages: ChatMessageItem[] }>(
          `/chat/conversations/${convId}/messages`,
        );
        setMessages(data.messages || []);

        // Also update unread count locally in conversations list
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
        );
      } catch (err: any) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  // Real-time WebSocket: подключение и подписка на входящие ЖК
  useEffect(() => {
    if (!tenantId) return;

    const socket = createRealtimeSocket();
    if (!socket) return;
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('chat:join', { tenantId });
      // Reconciliation fetch при подключении
      loadConversations(tenantId, true);
      if (selectedConversationId) {
        loadMessages(selectedConversationId, true);
      }
    });

    socket.on('reconnect', () => {
      socket.emit('chat:join', { tenantId });
      if (selectedConversationId) {
        socket.emit('chat:join', { conversationId: selectedConversationId });
      }
      // Reconciliation fetch при реконнекте
      loadConversations(tenantId, true);
      if (selectedConversationId) {
        loadMessages(selectedConversationId, true);
      }
    });

    const handleConversationStatus = (payload: {
      conversationId: string;
      isResolved: boolean;
      resolvedAt: string | null;
      resolvedById: string | null;
    }) => {
      if (!payload || !payload.conversationId) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                isResolved: payload.isResolved,
                resolvedAt: payload.resolvedAt,
                resolvedById: payload.resolvedById,
              }
            : c,
        ),
      );
    };

    const handleInboxMessage = (payload: any) => {
      const role = payload?.message?.sender?.role;
      if (payload?.conversationId && (!role || role === 'RESIDENT' || role === 'RESIDENT_OWNER' || role === 'RESIDENT_TENANT')) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === payload.conversationId
              ? { ...c, isResolved: false, resolvedAt: null, resolvedById: null }
              : c,
          ),
        );
      }
      // Обновляем список диалогов и счетчики без поллинга
      loadConversations(tenantId, true);
    };

    socket.on('chat:inbox:conversation-status', handleConversationStatus);
    socket.on('chat:inbox:message', handleInboxMessage);

    return () => {
      socket.off('chat:inbox:conversation-status', handleConversationStatus);
      socket.off('chat:inbox:message', handleInboxMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tenantId, loadConversations, loadMessages, selectedConversationId]);

  // Real-time подписка на комнату активного диалога
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Выходим из предыдущего диалога
    if (prevConvIdRef.current && prevConvIdRef.current !== selectedConversationId) {
      socket.emit('chat:leave', { conversationId: prevConvIdRef.current });
    }

    if (selectedConversationId) {
      socket.emit('chat:join', { conversationId: selectedConversationId });
      prevConvIdRef.current = selectedConversationId;
    } else {
      prevConvIdRef.current = null;
    }

    const handleIncomingMessage = (newMsg: ChatMessageItem) => {
      if (newMsg && newMsg.conversationId === selectedConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        const role = newMsg.sender?.role;
        if (!role || role === 'RESIDENT' || role === 'RESIDENT_OWNER' || role === 'RESIDENT_TENANT') {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConversationId
                ? { ...c, isResolved: false, resolvedAt: null, resolvedById: null }
                : c,
            ),
          );
        }
      }
    };

    socket.on('chat:message', handleIncomingMessage);

    return () => {
      socket.off('chat:message', handleIncomingMessage);
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // 4. Send staff reply
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = replyText.trim();
    const photoToSend = photoUrl.trim();
    if (!selectedConversationId || (!textToSend && !photoToSend) || sending) return;

    setSending(true);
    try {
      const newMsg = await apiRequest<ChatMessageItem>(
        `/chat/conversations/${selectedConversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: textToSend || undefined,
            photoUrl: photoToSend || undefined,
          }),
        },
      );

      setMessages((prev) => [...prev, newMsg]);
      setReplyText('');
      setPhotoUrl('');
      setShowPhotoInput(false);

      // Refresh conversations list to update last message preview
      if (tenantId) {
        loadConversations(tenantId, true);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      alert(err.message || t('chat.sendError'));
    } finally {
      setSending(false);
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedConversationId);

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${c.resident?.firstName || ''} ${c.resident?.lastName || ''}`.toLowerCase();
    const phone = (c.resident?.phone || '').toLowerCase();
    const lastMsg = (c.lastMessage?.text || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
  });

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatConversationTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-sky-600" />
            <span>{t('chat.pageTitle')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('chat.pageSubtitle')}</p>
        </div>

        {/* Tenant selector for SUPERADMIN & refresh list button */}
        <div className="flex items-center gap-3">
          {currentUser?.role === 'SUPERADMIN' && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <select
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value);
                  setSelectedConversationId(null);
                }}
                disabled={loadingTenants}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {tenants.map((ten) => (
                  <option key={ten.id} value={ten.id}>
                    {ten.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => tenantId && loadConversations(tenantId)}
            disabled={refreshingList || loadingConversations}
            title={t('common.refresh')}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingList ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Two-Column Inbox Container */}
      <div className="flex-1 min-h-0 pt-4 flex gap-4">
        {/* Left Column: Conversation List */}
        <div className="w-80 md:w-96 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0">
          {/* Search bar & Status Filter */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('chat.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="flex p-1 bg-slate-100/80 rounded-xl mt-2.5 gap-1">
              <button
                type="button"
                onClick={() => setFilterResolved('ALL')}
                className={`flex-1 py-1 px-2 text-xs font-medium rounded-lg transition-colors ${
                  filterResolved === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('chat.filterAll')}
              </button>
              <button
                type="button"
                onClick={() => setFilterResolved('UNRESOLVED')}
                className={`flex-1 py-1 px-2 text-xs font-medium rounded-lg transition-colors ${
                  filterResolved === 'UNRESOLVED'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('chat.filterUnresolved')}
              </button>
              <button
                type="button"
                onClick={() => setFilterResolved('RESOLVED')}
                className={`flex-1 py-1 px-2 text-xs font-medium rounded-lg transition-colors ${
                  filterResolved === 'RESOLVED'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('chat.filterResolved')}
              </button>
            </div>
          </div>

          {/* Conversations list scrollable area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConversations ? (
              <div className="p-8 text-center text-sm text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                {t('common.loading')}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{t('chat.noConversationsTitle')}</p>
                <p className="text-xs text-slate-400 mt-1">{t('chat.noConversationsSub')}</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const residentName = conv.resident
                  ? `${conv.resident.firstName} ${conv.resident.lastName}`.trim()
                  : t('chat.residentFallback');
                const unitNumber = conv.resident?.ownerships?.[0]?.unit?.unitNumber;
                const blockName = conv.resident?.ownerships?.[0]?.unit?.building?.blockName;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 hover:bg-slate-50 ${
                      isSelected ? 'bg-sky-50/70 border-l-4 border-sky-600' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {conv.resident?.firstName?.charAt(0) || 'Ж'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {residentName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.isResolved && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {t('chat.resolvedBadge')}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            {formatConversationTime(conv.lastMessage?.createdAt || conv.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Apartment / Block info */}
                      {(unitNumber || conv.resident?.phone) && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          {unitNumber && (
                            <span className="inline-flex items-center gap-1">
                              <Home className="w-3 h-3 text-slate-400" />
                              {blockName ? `${blockName}, ` : ''}
                              {t('chat.apartment')} {unitNumber}
                            </span>
                          )}
                          {conv.resident?.phone && (
                            <span className="text-slate-400 truncate">{conv.resident.phone}</span>
                          )}
                        </div>
                      )}

                      {/* Last message snippet + unread badge */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500 truncate">
                          {conv.lastMessage?.photoUrl && !conv.lastMessage?.text ? (
                            <span className="flex items-center gap-1 italic text-slate-600">
                              <ImageIcon className="w-3 h-3" /> {t('chat.photoLabel')}
                            </span>
                          ) : (
                            conv.lastMessage?.text || t('chat.noMessages')
                          )}
                        </p>

                        {conv.unreadCount > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-500 text-white shrink-0 shadow-sm animate-pulse">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Thread */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {selectedConv ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-sm">
                    {selectedConv.resident?.firstName?.charAt(0) || 'Ж'}
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-slate-900">
                      {selectedConv.resident
                        ? `${selectedConv.resident.firstName} ${selectedConv.resident.lastName}`
                        : t('chat.residentFallback')}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {selectedConv.resident?.phone && (
                        <a
                          href={`tel:${selectedConv.resident.phone}`}
                          className="flex items-center gap-1 hover:text-sky-600"
                        >
                          <Phone className="w-3 h-3" />
                          {selectedConv.resident.phone}
                        </a>
                      )}
                      {selectedConv.resident?.ownerships?.[0]?.unit && (
                        <span className="flex items-center gap-1 text-slate-600 font-medium">
                          <Home className="w-3 h-3 text-slate-400" />
                          {selectedConv.resident.ownerships[0].unit.building?.blockName
                            ? `${selectedConv.resident.ownerships[0].unit.building.blockName}, `
                            : ''}
                          {t('chat.apartment')} {selectedConv.resident.ownerships[0].unit.unitNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canResolveChat && (
                    selectedConv.isResolved ? (
                      <span className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1.5">
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t('chat.resolvedBadge')}</span>
                      </span>
                    ) : (
                      <button
                        onClick={handleResolveConversation}
                        disabled={resolving || !selectedConversationId}
                        title={t('chat.resolveBtn')}
                        className="px-2.5 py-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold border border-emerald-200 bg-white shadow-sm"
                      >
                        {resolving ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span>{t('chat.resolveBtn')}</span>
                      </button>
                    )
                  )}

                  {canExportCsv && (
                    <button
                      onClick={handleExportCsv}
                      disabled={exportingCsv || !selectedConversationId}
                      title={t('chat.exportCsvBtn')}
                      className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold border border-slate-200 bg-white shadow-sm"
                    >
                      {exportingCsv ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{t('chat.exportCsvBtn')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => selectedConversationId && loadMessages(selectedConversationId)}
                    title={t('common.refresh')}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {exportError && (
                <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{exportError}</span>
                  </div>
                  <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {loadingMessages && messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2 text-sky-600" />
                    {t('common.loading')}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">{t('chat.noMessages')}</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {t('chat.replyPlaceholder')}
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isStaff = msg.senderId !== selectedConv.residentId;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender info */}
                        <span className="text-[11px] text-slate-400 px-1 mb-1">
                          {isStaff
                            ? `${msg.sender?.firstName || t('chat.dispatcherFallback')} (${t('roles.dispatcher')})`
                            : selectedConv.resident?.firstName || t('chat.residentFallback')}
                          {' • '}
                          {formatMessageTime(msg.createdAt)}
                        </span>

                        {/* Message bubble */}
                        <div
                          className={`max-w-[75%] rounded-2xl p-3.5 shadow-sm text-sm break-words ${
                            isStaff
                              ? 'bg-sky-600 text-white rounded-tr-none'
                              : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none'
                          }`}
                        >
                          {/* Attached Photo */}
                          {msg.photoUrl && (
                            <div className="mb-2">
                              <img
                                src={msg.photoUrl}
                                alt="Attachment"
                                onClick={() => setPreviewPhoto(msg.photoUrl)}
                                className="max-h-60 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                              />
                            </div>
                          )}

                          {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input Box */}
              <div className="p-3.5 border-t border-slate-200 bg-white">
                {/* Photo URL Input Bar if opened */}
                {showPhotoInput && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="url"
                      placeholder={t('chat.photoUrlPlaceholder')}
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className="flex-1 bg-transparent text-xs text-slate-800 focus:outline-none"
                    />
                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl('')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPhotoInput(!showPhotoInput)}
                    className={`p-2.5 rounded-xl border transition-colors ${
                      showPhotoInput || photoUrl
                        ? 'bg-sky-50 border-sky-300 text-sky-600'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                    title={t('chat.attachPhoto')}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <textarea
                    rows={2}
                    placeholder={t('chat.replyPlaceholder')}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  />

                  <button
                    type="submit"
                    disabled={(!replyText.trim() && !photoUrl.trim()) || sending}
                    className="p-3 rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
                    title={t('chat.sendBtn')}
                  >
                    <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{t('chat.selectConversationTitle')}</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                {t('chat.selectConversationSub')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 p-1"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewPhoto}
              alt="Full Preview"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
