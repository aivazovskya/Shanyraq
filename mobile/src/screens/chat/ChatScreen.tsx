import { LoadError } from '../../components/common/LoadError';
import { PhotoGallery } from '../../components/common/PhotoGallery';
import { getApiErrorMessage } from '../../api/client';
import { PhotoAttachments } from '../../components/common/PhotoAttachments';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { ChatApi, ChatMessage, Conversation } from '../../api/chat';
import { TokenStorage } from '../../storage/token-storage';
import { Config } from '../../constants/config';
import { Colors } from '../../constants/colors';
import io, { Socket } from 'socket.io-client';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  ShieldCheck,
  Building2,
  RefreshCw,
  Paperclip,
} from 'lucide-react-native';

export const ChatScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const [attachmentOptionsVisible, setAttachmentOptionsVisible] = useState(false);
  const [unverifiedError, setUnverifiedError] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const loadVersion = useRef(0);

  const loadConversation = useCallback(async (isSilent = false) => {
    const version = ++loadVersion.current;
    if (!isSilent) setLoading(true);
    setUnverifiedError(false);

    try {
      const conv = await ChatApi.getMyConversation();
      if (version !== loadVersion.current) return null;
      conversationRef.current = conv;
      socketRef.current?.emit('chat:join', { conversationId: conv.id });
      setConversation(conv);
      setLoadFailed(false);
      setMessages(conv.messages || []);
      return conv;
    } catch (err: any) {
      if (version !== loadVersion.current) return null;
      setLoadFailed(true);
      if (err?.response?.status === 403) {
        setUnverifiedError(true);
      } else if (!isSilent) {
        console.warn('Failed to load chat conversation:', err);
      }
      return null;
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  // Real-time WebSocket connection while screen is focused
  useFocusEffect(
    useCallback(() => {
      let socket: Socket | null = null;
      let active = true;

      const initSocket = async () => {
        await loadConversation();
        if (!active) return;

        const token = await TokenStorage.getAccessToken();
        if (!token || !active) return;

        socket = io(Config.SOCKET_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          autoConnect: true,
        });

        socketRef.current = socket;
        socket.on('connect', () => {
          if (conversationRef.current?.id) {
            socket?.emit('chat:join', { conversationId: conversationRef.current.id });
          }
        });

        socket.on('reconnect', () => {
          if (conversationRef.current?.id) {
            socket?.emit('chat:join', { conversationId: conversationRef.current.id });
          }
          // Reconciliation fetch on reconnect
          loadConversation(true);
        });

        socket.on('chat:message', (newMsg: ChatMessage) => {
          if (newMsg && newMsg.conversationId === conversationRef.current?.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        });
      };

      initSocket();

      return () => {
        active = false;
        loadVersion.current++;
        socketRef.current = null;
        if (socket) {
          socket.disconnect();
        }
      };
    }, [loadConversation]),
  );


  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && !attachedPhoto) return;
    if (actionLock.current || uploadingPhoto || !conversation) return;
    actionLock.current = true;
    setSendError(null);

    setSending(true);
    try {
      const newMsg = await ChatApi.sendMessage(textToSend || undefined, attachedPhoto || undefined);
      setMessages((prev) => prev.some((message) => message.id === newMsg.id) ? prev : [...prev, newMsg]);
      setInputText('');
      setAttachedPhoto(null);
      setAttachmentOptionsVisible(false);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: any) {
      setSendError(getApiErrorMessage(err));
    } finally {
      actionLock.current = false;
      setSending(false);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.id;

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        {!isMe && (
          <View style={styles.dispatcherAvatar}>
            <Building2 color="#FFFFFF" size={16} />
          </View>
        )}

        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {!isMe && (
            <Text style={styles.senderName}>
              {t('chat.dispatcherFallback')} ({t('chat.supportTeam')})
            </Text>
          )}

          {item.photoUrl && (
            <PhotoGallery images={[item.photoUrl]} variant="message" />
          )}

          {item.text ? (
            <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
              {item.text}
            </Text>
          ) : null}

          <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextOther]}>
            {formatMessageTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('chat.screenTitle')}</Text>
          <Text style={styles.headerSub}>{t('chat.screenSubtitle')}</Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadConversation()} disabled={loading || sending} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          <RefreshCw color={Colors.textMuted} size={20} />
        </TouchableOpacity>
      </View>

      {loadFailed && !unverifiedError && <LoadError onRetry={() => loadConversation()} retrying={loading} />}
      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : unverifiedError ? (
        <View style={styles.centerContainer}>
          <ShieldCheck color={Colors.warning} size={48} />
          <Text style={styles.unverifiedTitle}>{t('chat.unverifiedTitle')}</Text>
          <Text style={styles.unverifiedSub}>{t('chat.unverifiedNotice')}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {loadFailed && messages.length === 0 ? <View style={{ flex: 1 }} /> : messages.length === 0 ? (
            <View style={styles.emptyMessagesContainer}>
              <View style={styles.emptyIconCircle}>
                <MessageSquare color={Colors.primary} size={32} />
              </View>
              <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('chat.emptySubtitle')}</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessageItem}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {sendError && <Text accessibilityLiveRegion="polite" style={{ color: Colors.danger, padding: 12 }}>{sendError}</Text>}
          <View style={[styles.attachments, !attachmentOptionsVisible && !attachedPhoto && styles.attachmentsHidden]}><PhotoAttachments value={attachedPhoto ? [attachedPhoto] : []}
            onChange={(urls) => setAttachedPhoto(urls[0] || null)} onBusyChange={setUploadingPhoto}
            disabled={sending || !conversation} maxPhotos={1} /></View>
          {/* Input Row */}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={[styles.attachBtn, attachmentOptionsVisible && styles.attachBtnActive]}
              onPress={() => setAttachmentOptionsVisible(previous => !previous)} disabled={sending || uploadingPhoto || !conversation}
              accessibilityRole="button" accessibilityLabel={t('chat.attachPhoto')} aria-expanded={attachmentOptionsVisible}
              accessibilityState={{ expanded: attachmentOptionsVisible, disabled: sending || uploadingPhoto || !conversation }}>
              <Paperclip size={21} color={Colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={t('chat.inputPlaceholder')}
              placeholderTextColor={Colors.textLight}
              value={inputText}
              editable={!sending}
              accessibilityLabel={t('chat.inputPlaceholder')}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!inputText.trim() && !attachedPhoto) || sending || uploadingPhoto || !conversation ? styles.sendBtnDisabled : null,
              ]}
              onPress={handleSendMessage}
              disabled={(!inputText.trim() && !attachedPhoto) || sending || uploadingPhoto || !conversation}
              accessibilityRole="button" accessibilityLabel={t('chat.sendButton')} accessibilityState={{ busy: sending, disabled: (!inputText.trim() && !attachedPhoto) || sending || uploadingPhoto || !conversation }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send color="#FFFFFF" size={18} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    marginTop: 1,
  },
  refreshBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Colors.primaryBg,
  },
  keyboardView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  unverifiedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  unverifiedSub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyMessagesContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  dispatcherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 4,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMe: {
    color: '#FFFFFF',
  },
  messageTextOther: {
    color: Colors.text,
  },
  timeText: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  timeTextMe: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  timeTextOther: {
    color: Colors.textLight,
  },
  photoPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 10,
  },
  photoAttachedText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  removePhotoBtn: {
    padding: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  attachBtn: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  attachBtnActive: { backgroundColor: Colors.primaryLight },
  attachments: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.surface },
  attachmentsHidden: { display: 'none' },
  input: {
    flex: 1,
    minHeight: 48,
    outlineWidth: 0,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
