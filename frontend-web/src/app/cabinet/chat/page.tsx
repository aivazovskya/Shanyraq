'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Send,
  Building2,
  CheckCheck,
  Loader2,
  RefreshCw,
  AlertCircle,
  User,
} from 'lucide-react';
import {
  CabinetApi,
  ChatConversation,
  ChatMessage,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getRoleLabel } from '@/lib/cabinet-labels';
import { createRealtimeSocket } from '@/lib/socket';
import { Socket } from 'socket.io-client';

export default function CabinetChatPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversation = useCallback(async () => {
    try {
      setLoading(true);
      const [me, conv] = await Promise.all([
        CabinetApi.getMe(),
        CabinetApi.getMyConversation(),
      ]);
      setProfile(me);
      setConversation(conv);
      setMessages(conv.messages || []);
      return conv;
    } catch (e) {
      console.warn('Failed to load chat conversation:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize socket and load conversation
  useEffect(() => {
    let active = true;

    loadConversation().then((conv) => {
      if (!active || !conv) return;

      const sock = createRealtimeSocket();
      if (!sock) return;
      socketRef.current = sock;

      sock.on('connect', () => {
        setSocketConnected(true);
        sock.emit('chat:join', { conversationId: conv.id });
      });

      sock.on('disconnect', () => {
        setSocketConnected(false);
      });

      sock.on('chat:message', (newMsg: ChatMessage) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      });
    });

    return () => {
      active = false;
      if (socketRef.current) {
        if (conversation) {
          socketRef.current.emit('chat:leave', { conversationId: conversation.id });
        }
        socketRef.current.disconnect();
      }
    };
  }, [loadConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const sent = await CabinetApi.sendChatMessage(textToSend);
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
    } catch (err: any) {
      alert(err?.message || t('cabinet.chatSendError'));
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' },
      ).format(new Date(dateStr));
    } catch {
      return '';
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{t('cabinet.chatWithHoa')}</span>
              {socketConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title={t('cabinet.online')} />
              )}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {profile?.tenant?.name || profile?.tenantName || t('cabinet.dispatcher')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadConversation()}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
          title={t('cabinet.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 max-w-sm mx-auto">
            <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t('cabinet.chatWelcome')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.chatPrompt')}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === profile?.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {!isMe && (
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 ml-1 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{msg.sender?.firstName || t('cabinet.dispatcher')}</span>
                    {msg.sender?.role && (
                      <span className="text-[9px] font-semibold px-1 rounded bg-slate-200 dark:bg-slate-700">
                        {getRoleLabel(msg.sender.role, t)}
                      </span>
                    )}
                  </span>
                )}

                <div
                  className={`max-w-md rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                    isMe
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      isMe ? 'text-emerald-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatTime(msg.createdAt)}</span>
                    {isMe && <CheckCheck className="w-3 h-3" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('cabinet.chatPlaceholder')}
          className="flex-1 py-2.5 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{t('cabinet.chatSend')}</span>
        </button>
      </form>
    </div>
  );
}
